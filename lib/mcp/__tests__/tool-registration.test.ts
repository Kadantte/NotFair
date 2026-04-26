/**
 * Level-1 MCP integration tests — tool-handler layer.
 *
 * Exercises the full chain from `server.registerTool` → Zod input validation
 * → handler → `typedResult` / `errorResult` shape. The underlying
 * `google-ads-api` client is stubbed (same pattern as
 * `__tests__/all-tools-proto-validation.test.ts`); `@/lib/tools/execute`
 * is replaced with pass-throughs so rate-limiting, change-logging, and
 * analytics don't touch the DB during tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (must be set before the modules that import them) ──

const mockQuery = vi.fn();
const mockMutateResources = vi.fn();
const mockCustomer = {
  query: mockQuery,
  mutateResources: mockMutateResources,
};

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer() {
      return mockCustomer;
    }
  },
  enums: {},
  resources: {},
  services: {},
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("mock-value"),
  getEnv: vi.fn().mockReturnValue(undefined),
}));

// Short-circuit the shared execution path. The real `execRead`/`execWrite`
// enforce rate limits and log to Postgres; during tests we want the handler
// chain exercised but not the persistence side effects.
vi.mock("@/lib/tools/execute", () => ({
  execRead: vi.fn(async (_auth, _accountId, _toolName, fn) => fn()),
  execWrite: vi.fn(async (_auth, _accountId, _campaignId, fn) => {
    const result = await fn();
    return { ...result, changeId: 1 };
  }),
}));

// ─── Imports that depend on the mocks above ─────────────────────────

import { registerReadTools } from "../read-tools";
import { registerWriteTools } from "../write-tools";
import { clearCache } from "@/lib/google-ads";
import { buildHarness, TEST_AUTH, expectOk, expectError } from "./harness";

// ─── Shared setup ────────────────────────────────────────────────────

function resetMocks() {
  mockQuery.mockReset();
  mockMutateResources.mockReset();
  mockQuery.mockResolvedValue([]);
  mockMutateResources.mockResolvedValue({ mutate_operation_responses: [] });
  // `getCachedCustomer` memoises GAQL responses by (userId, customerId, query).
  // Tests reuse TEST_AUTH so every call collides on the same cache key — clear
  // between tests so `mockQuery` is actually reached each time.
  clearCache();
}

describe("MCP read tools — registration", () => {
  beforeEach(resetMocks);

  it("registers the narrow specialized-read surface", () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const names = harness.listToolNames();
    // The surface deliberately stays small — only non-GAQL specialized tools
    // live here, everything else is covered by `runScript`.
    expect(names).toContain("searchGeoTargets");
    expect(names).toContain("getRecommendations");
    expect(names).toContain("getChanges");
    expect(names).toContain("reviewChangeImpact");
    expect(names).toContain("getResourceMetadata");
    expect(names).toContain("listQueryableResources");
    expect(names).toContain("getKeywordIdeas");
    expect(names).toContain("listKeywords");
  });

  it("every registered read tool declares readOnlyHint = true", () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    for (const tool of harness.tools.values()) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} is missing readOnlyHint`).toBe(true);
    }
  });

  it("every registered read tool description stays within the known connector limit", () => {
    // Claude's MCP connector silently drops tools with oversized descriptions
    // (commit 4109ce5 — 4.8KB `runScript` description caused "no tools
    // available"). The exact cap isn't documented; empirically ~2KB is fine
    // and ~4.8KB is rejected. Set the guardrail at 4000 chars so future
    // prose blowouts fail loud before users lose the tool.
    const MAX_DESCRIPTION_CHARS = 4000;
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    for (const tool of harness.tools.values()) {
      expect(
        tool.description.length,
        `${tool.name} description is ${tool.description.length} chars`,
      ).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    }
  });
});

describe("MCP read tools — handler execution", () => {
  beforeEach(resetMocks);

  it("getRecommendations wraps object results as structuredContent", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        recommendation: {
          type: "KEYWORD",
          campaign: "customers/1234567890/campaigns/999",
          dismissed: false,
        },
      },
    ]);

    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("getRecommendations", {});
    const structured = expectOk(result);

    expect(structured).toHaveProperty("recommendations");
    expect(Array.isArray(structured.recommendations)).toBe(true);
    expect((structured.recommendations as unknown[])[0]).toMatchObject({
      type: "KEYWORD",
      campaignId: "999",
    });
  });

  it("applies Zod defaults declared in the input schema", async () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    // reviewChangeImpact declares `days` default 7, `limit` default 50.
    // Omitting them should not throw — harness runs Zod .parse() like the SDK.
    await expect(harness.callTool("reviewChangeImpact", {})).resolves.toBeDefined();
  });

  it("rejects invalid input at the Zod boundary", async () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    // getKeywordIdeas.keywords is z.array(z.string()).min(1) — passing a
    // string instead of an array should throw during validation, before
    // the handler runs.
    await expect(
      harness.callTool("getKeywordIdeas", { keywords: "not-an-array" }),
    ).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("surfaces unknown account errors as typed error responses, not thrown exceptions", async () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("getRecommendations", { accountId: "9999999999" });
    const text = expectError(result);
    expect(text).toMatch(/not connected to this session/i);
    expect(text).toContain("listConnectedAccounts");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("routes calls to the account selected via accountId", async () => {
    const multiAccountAuth = {
      ...TEST_AUTH,
      customerIds: [
        { id: "1111111111", name: "Primary" },
        { id: "2222222222", name: "Secondary" },
      ],
    };
    mockQuery.mockResolvedValueOnce([]);
    const harness = buildHarness([registerReadTools], multiAccountAuth);
    await harness.callTool("getRecommendations", { accountId: "2222222222" });
    // The real `customer` object is our stub, so we can't assert on
    // per-account instances directly — but the call must have reached the
    // query stub without throwing the "not connected" error.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("getRecommendations gracefully handles API failures", async () => {
    // getRecommendations catches errors internally and returns { recommendations: [], error }
    // because the Recommendations API isn't enabled on every account.
    mockQuery.mockRejectedValueOnce(new Error("SIMULATED_API_FAILURE"));
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("getRecommendations", {});
    const structured = expectOk(result);
    expect(structured).toMatchObject({ recommendations: [] });
    expect(structured.error).toContain("SIMULATED_API_FAILURE");
  });

  it("listKeywords returns typed keyword inventory with safe default filters", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { id: "100", name: "Search", status: "ENABLED" },
        ad_group: { id: "111", name: "Dog Grooming", status: "ENABLED" },
        ad_group_criterion: {
          resource_name: "customers/1234567890/adGroupCriteria/111~222",
          criterion_id: "222",
          status: "ENABLED",
          negative: false,
          cpc_bid_micros: 1_500_000,
          keyword: { text: "dog grooming", match_type: "PHRASE" },
          quality_info: { quality_score: 7 },
        },
      },
    ]);

    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("listKeywords", {
      campaignId: "100",
      adGroupId: "111",
      includeBidInfo: true,
      includeQualityInfo: true,
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      count: 1,
      filters: {
        campaignId: "100",
        adGroupId: "111",
        positive: true,
        enabledOnly: true,
        excludeRemovedParents: true,
      },
      keywords: [
        {
          campaignId: "100",
          campaignName: "Search",
          campaignStatus: "ENABLED",
          adGroupId: "111",
          adGroupName: "Dog Grooming",
          adGroupStatus: "ENABLED",
          criterionId: "222",
          text: "dog grooming",
          matchType: "PHRASE",
          status: "ENABLED",
          negative: false,
          cpcBidMicros: 1_500_000,
          cpcBid: 1.5,
          qualityScore: 7,
        },
      ],
    });

    const query = mockQuery.mock.calls[0][0] as string;
    expect(query).toContain("ad_group_criterion.negative = FALSE");
    expect(query).toContain("ad_group_criterion.status = 'ENABLED'");
    expect(query).toContain("campaign.status != 'REMOVED'");
    expect(query).toContain("ad_group.status != 'REMOVED'");
  });
});

describe("MCP write tools — smoke", () => {
  beforeEach(resetMocks);

  it("pauseKeyword flows through execWrite and returns a WriteResult with changeId", async () => {
    // pauseKeyword pre-queries every keyword in the campaign (positives +
    // negatives) so it can both compute blast radius and detect "agent tried
    // to pause a negative" before issuing the mutate. Each row carries
    // status (2 = ENABLED) and negative=false so totalActive counts both.
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222", status: 2, negative: false, keyword: { text: "blue widgets" } } },
      { ad_group_criterion: { criterion_id: "333", status: 2, negative: false, keyword: { text: "red widgets" } } },
    ]);
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { ad_group_criterion_result: { resource_name: "customers/1/adGroupCriteria/111~222" } },
      ],
    });

    const harness = buildHarness([registerReadTools, registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("pauseKeyword", {
      campaignId: "100",
      adGroupId: "111",
      criterionId: "222",
    });
    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: true,
      action: "pause_keyword",
      entityId: "222",
      changeId: 1,
    });
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });

  it("bulkPauseKeywords fails atomically when pre-validation finds a negative keyword", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { id: "100", status: "ENABLED" },
        ad_group: { id: "111", status: "ENABLED" },
        ad_group_criterion: {
          criterion_id: "222",
          status: "ENABLED",
          negative: true,
          keyword: { match_type: "UNSPECIFIED" },
        },
      },
    ]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkPauseKeywords", {
      keywords: [{ campaignId: "100", adGroupId: "111", criterionId: "222" }],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      executed: false,
      reason: "PRE_VALIDATION_FAILED",
      summary: { total: 1, wouldSucceed: 0, wouldFail: 1 },
      wouldSucceedIds: [],
    });
    expect(JSON.stringify(structured.errors)).toContain("NEGATIVE_KEYWORDS_CANNOT_PAUSE");
    expect(mockMutateResources).not.toHaveBeenCalled();
    // Each invalid item carries a structured nextTool routing hint so agents
    // following MCP_INSTRUCTIONS can pivot to removeNegativeKeyword without
    // parsing free-text reasons. Bulk f9d2a291 in prod retried 13× because
    // there was no structured signal here.
    const errors = structured.errors as Array<{ alternativeTool?: string; nextTool?: { name: string; args?: Record<string, unknown> } }>;
    expect(errors[0]?.nextTool?.name).toBe("removeNegativeKeyword");
    expect(errors[0]?.nextTool?.args).toEqual({ campaignId: "100" });
    // alternativeTool (deprecated string field) and nextTool.name must agree
    // so older clients reading the legacy field aren't pointed at a different
    // tool than newer clients reading the structured hint.
    expect(errors[0]?.alternativeTool).toBe(errors[0]?.nextTool?.name);
  });

  it("bulkPauseKeywords keeps per-row args distinct when grouping multiple negative-pause failures", async () => {
    // Two rows, both negative-pause failures but with different keyword text.
    // The grouping in summarizeBulkValidationIssues must NOT collapse them
    // (their nextTool.args differ) — otherwise the agent loses the per-row
    // routing data and can't issue per-keyword removeNegativeKeyword calls.
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { id: "100", status: "ENABLED" },
        ad_group: { id: "111", status: "ENABLED" },
        ad_group_criterion: {
          criterion_id: "222",
          status: "ENABLED",
          negative: true,
          keyword: { text: "free", match_type: "UNSPECIFIED" },
        },
      },
      {
        campaign: { id: "100", status: "ENABLED" },
        ad_group: { id: "111", status: "ENABLED" },
        ad_group_criterion: {
          criterion_id: "333",
          status: "ENABLED",
          negative: true,
          keyword: { text: "cheap", match_type: "UNSPECIFIED" },
        },
      },
    ]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkPauseKeywords", {
      keywords: [
        { campaignId: "100", adGroupId: "111", criterionId: "222" },
        { campaignId: "100", adGroupId: "111", criterionId: "333" },
      ],
    });

    const structured = expectOk(result);
    const errors = structured.errors as Array<{
      code: string;
      affectedIds: string[];
      nextTool?: { name: string; args?: Record<string, unknown> };
    }>;
    const negPauseEntries = errors.filter((e) => e.code === "NEGATIVE_KEYWORDS_CANNOT_PAUSE");
    expect(negPauseEntries).toHaveLength(2);
    const argKeywords = negPauseEntries.map((e) => e.nextTool?.args?.keyword).sort();
    expect(argKeywords).toEqual(["cheap", "free"]);
  });

  it("bulkPauseKeywords rejects criterion IDs that belong to a different ad group", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { id: "100", status: "ENABLED" },
        ad_group: { id: "999", status: "ENABLED" },
        ad_group_criterion: {
          criterion_id: "222",
          status: "ENABLED",
          negative: false,
          keyword: { match_type: "PHRASE" },
        },
      },
    ]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkPauseKeywords", {
      keywords: [{ campaignId: "100", adGroupId: "111", criterionId: "222" }],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      executed: false,
      reason: "PRE_VALIDATION_FAILED",
      summary: { total: 1, wouldSucceed: 0, wouldFail: 1 },
    });
    expect(JSON.stringify(structured.errors)).toContain("ENTITY_NOT_FOUND");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });


  it("bulkPauseKeywords continueOnError skips invalid items and executes the valid subset", async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          campaign: { id: "100", status: "ENABLED" },
          ad_group: { id: "111", status: "ENABLED" },
          ad_group_criterion: {
            criterion_id: "222",
            status: "ENABLED",
            negative: true,
            keyword: { match_type: "UNSPECIFIED" },
          },
        },
        {
          campaign: { id: "100", status: "ENABLED" },
          ad_group: { id: "111", status: "ENABLED" },
          ad_group_criterion: {
            criterion_id: "333",
            status: "ENABLED",
            negative: false,
            keyword: { match_type: "PHRASE" },
          },
        },
      ])
      .mockResolvedValueOnce([
        { ad_group_criterion: { criterion_id: "333" } },
        { ad_group_criterion: { criterion_id: "444" } },
      ])
      .mockResolvedValueOnce([
        { ad_group_criterion: { criterion_id: "333" } },
        { ad_group_criterion: { criterion_id: "444" } },
      ]);
    mockMutateResources.mockResolvedValueOnce({ mutate_operation_responses: [{}] });

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkPauseKeywords", {
      continueOnError: true,
      keywords: [
        { campaignId: "100", adGroupId: "111", criterionId: "222" },
        { campaignId: "100", adGroupId: "111", criterionId: "333" },
      ],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      executed: true,
      summary: { total: 2, succeeded: 1, skipped: 1, failed: 0 },
    });
    expect(JSON.stringify(structured.skipped)).toContain("NEGATIVE_KEYWORDS_CANNOT_PAUSE");
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });

  it("bulkAddKeywords dryRun returns validation shape and does not mutate", async () => {
    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkAddKeywords", {
      campaignId: "100",
      adGroupId: "111",
      dryRun: true,
      keywords: [
        { keyword: "one two three four five six seven eight nine ten eleven", matchType: "PHRASE" },
        { keyword: "valid keyword", matchType: "EXACT" },
      ],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      executed: false,
      reason: "DRY_RUN",
      summary: { total: 2, wouldSucceed: 1, wouldFail: 1 },
    });
    expect(JSON.stringify(structured.errors)).toContain("INVALID_KEYWORD_SYNTAX");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("bulkAddKeywords rejects duplicates within the same request", async () => {
    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkAddKeywords", {
      campaignId: "100",
      adGroupId: "111",
      keywords: [
        { keyword: "valid keyword", matchType: "EXACT" },
        { keyword: " valid   keyword ", matchType: "EXACT" },
      ],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      executed: false,
      reason: "PRE_VALIDATION_FAILED",
      summary: { total: 2, wouldSucceed: 0, wouldFail: 2 },
    });
    expect(JSON.stringify(structured.errors)).toContain("DUPLICATE_IN_REQUEST");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });


  it("bulkUpdateBids fails atomically when a bid violates guardrails", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { id: "100", status: "ENABLED", bidding_strategy_type: "MANUAL_CPC" },
        ad_group: { id: "111", status: "ENABLED" },
        ad_group_criterion: {
          criterion_id: "222",
          status: "ENABLED",
          negative: false,
          cpc_bid_micros: 1_000_000,
          keyword: { match_type: "PHRASE" },
        },
      },
    ]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkUpdateBids", {
      updates: [
        { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 2 },
      ],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      executed: false,
      reason: "PRE_VALIDATION_FAILED",
      summary: { total: 1, wouldSucceed: 0, wouldFail: 1 },
    });
    expect(JSON.stringify(structured.errors)).toContain("BID_CHANGE_EXCEEDS_GUARDRAIL");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });
});
