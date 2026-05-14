/**
 * Regression tests for structured write rejections.
 *
 * Production traces (D0 sequence analysis, 2026-04-25) showed two repeating
 * agent-side failure modes that prose error messages alone could not break:
 *
 *  1. `pauseKeyword` retried 13× on a negative criterion despite the API
 *     explicitly naming `removeNegativeKeyword` in the error.
 *  2. `removeNegativeKeyword` retried 52× against a hallucinated removal plan
 *     because the rejection ("Negative keyword 'X' not found") did not surface
 *     the actual list of negatives on the campaign — so the agent never
 *     realized its plan was built on stale search-term data.
 *
 * The fix: every known-shape rejection ships with a structured `nextTool`
 * routing hint AND a body the agent can pivot off (e.g. "campaign has these
 * negatives: …"). These tests pin that contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMutateResources = vi.fn().mockResolvedValue({
  mutate_operation_responses: [],
});
const mockQuery = vi.fn().mockResolvedValue([]);
const mockCustomer = {
  mutateResources: mockMutateResources,
  query: mockQuery,
};

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer() {
      return mockCustomer;
    }
  },
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("mock-value"),
}));

import {
  pauseKeyword,
  removeNegativeKeyword,
  updateBid,
  updateCampaignBudget,
  type AuthContext,
} from "@/lib/google-ads";

const AUTH: AuthContext = {
  refreshToken: "test-refresh-token",
  customerId: "123-456-7890",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pauseKeyword on a negative criterion", () => {
  it("short-circuits before the API call and returns a removeNegativeKeyword nextTool", async () => {
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222", status: 2, negative: false, keyword: { text: "blue widgets" } } },
      { ad_group_criterion: { criterion_id: "333", status: 2, negative: false, keyword: { text: "red widgets" } } },
      // The target — flagged as a negative, which Google Ads cannot pause.
      { ad_group_criterion: { criterion_id: "999", status: 2, negative: true, keyword: { text: "free stuff" } } },
    ]);

    const result = await pauseKeyword(AUTH, "100", "111", "999");

    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/NEGATIVE keyword/);
    expect(result.error).toMatch(/free stuff/);
    expect(result.nextTool).toEqual({
      name: "removeNegativeKeyword",
      reason: expect.stringContaining("negative"),
      args: { campaignId: "100", keyword: "free stuff" },
    });
  });

  it("pauses normally when the target is a positive enabled keyword", async () => {
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222", status: 2, negative: false, keyword: { text: "blue widgets" } } },
      { ad_group_criterion: { criterion_id: "333", status: 2, negative: false, keyword: { text: "red widgets" } } },
    ]);

    const result = await pauseKeyword(AUTH, "100", "111", "222");

    expect(result.success).toBe(true);
    expect(result.nextTool).toBeUndefined();
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });

  it("runs a targeted fallback query when the campaign has >5000 keywords and the target was beyond the LIMIT cap", async () => {
    // Bulk query returns truncated results — target criterion 999 (a negative)
    // is NOT in the response. Without the fallback, we'd fall through to the
    // mutate, get a Google Ads error, and rely on the catch-block rewrite.
    // With the fallback, we short-circuit pre-API and emit the same structured
    // nextTool hint as the small-campaign path.
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "1", status: 2, negative: false, keyword: { text: "shoe" } } },
      { ad_group_criterion: { criterion_id: "2", status: 2, negative: false, keyword: { text: "boot" } } },
    ]);
    // Targeted fallback query finds the target — and it's a negative.
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "999", status: 2, negative: true, keyword: { text: "free stuff" } } },
    ]);

    const result = await pauseKeyword(AUTH, "100", "111", "999");

    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.nextTool?.name).toBe("removeNegativeKeyword");
    expect(result.nextTool?.args).toEqual({ campaignId: "100", keyword: "free stuff" });
    // Confirm we made BOTH the bulk query and the targeted fallback.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("falls back to the structured hint if the API still rejects (precheck raced an external edit)", async () => {
    // Precheck data is stale: target appears positive…
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222", status: 2, negative: false, keyword: { text: "blue widgets" } } },
      { ad_group_criterion: { criterion_id: "333", status: 2, negative: false, keyword: { text: "red widgets" } } },
    ]);
    // …but the API now reports it's a negative.
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message: "Negative ad group criteria are not updateable",
          error_code: { ad_group_criterion_error: 6 },
        },
      ],
    });

    const result = await pauseKeyword(AUTH, "100", "111", "222");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Call `removeNegativeKeyword`/);
    expect(result.nextTool?.name).toBe("removeNegativeKeyword");
    expect(result.nextTool?.args).toEqual({ campaignId: "100", keyword: "blue widgets" });
  });
});

describe("removeNegativeKeyword on a hallucinated keyword", () => {
  it("surfaces the actual negative list when the requested keyword does not exist", async () => {
    // Campaign has 3 real negatives; agent asked us to remove "wedding" — not in the list.
    mockQuery.mockResolvedValueOnce([
      { campaign_criterion: { criterion_id: "1", keyword: { text: "free", match_type: 3 } } },
      { campaign_criterion: { criterion_id: "2", keyword: { text: "cheap", match_type: 4 } } },
      { campaign_criterion: { criterion_id: "3", keyword: { text: "discount", match_type: 2 } } },
    ]);

    const result = await removeNegativeKeyword(AUTH, "23605004543", "wedding");

    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3 negative keywords/);
    // The actual list is in the rejection so the agent can re-plan.
    expect(result.error).toMatch(/"free" \(PHRASE\)/);
    expect(result.error).toMatch(/"cheap" \(BROAD\)/);
    expect(result.error).toMatch(/"discount" \(EXACT\)/);
    expect(result.error).toMatch(/Re-plan against the actual list/);
  });

  it("labels rows with an unmapped match_type as UNKNOWN, not PHRASE (don't lie)", async () => {
    mockQuery.mockResolvedValueOnce([
      // 99 is not in MATCH_TYPE_NAME — must surface as UNKNOWN, not PHRASE.
      { campaign_criterion: { criterion_id: "1", keyword: { text: "weird", match_type: 99 } } },
    ]);

    const result = await removeNegativeKeyword(AUTH, "23605004543", "missing");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/"weird" \(UNKNOWN\)/);
    expect(result.error).not.toMatch(/"weird" \(PHRASE\)/);
  });

  it("recommends addNegativeKeyword when the campaign has zero negatives at all", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await removeNegativeKeyword(AUTH, "23605004543", "wedding", "PHRASE");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no negative keywords at all/);
    expect(result.nextTool).toEqual({
      name: "addNegativeKeyword",
      reason: expect.stringContaining("No negatives exist"),
      args: { campaignId: "23605004543", keyword: "wedding", matchType: "PHRASE" },
    });
  });

  it("truncates the surfaced list to a sane sample with an overflow count", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      campaign_criterion: {
        criterion_id: String(i + 1),
        keyword: { text: `term${i + 1}`, match_type: 3 },
      },
    }));
    mockQuery.mockResolvedValueOnce(many);

    const result = await removeNegativeKeyword(AUTH, "23605004543", "wedding");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/has 25 negative keywords/);
    expect(result.error).toMatch(/and 5 more/);
    // Sample includes at least the first and 20th, but not the 25th.
    expect(result.error).toMatch(/"term1" \(PHRASE\)/);
    expect(result.error).toMatch(/"term20" \(PHRASE\)/);
    expect(result.error).not.toMatch(/"term25" \(PHRASE\)/);
  });
});

describe("guardrail rejections carry a setGuardrails nextTool", () => {
  it("updateCampaignBudget rejection at +51% returns setGuardrails(0.6)", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { campaign_budget: "customers/1/campaignBudgets/9999" },
        campaign_budget: { amount_micros: 10_000_000 },
      },
    ]);

    const result = await updateCampaignBudget(AUTH, "100", 15_100_000);

    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Budget change of 51%/);
    expect(result.nextTool).toEqual({
      name: "setGuardrails",
      reason: expect.stringContaining("guardrail"),
      args: { maxBudgetChangePct: 0.6 },
    });
  });

  it("updateBid rejection over the bid-change guardrail returns setGuardrails", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { bidding_strategy_type: "MANUAL_CPC" },
        ad_group_criterion: { cpc_bid_micros: 1_000_000, keyword: { text: "shoes" } },
      },
    ]);

    const result = await updateBid(AUTH, "100", "111", "222", 2_000_000);

    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Bid change of 100%/);
    expect(result.nextTool?.name).toBe("setGuardrails");
    expect(result.nextTool?.args).toHaveProperty("maxBidChangePct");
  });

  it("updateBid accepts numeric MANUAL_CPC from the Google Ads API enum", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { bidding_strategy_type: 3 },
        ad_group_criterion: { cpc_bid_micros: 1_000_000, keyword: { text: "shoes" } },
      },
    ]);

    const result = await updateBid(AUTH, "100", "111", "222", 1_100_000);

    expect(result.success).toBe(true);
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });
});
