import { describe, it, expect } from "vitest";
import {
  dispatchRecommendation,
  isDispatchable,
  DISPATCHABLE_ACTION_TYPES,
  type Recommendation,
  type DispatchResult,
} from "@/lib/audit/recommendations";

// Convenience helper — every successful dispatch case asserts this exact shape.
function expectOk(result: DispatchResult): asserts result is Extract<DispatchResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Expected ok dispatch, got error: ${JSON.stringify(result.error)}`);
  }
}

function expectErr(result: DispatchResult): asserts result is Extract<DispatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error(`Expected error dispatch, got ok`);
  }
}

describe("dispatchRecommendation — happy path per action type", () => {
  it("pause_campaign → pauseCampaign + enableCampaign", () => {
    const rec: Recommendation = { actionType: "pause_campaign", campaignId: "c-1" };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall).toEqual({ tool: "pauseCampaign", args: { campaignId: "c-1" } });
    expect(r.undoToolCall).toEqual({ tool: "enableCampaign", args: { campaignId: "c-1" } });
  });

  it("pause_keyword → pauseKeyword (with campaignId for logging) + enableKeyword (no campaignId)", () => {
    const rec: Recommendation = {
      actionType: "pause_keyword",
      campaignId: "c-1",
      adGroupId: "ag-1",
      criterionId: "kw-1",
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall).toEqual({
      tool: "pauseKeyword",
      args: { campaignId: "c-1", adGroupId: "ag-1", criterionId: "kw-1" },
    });
    // enableKeyword in write-tools.ts only takes adGroupId + criterionId — drift here would break undo.
    expect(r.undoToolCall).toEqual({
      tool: "enableKeyword",
      args: { adGroupId: "ag-1", criterionId: "kw-1" },
    });
  });

  it("add_negative → addNegativeKeyword + removeNegativeKeyword (default matchType=PHRASE)", () => {
    const rec: Recommendation = {
      actionType: "add_negative",
      campaignId: "c-1",
      keyword: "free dental cleaning",
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall).toEqual({
      tool: "addNegativeKeyword",
      args: { campaignId: "c-1", keyword: "free dental cleaning", matchType: "PHRASE" },
    });
    expect(r.undoToolCall).toEqual({
      tool: "removeNegativeKeyword",
      args: { campaignId: "c-1", keyword: "free dental cleaning", matchType: "PHRASE" },
    });
  });

  it("add_negative → respects explicit matchType", () => {
    const rec: Recommendation = {
      actionType: "add_negative",
      campaignId: "c-1",
      keyword: "scrubs",
      matchType: "EXACT",
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall.args.matchType).toBe("EXACT");
    expect(r.undoToolCall.args.matchType).toBe("EXACT");
  });

  it("pause_ad → pauseAd + enableAd (carries campaignId for logging)", () => {
    const rec: Recommendation = {
      actionType: "pause_ad",
      campaignId: "c-1",
      adGroupId: "ag-1",
      adId: "ad-1",
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall).toEqual({
      tool: "pauseAd",
      args: { campaignId: "c-1", adGroupId: "ag-1", adId: "ad-1" },
    });
    expect(r.undoToolCall).toEqual({
      tool: "enableAd",
      args: { campaignId: "c-1", adGroupId: "ag-1", adId: "ad-1" },
    });
  });

  it("update_budget → updateCampaignBudget(proposed) + undo updateCampaignBudget(current)", () => {
    const rec: Recommendation = {
      actionType: "update_budget",
      campaignId: "c-1",
      currentDailyBudgetDollars: 40,
      proposedDailyBudgetDollars: 60,
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall).toEqual({
      tool: "updateCampaignBudget",
      args: { campaignId: "c-1", newDailyBudgetDollars: 60 },
    });
    expect(r.undoToolCall).toEqual({
      tool: "updateCampaignBudget",
      args: { campaignId: "c-1", newDailyBudgetDollars: 40 },
    });
  });

  it("update_bid → updateBid(proposed) + undo updateBid(current)", () => {
    const rec: Recommendation = {
      actionType: "update_bid",
      campaignId: "c-1",
      adGroupId: "ag-1",
      criterionId: "kw-1",
      currentBidDollars: 1.2,
      proposedBidDollars: 1.5,
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall).toEqual({
      tool: "updateBid",
      args: { campaignId: "c-1", adGroupId: "ag-1", criterionId: "kw-1", newBidDollars: 1.5 },
    });
    expect(r.undoToolCall).toEqual({
      tool: "updateBid",
      args: { campaignId: "c-1", adGroupId: "ag-1", criterionId: "kw-1", newBidDollars: 1.2 },
    });
  });
});

describe("dispatchRecommendation — refuses unknown action types", () => {
  it("refuses unknown actionType with structured error", () => {
    const rec = { actionType: "remove_campaign" } as unknown as Recommendation;
    const r = dispatchRecommendation(rec);
    expectErr(r);
    expect(r.error).toEqual({ kind: "unknown_action_type", actionType: "remove_campaign" });
  });

  it("isDispatchable type-guards correctly", () => {
    expect(isDispatchable("pause_campaign")).toBe(true);
    expect(isDispatchable("update_bid")).toBe(true);
    expect(isDispatchable("remove_campaign")).toBe(false);
    expect(isDispatchable("")).toBe(false);
    expect(isDispatchable("PAUSE_CAMPAIGN")).toBe(false); // case-sensitive on purpose
  });

  it("DISPATCHABLE_ACTION_TYPES has all 6 expected types and nothing else", () => {
    expect(Array.from(DISPATCHABLE_ACTION_TYPES).sort()).toEqual(
      ["add_negative", "pause_ad", "pause_campaign", "pause_keyword", "update_bid", "update_budget"],
    );
  });
});

describe("dispatchRecommendation — refuses missing required fields", () => {
  it("pause_campaign without campaignId → missing_field", () => {
    const r = dispatchRecommendation({ actionType: "pause_campaign" });
    expectErr(r);
    expect(r.error).toEqual({ kind: "missing_field", actionType: "pause_campaign", field: "campaignId" });
  });

  it("pause_keyword without adGroupId → missing_field on first missing", () => {
    const r = dispatchRecommendation({
      actionType: "pause_keyword",
      campaignId: "c-1",
      criterionId: "kw-1",
    });
    expectErr(r);
    expect(r.error).toEqual({ kind: "missing_field", actionType: "pause_keyword", field: "adGroupId" });
  });

  it("add_negative without keyword → missing_field", () => {
    const r = dispatchRecommendation({ actionType: "add_negative", campaignId: "c-1" });
    expectErr(r);
    expect(r.error).toEqual({ kind: "missing_field", actionType: "add_negative", field: "keyword" });
  });

  it("pause_ad without adId → missing_field", () => {
    const r = dispatchRecommendation({
      actionType: "pause_ad",
      campaignId: "c-1",
      adGroupId: "ag-1",
    });
    expectErr(r);
    expect(r.error).toEqual({ kind: "missing_field", actionType: "pause_ad", field: "adId" });
  });

  it("update_budget without currentDailyBudgetDollars → missing_field (so undo path is provable)", () => {
    const r = dispatchRecommendation({
      actionType: "update_budget",
      campaignId: "c-1",
      proposedDailyBudgetDollars: 60,
    });
    expectErr(r);
    expect(r.error).toEqual({
      kind: "missing_field",
      actionType: "update_budget",
      field: "currentDailyBudgetDollars",
    });
  });

  it("update_bid without proposedBidDollars → missing_field", () => {
    const r = dispatchRecommendation({
      actionType: "update_bid",
      campaignId: "c-1",
      adGroupId: "ag-1",
      criterionId: "kw-1",
      currentBidDollars: 1.2,
    });
    expectErr(r);
    expect(r.error).toEqual({
      kind: "missing_field",
      actionType: "update_bid",
      field: "proposedBidDollars",
    });
  });

  it("treats empty string as missing (audit pipeline default for unset targeting)", () => {
    const r = dispatchRecommendation({ actionType: "pause_campaign", campaignId: "" });
    expectErr(r);
    expect(r.error).toEqual({ kind: "missing_field", actionType: "pause_campaign", field: "campaignId" });
  });
});

describe("dispatchRecommendation — refuses invalid budget/bid values", () => {
  it("update_budget with proposed=0 → invalid_value (Google Ads requires > 0)", () => {
    const r = dispatchRecommendation({
      actionType: "update_budget",
      campaignId: "c-1",
      currentDailyBudgetDollars: 40,
      proposedDailyBudgetDollars: 0,
    });
    expectErr(r);
    // 0 is treated as missing by requireFields (because v === 0 is falsy in the empty-string check?
    // Actually no — requireFields checks undefined/null/""—not 0. So this hits invalid_value.
    expect(r.error).toEqual({
      kind: "invalid_value",
      actionType: "update_budget",
      field: "proposedDailyBudgetDollars",
      reason: expect.any(String),
    });
  });

  it("update_budget with negative current → invalid_value (no valid undo)", () => {
    const r = dispatchRecommendation({
      actionType: "update_budget",
      campaignId: "c-1",
      currentDailyBudgetDollars: -5,
      proposedDailyBudgetDollars: 60,
    });
    expectErr(r);
    expect(r.error.kind).toBe("invalid_value");
    if (r.error.kind === "invalid_value") {
      expect(r.error.field).toBe("currentDailyBudgetDollars");
    }
  });

  it("update_bid with proposed=0 → invalid_value", () => {
    const r = dispatchRecommendation({
      actionType: "update_bid",
      campaignId: "c-1",
      adGroupId: "ag-1",
      criterionId: "kw-1",
      currentBidDollars: 1.2,
      proposedBidDollars: 0,
    });
    expectErr(r);
    expect(r.error.kind).toBe("invalid_value");
    if (r.error.kind === "invalid_value") {
      expect(r.error.field).toBe("proposedBidDollars");
    }
  });
});

describe("dispatchRecommendation — round-trip property", () => {
  // For pause-class actions (pause/enable, add/remove negative): the undo of the toolCall
  // should restore the original state. We assert this via the inverse-tool-name property.
  it.each([
    ["pause_campaign", "pauseCampaign", "enableCampaign"],
    ["pause_keyword", "pauseKeyword", "enableKeyword"],
    ["add_negative", "addNegativeKeyword", "removeNegativeKeyword"],
    ["pause_ad", "pauseAd", "enableAd"],
  ])("%s: toolCall=%s, undoToolCall=%s", (actionType, expectedTool, expectedUndoTool) => {
    const rec: Recommendation = {
      actionType: actionType as Recommendation["actionType"],
      campaignId: "c-1",
      adGroupId: "ag-1",
      criterionId: "kw-1",
      adId: "ad-1",
      keyword: "test-kw",
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall.tool).toBe(expectedTool);
    expect(r.undoToolCall.tool).toBe(expectedUndoTool);
  });

  it("update_budget round-trip: undoing the proposed restores current", () => {
    const rec: Recommendation = {
      actionType: "update_budget",
      campaignId: "c-1",
      currentDailyBudgetDollars: 40,
      proposedDailyBudgetDollars: 60,
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall.args.newDailyBudgetDollars).toBe(60);
    expect(r.undoToolCall.args.newDailyBudgetDollars).toBe(40);
    // Same tool name on both sides — undo IS another budget update.
    expect(r.toolCall.tool).toBe(r.undoToolCall.tool);
  });

  it("update_bid round-trip: undoing the proposed restores current", () => {
    const rec: Recommendation = {
      actionType: "update_bid",
      campaignId: "c-1",
      adGroupId: "ag-1",
      criterionId: "kw-1",
      currentBidDollars: 1.2,
      proposedBidDollars: 1.5,
    };
    const r = dispatchRecommendation(rec);
    expectOk(r);
    expect(r.toolCall.args.newBidDollars).toBe(1.5);
    expect(r.undoToolCall.args.newBidDollars).toBe(1.2);
  });
});

describe("dispatchRecommendation — purity", () => {
  it("does not mutate the input Recommendation", () => {
    const rec: Recommendation = {
      actionType: "add_negative",
      campaignId: "c-1",
      keyword: "free",
    };
    const before = JSON.stringify(rec);
    dispatchRecommendation(rec);
    expect(JSON.stringify(rec)).toBe(before);
  });

  it("returns deeply-fresh ToolCall objects (no shared refs across calls)", () => {
    const rec: Recommendation = { actionType: "pause_campaign", campaignId: "c-1" };
    const a = dispatchRecommendation(rec);
    const b = dispatchRecommendation(rec);
    expectOk(a);
    expectOk(b);
    expect(a.toolCall).not.toBe(b.toolCall);
    expect(a.toolCall.args).not.toBe(b.toolCall.args);
    expect(a.toolCall).toEqual(b.toolCall);
  });
});
