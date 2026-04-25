import { describe, expect, it } from "vitest";
import { safeTypedHandler } from "./types";
import type {
  McpToolName,
  McpToolResponseRegistry,
  StructuredShape,
  WriteToolResponse,
} from "./response-types";

// ─── Type-level assertions ───────────────────────────────────────────
//
// These `Equals` checks live at compile time — if a future change alters a
// registered type, the corresponding assertion will fail `pnpm typecheck`.
// A tiny runtime `expect(true)` keeps vitest happy and makes the file show up
// in the test report.

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

function assert<T extends true>(_value: T): void {}

describe("response-types — structuredContent shape modelling", () => {
  it("wraps arrays as { items: T[] }", () => {
    assert<Equals<StructuredShape<string[]>, { items: string[] }>>(true);
    assert<Equals<StructuredShape<Array<{ id: number }>>, { items: Array<{ id: number }> }>>(true);
    expect(true).toBe(true);
  });

  it("passes plain objects through unchanged", () => {
    interface Foo { x: number; y: string }
    assert<Equals<StructuredShape<Foo>, Foo>>(true);
    expect(true).toBe(true);
  });

  it("wraps primitives as { value: T }", () => {
    assert<Equals<StructuredShape<number>, { value: number }>>(true);
    assert<Equals<StructuredShape<string>, { value: string }>>(true);
    assert<Equals<StructuredShape<boolean>, { value: boolean }>>(true);
    expect(true).toBe(true);
  });

  it("maps null/undefined to undefined", () => {
    assert<Equals<StructuredShape<null>, undefined>>(true);
    assert<Equals<StructuredShape<undefined>, undefined>>(true);
    expect(true).toBe(true);
  });
});

describe("response-types — shared write-tool shape", () => {
  it("WriteToolResponse extends WriteResult with changeId", () => {
    const sample: WriteToolResponse = {
      success: true,
      action: "pause_keyword",
      entityId: "123",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
      changeId: 42,
    };
    expect(sample.changeId).toBe(42);
  });

  it("every write-tool alias resolves to WriteToolResponse", () => {
    // Sampling representative aliases — TypeScript enforces the rest via the
    // registry's Equals checks below.
    type _a = Equals<McpToolResponseRegistry["pauseKeyword"], WriteToolResponse>;
    type _b = Equals<McpToolResponseRegistry["bulkUpdateBids"], WriteToolResponse>;
    type _c = Equals<McpToolResponseRegistry["createCampaign"], WriteToolResponse>;
    assert<_a>(true);
    assert<_b>(true);
    assert<_c>(true);
    expect(true).toBe(true);
  });
});

describe("response-types — registry completeness", () => {
  it("registry covers every tool name the MCP server registers", () => {
    // The `Record<McpToolName, true>` constraint enforces bidirectional
    // coverage at compile time: missing a name OR adding one not present in
    // `McpToolResponseRegistry` fails `pnpm typecheck`. The runtime test then
    // just guards against copy-paste duplicates.
    const TOOL_NAMES: Record<McpToolName, true> = {
      // Read tools (specialized, non-GAQL)
      searchGeoTargets: true,
      getRecommendations: true,
      getChanges: true,
      reviewChangeImpact: true,
      getResourceMetadata: true,
      listQueryableResources: true,
      getKeywordIdeas: true,
      listKeywords: true,
      listConnectedAccounts: true,
      // Code mode
      runScript: true,
      // Write tools
      pauseKeyword: true,
      enableKeyword: true,
      addKeyword: true,
      updateBid: true,
      addNegativeKeyword: true,
      removeNegativeKeyword: true,
      updateCampaignBudget: true,
      createCampaign: true,
      pauseCampaign: true,
      enableCampaign: true,
      removeCampaign: true,
      setTrackingTemplate: true,
      createAdGroup: true,
      createAd: true,
      pauseAd: true,
      enableAd: true,
      removeAd: true,
      updateAdFinalUrl: true,
      updateAdAssets: true,
      bulkUpdateBids: true,
      bulkPauseKeywords: true,
      bulkAddKeywords: true,
      moveKeywords: true,
      renameCampaign: true,
      renameAdGroup: true,
      updateCampaignBidding: true,
      updateCampaignGoals: true,
      updateCampaignSettings: true,
      createConversionAction: true,
      updateConversionAction: true,
      uploadClickConversions: true,
      setGuardrails: true,
      getGuardrails: true,
      pausePmaxAssetGroup: true,
      enablePmaxAssetGroup: true,
      updateCampaignLanguages: true,
      createCalloutAsset: true,
      linkCalloutToAccount: true,
      removeCalloutFromAccount: true,
      createBiddingStrategy: true,
      updateBiddingStrategy: true,
      removeBiddingStrategy: true,
      linkCampaignToBiddingStrategy: true,
      createNegativeKeywordList: true,
      removeNegativeKeywordList: true,
      addKeywordToNegativeList: true,
      removeKeywordFromNegativeList: true,
      linkNegativeListToCampaign: true,
      unlinkNegativeListFromCampaign: true,
      undoChange: true,
    };
    const names = Object.keys(TOOL_NAMES);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── safeTypedHandler runtime behaviour ──────────────────────────────

describe("safeTypedHandler", () => {
  it("wraps the return value via typedResult", async () => {
    const handler = safeTypedHandler(async (_args: { id: string }) => ({
      name: "Acme",
      budget: 100,
    }));
    const result = await handler({ id: "1" });
    expect(result.structuredContent).toEqual({ name: "Acme", budget: 100 });
    expect(result.content[0]).toEqual({ type: "text", text: "2 fields" });
  });

  it("applies a custom summary when provided", async () => {
    const handler = safeTypedHandler(
      async () => [1, 2, 3],
      (value) => `${value.length} campaigns loaded`,
    );
    const result = await handler(undefined);
    expect(result.content[0]).toEqual({ type: "text", text: "3 campaigns loaded" });
    expect(result.structuredContent).toEqual({ items: [1, 2, 3] });
  });

  it("catches thrown errors and returns an MCP error response", async () => {
    const handler = safeTypedHandler<{ id: string }, { ok: true }>(async () => {
      throw new Error("upstream failure");
    });
    const result = await handler({ id: "1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "upstream failure" });
  });

  it("propagates null results as structuredContent: undefined", async () => {
    const handler = safeTypedHandler(async (): Promise<null> => null);
    const result = await handler(undefined);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "null" });
  });

  it("enforces handler return type matches declared T", async () => {
    // Compile-time: passing a handler whose return type doesn't match T would
    // be a TS error. This assertion proves the generic flows through.
    interface CampaignSummary {
      total: number;
      active: number;
    }
    const handler = safeTypedHandler<void, CampaignSummary>(async () => ({
      total: 10,
      active: 7,
    }));
    const result = await handler();
    expect(result.structuredContent).toEqual({ total: 10, active: 7 });
  });
});
