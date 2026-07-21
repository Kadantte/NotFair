import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SuggestionDraft } from "@/server/db/suggestions";

// Mock at the db-module / analyzer boundary: the engine's own logic is the
// run-state machine, not the X Ads audit or the SQLite writes.
const mocks = vi.hoisted(() => ({
  hasSuggestionsForSource: vi.fn<(slug: string, key: string) => boolean>(),
  replaceOpenSuggestions: vi.fn(),
  listLiveGoals: vi.fn<(slug: string) => Array<{ statement: string }>>(() => []),
  listProjectMcpTokens: vi.fn<(slug: string) => Array<{ server_name: string }>>(
    () => [],
  ),
  auditXadsAccount: vi.fn(),
  xadsSuggestionsFromSnapshot: vi.fn<() => SuggestionDraft[]>(() => []),
}));

vi.mock("@/server/db/suggestions", () => ({
  hasSuggestionsForSource: mocks.hasSuggestionsForSource,
  replaceOpenSuggestions: mocks.replaceOpenSuggestions,
}));
vi.mock("@/server/db/goals", () => ({
  listLiveGoals: mocks.listLiveGoals,
}));
vi.mock("@/server/mcp/tokens", () => ({
  listProjectMcpTokens: mocks.listProjectMcpTokens,
}));
vi.mock("./xads", () => ({
  XADS_SOURCE_KEY: "notfair-xads",
  auditXadsAccount: mocks.auditXadsAccount,
  xadsSuggestionsFromSnapshot: mocks.xadsSuggestionsFromSnapshot,
}));

import {
  analyzableSources,
  anySuggestionRunActive,
  generateSuggestionsForSource,
  listSuggestionRuns,
  maybeAutoGenerate,
  suggestionSourceLabel,
} from "./engine";

// The engine keeps per-project run state in module memory for the process
// lifetime — every test uses a distinct project slug for isolation.
let seq = 0;
const freshSlug = () => `proj-${++seq}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listLiveGoals.mockReturnValue([]);
  mocks.listProjectMcpTokens.mockReturnValue([]);
  mocks.xadsSuggestionsFromSnapshot.mockReturnValue([]);
});

describe("suggestionSourceLabel", () => {
  it("labels known analyzers and returns null otherwise", () => {
    expect(suggestionSourceLabel("notfair-xads")).toBe("X Ads");
    expect(suggestionSourceLabel("notfair-googleads")).toBeNull();
  });
});

describe("generateSuggestionsForSource", () => {
  it("no-ops for a source without an analyzer", async () => {
    const slug = freshSlug();
    await generateSuggestionsForSource(slug, "notfair-googleads");
    expect(listSuggestionRuns(slug)).toEqual([]);
    expect(mocks.replaceOpenSuggestions).not.toHaveBeenCalled();
  });

  it("runs the analyzer, refreshes open suggestions, and records done", async () => {
    const slug = freshSlug();
    const drafts = [{ title: "Fix wasted spend" }] as unknown as SuggestionDraft[];
    mocks.listLiveGoals.mockReturnValue([{ statement: "Grow clicks" }]);
    mocks.auditXadsAccount.mockResolvedValue({ ok: true });
    mocks.xadsSuggestionsFromSnapshot.mockReturnValue(drafts);

    await generateSuggestionsForSource(slug, "notfair-xads");

    expect(mocks.auditXadsAccount).toHaveBeenCalledWith(slug);
    expect(mocks.xadsSuggestionsFromSnapshot).toHaveBeenCalledWith(
      { ok: true },
      ["Grow clicks"],
    );
    expect(mocks.replaceOpenSuggestions).toHaveBeenCalledWith(
      slug,
      "notfair-xads",
      drafts,
    );
    const runs = listSuggestionRuns(slug);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      source_key: "notfair-xads",
      label: "X Ads",
      status: "done",
    });
    expect(runs[0]!.finished_at).toBeTypeOf("number");
    expect(anySuggestionRunActive(slug)).toBe(false);
  });

  it("records a failed run with the error message instead of throwing", async () => {
    const slug = freshSlug();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.auditXadsAccount.mockRejectedValue(new Error("bearer expired"));

    await generateSuggestionsForSource(slug, "notfair-xads");

    expect(listSuggestionRuns(slug)[0]).toMatchObject({
      status: "failed",
      error: "bearer expired",
    });
    expect(mocks.replaceOpenSuggestions).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("ignores a second trigger while a run is live", async () => {
    const slug = freshSlug();
    let finish!: (v: unknown) => void;
    mocks.auditXadsAccount.mockReturnValue(new Promise((r) => (finish = r)));

    const first = generateSuggestionsForSource(slug, "notfair-xads");
    expect(anySuggestionRunActive(slug)).toBe(true);

    // Re-trigger mid-flight: must not start a second audit.
    await generateSuggestionsForSource(slug, "notfair-xads");
    expect(mocks.auditXadsAccount).toHaveBeenCalledTimes(1);

    finish({});
    await first;
    expect(listSuggestionRuns(slug)[0]!.status).toBe("done");
  });
});

describe("analyzableSources", () => {
  it("keeps only connected sources that have an analyzer", () => {
    const slug = freshSlug();
    mocks.listProjectMcpTokens.mockReturnValue([
      { server_name: "notfair-xads" },
      { server_name: "notfair-googleads" },
    ]);
    expect(analyzableSources(slug)).toEqual(["notfair-xads"]);
  });
});

describe("maybeAutoGenerate", () => {
  it("kicks off analysis for a connected source with no prior suggestions", async () => {
    const slug = freshSlug();
    mocks.listProjectMcpTokens.mockReturnValue([{ server_name: "notfair-xads" }]);
    mocks.hasSuggestionsForSource.mockReturnValue(false);
    mocks.auditXadsAccount.mockResolvedValue({});

    maybeAutoGenerate(slug);
    // Fire-and-forget: wait for the promise chain to settle.
    await vi.waitFor(() =>
      expect(listSuggestionRuns(slug)[0]?.status).toBe("done"),
    );
    expect(mocks.auditXadsAccount).toHaveBeenCalledTimes(1);
  });

  it("skips sources that already have suggestion rows", () => {
    const slug = freshSlug();
    mocks.listProjectMcpTokens.mockReturnValue([{ server_name: "notfair-xads" }]);
    mocks.hasSuggestionsForSource.mockReturnValue(true);

    maybeAutoGenerate(slug);
    expect(mocks.auditXadsAccount).not.toHaveBeenCalled();
    expect(listSuggestionRuns(slug)).toEqual([]);
  });

  it("skips sources already attempted this process lifetime", async () => {
    const slug = freshSlug();
    mocks.listProjectMcpTokens.mockReturnValue([{ server_name: "notfair-xads" }]);
    mocks.hasSuggestionsForSource.mockReturnValue(false);
    mocks.auditXadsAccount.mockResolvedValue({});

    await generateSuggestionsForSource(slug, "notfair-xads");
    mocks.auditXadsAccount.mockClear();

    maybeAutoGenerate(slug);
    expect(mocks.auditXadsAccount).not.toHaveBeenCalled();
  });
});
