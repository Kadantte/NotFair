import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockMutateResources, mockQuery } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
  mockMutateResources: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn((name: string) => `${name.toLowerCase()}-value`),
}));

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer = mockCustomerFactory;
  },
}));

import {
  addNegativeKeyword,
  bulkPauseKeywords,
  DEFAULT_GUARDRAILS,
  moveKeywords,
  preValidateBulkMutation,
} from "@/lib/google-ads";

const auth = { refreshToken: "rt", customerId: "130-126-5570" };

// Helper builder for the pause/update_bid prevalidation row shape — keeps
// individual tests focused on the field they care about.
function critRow(overrides: {
  campaignId?: string;
  campaignStatus?: number; // 2=ENABLED, 3=PAUSED, 4=REMOVED
  biddingStrategy?: string | number;
  adGroupId?: string;
  adGroupStatus?: number;
  criterionId?: string;
  criterionStatus?: number;
  cpcBidMicros?: number;
  negative?: boolean;
  matchType?: number;
  keywordText?: string;
} = {}) {
  return {
    campaign: {
      id: overrides.campaignId ?? "100",
      status: overrides.campaignStatus ?? 2,
      bidding_strategy_type: overrides.biddingStrategy ?? "MANUAL_CPC",
    },
    ad_group: {
      id: overrides.adGroupId ?? "111",
      status: overrides.adGroupStatus ?? 2,
    },
    ad_group_criterion: {
      criterion_id: overrides.criterionId ?? "222",
      status: overrides.criterionStatus ?? 2,
      cpc_bid_micros: overrides.cpcBidMicros ?? 1_000_000,
      negative: overrides.negative ?? false,
      keyword: {
        text: overrides.keywordText ?? "running shoes",
        match_type: overrides.matchType ?? 4,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCustomerFactory.mockReturnValue({
    mutateResources: mockMutateResources,
    query: mockQuery,
  });
  mockMutateResources.mockResolvedValue({ mutate_operation_responses: [] });
  mockQuery.mockResolvedValue([]);
});

describe("preValidateBulkMutation('pause_keyword')", () => {
  it("classifies a happy-path criterion as valid (no issues, ok=true)", async () => {
    // Two waves: per-criterion query, then active-count query (5 active keeps us under)
    mockQuery
      .mockResolvedValueOnce([critRow()])
      .mockResolvedValueOnce([{}, {}, {}, {}, {}]);

    const result = await preValidateBulkMutation(auth, "pause_keyword", [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
    ]);

    expect(result.ok).toBe(true);
    expect(result.invalid).toEqual([]);
    expect(result.valid).toHaveLength(1);
  });

  it("returns ENTITY_NOT_FOUND when the criterion isn't in the query result", async () => {
    // Empty per-criterion result; second wave never fires because no valid items survive
    mockQuery.mockResolvedValueOnce([]);

    const result = await preValidateBulkMutation(auth, "pause_keyword", [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "ENTITY_NOT_FOUND", severity: "error", criterionId: "222" }),
    ]);
  });

  it("returns NEGATIVE_KEYWORDS_CANNOT_PAUSE with nextTool=removeNegativeKeyword for negative criterion", async () => {
    // Negative criteria can't be paused — short-circuit before active-count query
    mockQuery.mockResolvedValueOnce([critRow({ negative: true })]);

    const result = await preValidateBulkMutation(auth, "pause_keyword", [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      expect.objectContaining({
        code: "NEGATIVE_KEYWORDS_CANNOT_PAUSE",
        severity: "error",
        nextTool: expect.objectContaining({ name: "removeNegativeKeyword" }),
      }),
    ]);
  });

  it("returns ALREADY_PAUSED when criterion.status === 3", async () => {
    mockQuery.mockResolvedValueOnce([critRow({ criterionStatus: 3 })]);

    const result = await preValidateBulkMutation(auth, "pause_keyword", [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "ALREADY_PAUSED", severity: "error" }),
    ]);
  });

  it("returns PARENT_CAMPAIGN_REMOVED when campaign.status === 4", async () => {
    mockQuery.mockResolvedValueOnce([critRow({ campaignStatus: 4 })]);

    const result = await preValidateBulkMutation(auth, "pause_keyword", [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
    ]);

    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "PARENT_CAMPAIGN_REMOVED", severity: "error" }),
    ]);
  });

  it("returns PARENT_AD_GROUP_REMOVED when ad_group.status === 4 (and campaign is fine)", async () => {
    // Campaign status 2 (ENABLED) so it doesn't short-circuit on PARENT_CAMPAIGN_REMOVED
    mockQuery.mockResolvedValueOnce([critRow({ adGroupStatus: 4 })]);

    const result = await preValidateBulkMutation(auth, "pause_keyword", [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
    ]);

    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "PARENT_AD_GROUP_REMOVED", severity: "error" }),
    ]);
  });

  it("returns WOULD_LEAVE_CAMPAIGN_WITH_NO_ACTIVE_KEYWORDS when requested count >= active count", async () => {
    // Submit 3 pause requests; active-count query returns 3 active → would leave none
    const rows = [
      critRow({ criterionId: "222", adGroupId: "111" }),
      critRow({ criterionId: "223", adGroupId: "111" }),
      critRow({ criterionId: "224", adGroupId: "111" }),
    ];
    mockQuery
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([{}, {}, {}]); // 3 active positives

    const result = await preValidateBulkMutation(auth, "pause_keyword", [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
      { campaignId: "100", adGroupId: "111", criterionId: "223" },
      { campaignId: "100", adGroupId: "111", criterionId: "224" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toHaveLength(3);
    for (const issue of result.invalid) {
      expect(issue.code).toBe("WOULD_LEAVE_CAMPAIGN_WITH_NO_ACTIVE_KEYWORDS");
    }
    expect(result.valid).toHaveLength(0);
  });
});

describe("preValidateBulkMutation('update_bid')", () => {
  it("classifies a happy MANUAL_CPC bid as valid", async () => {
    mockQuery.mockResolvedValueOnce([critRow({ cpcBidMicros: 1_000_000 })]);

    const result = await preValidateBulkMutation(auth, "update_bid", [
      { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 1.1 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.invalid).toEqual([]);
    expect(result.valid).toHaveLength(1);
  });

  it("emits SMART_BIDDING_MANUAL_BID_OVERRIDE warning (not error) for MAXIMIZE_CONVERSIONS strategy", async () => {
    // Smart bidding strategies still allow the validation to pass (warning, not error)
    mockQuery.mockResolvedValueOnce([
      critRow({ biddingStrategy: "MAXIMIZE_CONVERSIONS", cpcBidMicros: 1_000_000 }),
    ]);

    const result = await preValidateBulkMutation(auth, "update_bid", [
      { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 1.1 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "SMART_BIDDING_MANUAL_BID_OVERRIDE", severity: "warning" }),
    ]);
    expect(result.valid).toHaveLength(1);
  });

  it("errors INVALID_BID for newBidDollars=0", async () => {
    mockQuery.mockResolvedValueOnce([critRow()]);

    const result = await preValidateBulkMutation(auth, "update_bid", [
      { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 0 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INVALID_BID", severity: "error" })]),
    );
  });

  it("errors BID_CHANGE_EXCEEDS_GUARDRAIL when delta exceeds maxBidChangePct", async () => {
    // Current bid $1.00, request $2.00 = +100% > tight 5% guardrail
    mockQuery.mockResolvedValueOnce([critRow({ cpcBidMicros: 1_000_000 })]);

    const result = await preValidateBulkMutation(
      auth,
      "update_bid",
      [{ campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 2.0 }],
      { ...DEFAULT_GUARDRAILS, maxBidChangePct: 0.05 },
    );

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "BID_CHANGE_EXCEEDS_GUARDRAIL", severity: "error" }),
      ]),
    );
  });

  it("errors NEGATIVE_KEYWORDS_HAVE_NO_BID for negative criterion under update_bid", async () => {
    mockQuery.mockResolvedValueOnce([critRow({ negative: true })]);

    const result = await preValidateBulkMutation(auth, "update_bid", [
      { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 1.1 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      expect.objectContaining({
        code: "NEGATIVE_KEYWORDS_HAVE_NO_BID",
        severity: "error",
        nextTool: expect.objectContaining({ name: "removeNegativeKeyword" }),
      }),
    ]);
  });

  it("normalizes numeric bidding_strategy_type returned by API (e.g. 3 -> MANUAL_CPC)", async () => {
    // Numeric 3 = MANUAL_CPC; should NOT trigger SMART_BIDDING warning
    mockQuery.mockResolvedValueOnce([critRow({ biddingStrategy: 3, cpcBidMicros: 1_000_000 })]);

    const result = await preValidateBulkMutation(auth, "update_bid", [
      { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 1.1 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.invalid).toEqual([]);
  });
});

describe("preValidateBulkMutation('add_keyword')", () => {
  // Helper for the keyword_view rows the add-keyword path queries for dup detection
  function existingKw(overrides: {
    campaignStatus?: number;
    adGroupId?: string;
    adGroupStatus?: number;
    criterionId?: string;
    negative?: boolean;
    text?: string;
    matchType?: number;
  } = {}) {
    return {
      campaign: { id: "100", status: overrides.campaignStatus ?? 2 },
      ad_group: { id: overrides.adGroupId ?? "111", status: overrides.adGroupStatus ?? 2 },
      ad_group_criterion: {
        criterion_id: overrides.criterionId ?? "999",
        negative: overrides.negative ?? false,
        keyword: {
          text: overrides.text ?? "running shoes",
          match_type: overrides.matchType ?? 4,
        },
      },
    };
  }

  it("errors INVALID_KEYWORD_SYNTAX when keyword.trim() is empty", async () => {
    mockQuery.mockResolvedValueOnce([existingKw()]);

    const result = await preValidateBulkMutation(auth, "add_keyword", [
      { campaignId: "100", adGroupId: "111", keyword: "   ", matchType: "BROAD" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "INVALID_KEYWORD_SYNTAX", severity: "error" }),
    ]);
  });

  it("errors INVALID_KEYWORD_SYNTAX when keyword has more than 10 words", async () => {
    mockQuery.mockResolvedValueOnce([existingKw()]);

    const result = await preValidateBulkMutation(auth, "add_keyword", [
      {
        campaignId: "100",
        adGroupId: "111",
        keyword: "one two three four five six seven eight nine ten eleven",
        matchType: "BROAD",
      },
    ]);

    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "INVALID_KEYWORD_SYNTAX", severity: "error" }),
    ]);
  });

  it("errors CONFLICTS_WITH_NEGATIVE with nextTool=removeNegativeKeyword when same text exists as negative", async () => {
    mockQuery.mockResolvedValueOnce([
      existingKw({ negative: true, text: "running shoes", matchType: 4 }),
    ]);

    const result = await preValidateBulkMutation(auth, "add_keyword", [
      { campaignId: "100", adGroupId: "111", keyword: "running shoes", matchType: "BROAD" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      expect.objectContaining({
        code: "CONFLICTS_WITH_NEGATIVE",
        severity: "error",
        nextTool: expect.objectContaining({ name: "removeNegativeKeyword" }),
      }),
    ]);
  });

  it("errors DUPLICATE_IN_AD_GROUP when keyword+matchType already exists in target ad group", async () => {
    mockQuery.mockResolvedValueOnce([
      existingKw({ adGroupId: "111", text: "running shoes", matchType: 4 }),
    ]);

    const result = await preValidateBulkMutation(auth, "add_keyword", [
      { campaignId: "100", adGroupId: "111", keyword: "running shoes", matchType: "BROAD" },
    ]);

    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "DUPLICATE_IN_AD_GROUP", severity: "error" }),
    ]);
  });

  it("errors DUPLICATE_IN_CAMPAIGN when keyword+matchType exists in a different ad group of the same campaign", async () => {
    // Existing kw is in ad group 222; we're adding to 111 in the same campaign
    mockQuery.mockResolvedValueOnce([
      existingKw({ adGroupId: "222", text: "running shoes", matchType: 4 }),
    ]);

    const result = await preValidateBulkMutation(auth, "add_keyword", [
      { campaignId: "100", adGroupId: "111", keyword: "running shoes", matchType: "BROAD" },
    ]);

    expect(result.invalid).toEqual([
      expect.objectContaining({ code: "DUPLICATE_IN_CAMPAIGN", severity: "error" }),
    ]);
  });

  it("errors DUPLICATE_IN_REQUEST when caller submits the same keyword+matchType twice; both flagged", async () => {
    // No existing keywords — pure in-request duplicate
    mockQuery.mockResolvedValueOnce([]);

    const result = await preValidateBulkMutation(auth, "add_keyword", [
      { campaignId: "100", adGroupId: "111", keyword: "running shoes", matchType: "BROAD" },
      { campaignId: "100", adGroupId: "111", keyword: "running shoes", matchType: "BROAD" },
    ]);

    expect(result.ok).toBe(false);
    const dupes = result.invalid.filter((i) => i.code === "DUPLICATE_IN_REQUEST");
    expect(dupes).toHaveLength(2);
    // Both items are removed from valid
    expect(result.valid).toHaveLength(0);
  });

  it("collapses whitespace + lowercase before duplicate detection", async () => {
    // "Running   Shoes" and " running shoes " should normalize to the same signature
    mockQuery.mockResolvedValueOnce([]);

    const result = await preValidateBulkMutation(auth, "add_keyword", [
      { campaignId: "100", adGroupId: "111", keyword: "Running   Shoes", matchType: "BROAD" },
      { campaignId: "100", adGroupId: "111", keyword: " running shoes ", matchType: "BROAD" },
    ]);

    const dupes = result.invalid.filter((i) => i.code === "DUPLICATE_IN_REQUEST");
    expect(dupes).toHaveLength(2);
  });
});

describe("bulkPauseKeywords — partial_failure decoding", () => {
  it("passes {partial_failure: true} to mutateResources", async () => {
    // 5 active keywords in campaign; we pause 2 → guardrail OK
    mockQuery.mockResolvedValueOnce([{}, {}, {}, {}, {}]);
    mockMutateResources.mockResolvedValueOnce({ mutate_operation_responses: [{}, {}] });

    await bulkPauseKeywords(auth, [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
      { campaignId: "100", adGroupId: "111", criterionId: "223" },
    ]);

    expect(mockMutateResources).toHaveBeenCalledWith(expect.any(Array), { partial_failure: true });
  });

  it("decodes per-index failures via partial_failure_error.errors[].location.field_path_elements[0].index", async () => {
    // Index 0 fails (negative criterion mixed in), index 1 succeeds
    mockQuery.mockResolvedValueOnce([{}, {}, {}, {}, {}]);
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [{}, {}],
      partial_failure_error: {
        errors: [
          {
            message: "Negative ad group criteria are not updateable",
            location: { field_path_elements: [{ index: 0 }] },
          },
        ],
      },
    });

    const results = await bulkPauseKeywords(auth, [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
      { campaignId: "100", adGroupId: "111", criterionId: "223" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });
});

describe("withDatabaseContentionRetry (probed via moveKeywords)", () => {
  // moveKeywords flow: customer.query (lookup) → addKeyword (which itself calls
  // mutateResources) → pauseKeyword (precheck queries + mutateResources). The
  // contention retry wraps the addKeyword and pauseKeyword *WriteResult-returning*
  // ops, retrying when result.error matches the database_error=2 pattern.

  it("retries on database_error=2 result and succeeds on second attempt", async () => {
    // Step 1: moveKeywords lookup query — returns 1 keyword (criterionId 222)
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_criterion: {
          criterion_id: "222",
          keyword: { text: "running shoes", match_type: 4 },
        },
      },
    ]);

    // Step 2: addKeyword first attempt fails with database_error=2 (retry kicks in),
    // second attempt succeeds. addKeyword internally calls mutateResources (no
    // upstream query).
    mockMutateResources
      .mockRejectedValueOnce(new Error("database_error=2 transient"))
      .mockResolvedValueOnce({
        mutate_operation_responses: [
          { ad_group_criterion_result: { resource_name: "customers/1301265570/adGroupCriteria/333~444" } },
        ],
      });

    // Step 3: pauseKeyword prechecks: bulk query (returns target as positive), then mutate
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_criterion: {
          criterion_id: "222",
          keyword: { text: "running shoes" },
          status: 2,
          negative: false,
        },
      },
      // second positive so totalActive > 1 (otherwise pause is rejected)
      {
        ad_group_criterion: {
          criterion_id: "555",
          keyword: { text: "other" },
          status: 2,
          negative: false,
        },
      },
    ]);
    mockMutateResources.mockResolvedValueOnce({}); // pause succeeds first try

    const result = await moveKeywords(auth, "100", "111", "112", ["222"]);

    expect(result.added).toHaveLength(1);
    expect(result.added[0].success).toBe(true);
    // First addKeyword attempt failed, second succeeded → 2 calls for the add,
    // plus 1 call for the pause = 3 total mutateResources calls
    expect(mockMutateResources).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry when error is a different code", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_criterion: {
          criterion_id: "222",
          keyword: { text: "running shoes", match_type: 4 },
        },
      },
    ]);

    // addKeyword fails with a non-retryable error
    mockMutateResources.mockRejectedValueOnce(new Error("invalid_argument: something else"));

    const result = await moveKeywords(auth, "100", "111", "112", ["222"]);

    expect(result.added[0].success).toBe(false);
    // Only 1 mutateResources call — no retry. pauseKeyword is skipped because
    // moveKeywords only pauses successfully-added keywords.
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });

  it("returns immediately on first-attempt success", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_criterion: {
          criterion_id: "222",
          keyword: { text: "running shoes", match_type: 4 },
        },
      },
    ]);

    // addKeyword succeeds first try
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { ad_group_criterion_result: { resource_name: "customers/1301265570/adGroupCriteria/333~444" } },
      ],
    });

    // pauseKeyword precheck + mutate
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_criterion: { criterion_id: "222", keyword: { text: "running shoes" }, status: 2, negative: false },
      },
      {
        ad_group_criterion: { criterion_id: "555", keyword: { text: "other" }, status: 2, negative: false },
      },
    ]);
    mockMutateResources.mockResolvedValueOnce({});

    const result = await moveKeywords(auth, "100", "111", "112", ["222"]);

    expect(result.success).toBe(true);
    // Exactly 1 add + 1 pause mutate, no retries
    expect(mockMutateResources).toHaveBeenCalledTimes(2);
  });
});

describe("addNegativeKeyword database contention retry", () => {
  it("retries transient database_error=2 and succeeds", async () => {
    mockMutateResources
      .mockRejectedValueOnce(new Error("Multiple requests were attempting to modify the same resource at once. Retry the request. (database_error=2)"))
      .mockResolvedValueOnce({});

    const result = await addNegativeKeyword(auth, "100", "competitor", "BROAD");

    expect(result.success).toBe(true);
    expect(mockMutateResources).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-contention errors", async () => {
    mockMutateResources.mockRejectedValueOnce(new Error("invalid_argument: bad keyword"));

    const result = await addNegativeKeyword(auth, "100", "bad keyword", "BROAD");

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid_argument");
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });
});
