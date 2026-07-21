import { describe, expect, it } from "vitest";

import type { TranscriptEvent } from "@/server/sessions/transcript-tail";
import type { ToolEntry } from "./transcript-model";
import {
  WRAPPING_STALE_MS,
  buildPhases,
  deriveWorkingView,
  humanLifecyclePhase,
} from "./working-view";

const NOW = 1_800_000_000_000;

const text = (id: string, ts: number, body = "hello"): TranscriptEvent => ({
  kind: "assistant_text",
  id,
  ts,
  body,
});
const userMsg = (id: string, ts: number): TranscriptEvent => ({
  kind: "user_message",
  id,
  ts,
  body: "hi",
});
const call = (
  id: string,
  ts: number,
  tcid: string,
  name = "shell",
  label: string | null = "ls src",
): TranscriptEvent => ({ kind: "tool_call", id, ts, tool_call_id: tcid, name, label });
const result = (
  id: string,
  ts: number,
  tcid: string,
  ok = true,
  name = "shell",
): TranscriptEvent => ({
  kind: "tool_result",
  id,
  ts,
  tool_call_id: tcid,
  name,
  summary: null,
  ok,
});
const lifecycle = (id: string, ts: number, phase: string): TranscriptEvent => ({
  kind: "lifecycle",
  id,
  ts,
  phase,
});

const pendingTool = (over: Partial<ToolEntry> = {}): ToolEntry => ({
  toolCallId: "p1",
  name: "mcp__X__runScript",
  label: null,
  result: null,
  ok: true,
  done: false,
  ...over,
});

function derive(over: Partial<Parameters<typeof deriveWorkingView>[0]> = {}) {
  return deriveWorkingView({
    agentDisplayName: "Agent",
    events: [],
    lifecyclePhase: null,
    pendingTools: [],
    hasPendingAssistant: false,
    turnStartedAt: null,
    now: NOW,
    ...over,
  });
}

describe("deriveWorkingView", () => {
  it("reports Turn complete once the lifecycle done event lands", () => {
    const view = derive({ events: [lifecycle("l1", NOW - 1000, "done")] });
    expect(view).toMatchObject({ headline: "Turn complete", mood: "ended" });
  });

  it("keeps working while a pending tool is still in flight past done", () => {
    const view = derive({
      events: [lifecycle("l1", NOW - 1000, "done")],
      pendingTools: [pendingTool()],
    });
    expect(view.mood).toBe("tool");
  });

  it("puts an in-flight SSE tool front and center", () => {
    const view = derive({
      pendingTools: [pendingTool({ name: "shell", label: "git status" })],
    });
    expect(view).toMatchObject({ headline: "Ran git status", mood: "tool" });
  });

  it("shows Writing the response while assistant text streams, with last tool subtitle", () => {
    const view = derive({
      hasPendingAssistant: true,
      pendingTools: [pendingTool({ done: true, ok: true, label: "pnpm test", name: "shell" })],
    });
    expect(view.headline).toBe("Writing the response");
    expect(view.mood).toBe("writing");
    expect(view.subtitle).toBe("Ran tests ✓");
  });

  it("bridges the between-tools gap as Thinking with the last outcome", () => {
    const ok = derive({
      pendingTools: [pendingTool({ done: true, ok: true, name: "mcp__X__runScript" })],
    });
    expect(ok).toMatchObject({ headline: "Thinking", mood: "waiting" });
    expect(ok.subtitle).toBe("Ran script ✓ — picking next step");

    const failed = derive({
      pendingTools: [pendingTool({ done: true, ok: false, name: "mcp__X__runScript" })],
    });
    expect(failed.subtitle).toBe("Ran script failed — picking next step");
  });

  it("promotes the lifecycle phase to the headline before any events", () => {
    expect(derive({}).headline).toBe("Starting");
    expect(derive({ lifecyclePhase: "run.start" }).headline).toBe(
      "Calling the model",
    );
    expect(
      derive({ events: [userMsg("u1", NOW - 500)], lifecyclePhase: "run.warming" })
        .headline,
    ).toBe("Warming up");
  });

  it("treats a committed unanswered tool_call as the active phase", () => {
    const view = derive({
      events: [userMsg("u1", NOW - 3000), call("c1", NOW - 1000, "t1")],
    });
    expect(view).toMatchObject({ headline: "Listed files", mood: "tool" });
    expect(view.subtitle).toBe("src");
  });

  it("does not treat an answered tool_call as in flight", () => {
    // result precedes the call in the log (out-of-order write) — the call is
    // still the last event but it already has its result.
    const view = derive({
      events: [result("r1", NOW - 2000, "t1"), call("c1", NOW - 1000, "t1")],
    });
    expect(view.mood).not.toBe("tool");
  });

  it("shows Thinking after a committed tool_result", () => {
    const ok = derive({
      events: [call("c1", NOW - 2000, "t1"), result("r1", NOW - 1000, "t1", true)],
    });
    expect(ok.headline).toBe("Thinking");
    expect(ok.subtitle).toBe("Ran shell ✓ — picking next step");

    const failed = derive({
      events: [call("c1", NOW - 2000, "t1"), result("r1", NOW - 1000, "t1", false)],
    });
    expect(failed.subtitle).toBe("Ran shell failed — retrying");
  });

  it("wraps up on a fresh trailing assistant message", () => {
    const view = derive({
      events: [
        call("c1", NOW - 5000, "t1"),
        result("r1", NOW - 4000, "t1"),
        text("a1", NOW - 1000),
      ],
    });
    expect(view).toMatchObject({ headline: "Wrapping up", mood: "wrapping" });
    // Subtitle falls back to the committed tool result.
    expect(view.subtitle).toBe("Ran shell ✓");
  });

  it("goes honest once the trailing message is stale", () => {
    const view = derive({
      events: [text("a1", NOW - WRAPPING_STALE_MS - 5_000)],
    });
    expect(view.headline).toBe("Still working");
    expect(view.subtitle).toContain("quiet for 35s");

    const minutes = derive({ events: [text("a1", NOW - 240_000)] });
    expect(minutes.subtitle).toContain("quiet for 4m");
  });

  it("scopes events to the current turn via turnStartedAt", () => {
    const view = derive({
      // Old turn had a tool; the new turn hasn't produced events yet.
      events: [call("c1", NOW - 100_000, "t1"), result("r1", NOW - 99_000, "t1")],
      turnStartedAt: NOW - 1_000,
    });
    expect(view.headline).toBe("Starting");
    expect(view.phases).toHaveLength(0);
  });
});

describe("buildPhases", () => {
  it("orders committed tools first and appends unseen pending tools", () => {
    const phases = buildPhases(
      [call("c1", NOW - 3000, "t1", "shell", "git status"), result("r1", NOW - 2000, "t1", true)],
      [
        pendingTool({ toolCallId: "t1" }), // already committed — skipped
        pendingTool({ toolCallId: "t2", name: "mcp__X__runScript", label: "audit" }),
      ],
    );
    expect(phases).toHaveLength(2);
    expect(phases[0]).toMatchObject({ id: "t1", label: "Ran git status", state: "done" });
    expect(phases[1]).toMatchObject({
      id: "t2",
      label: "Ran script",
      state: "active",
      detail: "audit",
    });
  });

  it("keeps an orphan committed result as a done phase and marks failures", () => {
    const phases = buildPhases([result("r1", NOW, "t9", false, "shell")], []);
    expect(phases).toEqual([
      { id: "t9", label: "Ran shell", state: "failed" },
    ]);
  });

  it("demotes every active phase except the last", () => {
    const phases = buildPhases(
      [],
      [
        pendingTool({ toolCallId: "t1", done: false }),
        pendingTool({ toolCallId: "t2", done: false }),
      ],
    );
    expect(phases.map((p) => p.state)).toEqual(["done", "active"]);
  });
});

describe("humanLifecyclePhase", () => {
  it("maps known phases and falls back generically", () => {
    expect(humanLifecyclePhase("run.warming")).toBe("Warming up");
    expect(humanLifecyclePhase("context.compact")).toBe("Compacting context");
    expect(humanLifecyclePhase("start")).toBe("Calling the model");
    expect(humanLifecyclePhase("turn.start")).toBe("Calling the model");
    expect(humanLifecyclePhase("run.end")).toBe("Finishing up");
    expect(humanLifecyclePhase("turn.complete")).toBe("Finishing up");
    expect(humanLifecyclePhase("v2.mystery")).toBe("Starting up");
  });
});
