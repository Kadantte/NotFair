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
import { clearCache, __resetActiveExperimentProbeCacheForTests } from "@/lib/google-ads";
import { execWrite } from "@/lib/tools/execute";
import { buildHarness, TEST_AUTH, expectOk, expectError } from "./harness";

// ─── Shared setup ────────────────────────────────────────────────────

function resetMocks() {
  mockQuery.mockReset();
  mockMutateResources.mockReset();
  vi.mocked(execWrite).mockClear();
  mockQuery.mockResolvedValue([]);
  mockMutateResources.mockResolvedValue({ mutate_operation_responses: [] });
  // `getCachedCustomer` memoises GAQL responses by (userId, customerId, query).
  // Tests reuse TEST_AUTH so every call collides on the same cache key — clear
  // between tests so `mockQuery` is actually reached each time. The
  // active-experiment probe cache lives separately and also leaks across
  // tests (a "no experiments" hit silently skips the FROM experiment probe).
  clearCache();
  __resetActiveExperimentProbeCacheForTests();
}

describe("MCP read tools — registration", () => {
  beforeEach(resetMocks);

  it("registers the narrow specialized-read surface", () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const names = harness.listToolNames();
    // The surface deliberately stays small — only non-GAQL specialized tools
    // live here, everything else is covered by `runScript`.
    expect(names).toContain("searchGeoTargets");
    expect(names).not.toContain("getRecommendations");
    expect(names).toContain("getChanges");
    expect(names).toContain("reviewChangeImpact");
    expect(names).toContain("listChangeInterventions");
    expect(names).toContain("getChangeIntervention");
    expect(names).toContain("evaluateChangeIntervention");
    expect(names).toContain("getResourceMetadata");
    expect(names).toContain("listQueryableResources");
    expect(names).toContain("getKeywordIdeas");
    expect(names).toContain("listKeywords");
    expect(names).toContain("listActiveExperiments");
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

  it("listKeywords wraps object results as structuredContent", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { id: "100", name: "Search", status: "ENABLED" },
        ad_group: { id: "111", name: "Dogs", status: "ENABLED" },
        ad_group_criterion: {
          resource_name: "customers/1234567890/adGroupCriteria/111~222",
          criterion_id: "222",
          status: "ENABLED",
          negative: false,
          keyword: { text: "dog grooming", match_type: "PHRASE" },
        },
      },
    ]);

    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("listKeywords", {});
    const structured = expectOk(result);

    expect(structured).toHaveProperty("keywords");
    expect(Array.isArray(structured.keywords)).toBe(true);
    expect((structured.keywords as unknown[])[0]).toMatchObject({
      text: "dog grooming",
      campaignId: "100",
      criterionId: "222",
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
    const result = await harness.callTool("listKeywords", { accountId: "9999999999" });
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
    await harness.callTool("listKeywords", { accountId: "2222222222" });
    // The real `customer` object is our stub, so we can't assert on
    // per-account instances directly — but the call must have reached the
    // query stub without throwing the "not connected" error.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("getKeywordIdeas returns typed errors when platform credentials are missing", async () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("getKeywordIdeas", { keywords: ["dog grooming"] });
    const text = expectError(result);
    expect(text).toContain("Keyword research is not configured");
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

  it("registers asset creation tools (typed per family) and generic link primitives", () => {
    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const names = harness.listToolNames();
    // Typed creation tools — input shape differs per family
    expect(names).toContain("createCalloutAsset");
    expect(names).toContain("createStructuredSnippetAsset");
    expect(names).toContain("createSitelinkAsset");
    expect(names).toContain("createImageAsset");
    // Generic link primitives — work for every asset family
    expect(names).toContain("linkAsset");
    expect(names).toContain("unlinkAssetLinks");
    expect(names).toContain("getAssetLinks");
    // Deprecated tools must be gone
    expect(names).not.toContain("addCalloutAsset");
    expect(names).not.toContain("addSitelinkAsset");
    expect(names).not.toContain("addStructuredSnippetAsset");
    expect(names).not.toContain("linkCalloutAsset");
    expect(names).not.toContain("linkSitelinkAsset");
    expect(names).not.toContain("linkStructuredSnippetAsset");
    expect(names).not.toContain("linkImageAsset");
    expect(names).not.toContain("linkCalloutToAccount");
    expect(names).not.toContain("removeCalloutFromAccount");
    expect(names).not.toContain("unlinkCalloutAsset");
    expect(names).not.toContain("unlinkSitelinkAsset");
    expect(names).not.toContain("unlinkStructuredSnippetAsset");
  });

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

  it("linkAsset (image, ad_group level) flows through execWrite", async () => {
    mockQuery.mockResolvedValueOnce([{ asset: { source: "ADVERTISER" } }]);
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { ad_group_asset_result: { resource_name: "customers/1234567890/adGroupAssets/111~999~19" } },
      ],
    });

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("linkAsset", {
      assetId: "999",
      fieldType: "SQUARE_MARKETING_IMAGE",
      targets: [{ level: "ad_group", adGroupId: "111" }],
    });
    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: true,
      action: "link_asset",
      entityId: "999",
      fieldType: "SQUARE_MARKETING_IMAGE",
    });
    expect(mockMutateResources.mock.calls[0][0][0].resource).toMatchObject({
      ad_group: "customers/1234567890/adGroups/111",
      asset: "customers/1234567890/assets/999",
      field_type: 19,
    });
  });

  it("createStructuredSnippetAsset flows through execWrite and links to campaigns", async () => {
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { asset_result: { resource_name: "customers/1234567890/assets/999" } },
        { campaign_asset_result: { resource_name: "customers/1234567890/campaignAssets/100~999~12" } },
        { campaign_asset_result: { resource_name: "customers/1234567890/campaignAssets/200~999~12" } },
      ],
    });

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("createStructuredSnippetAsset", {
      header: "Services",
      values: ["Plumbing", "Electrical", "HVAC"],
      targets: [
        { level: "campaign", campaignId: "100" },
        { level: "campaign", campaignId: "200" },
      ],
    });
    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: true,
      action: "create_structured_snippet_asset",
      entityId: "999",
      changeId: 1,
      changeIds: [1, 1],
    });
    expect(mockMutateResources.mock.calls[0][0]).toHaveLength(3);
    expect(vi.mocked(execWrite).mock.calls.map((call) => call[2])).toEqual(["100", "200"]);
  });

  it("createSitelinkAsset flows through execWrite and links to a campaign", async () => {
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { asset_result: { resource_name: "customers/1234567890/assets/999" } },
        { campaign_asset_result: { resource_name: "customers/1234567890/campaignAssets/100~999~13" } },
      ],
    });

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("createSitelinkAsset", {
      linkText: "Pricing",
      finalUrl: "https://example.com/pricing",
      description1: "See current plans",
      description2: "Compare every option",
      targets: [{ level: "campaign", campaignId: "100" }],
    });
    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: true,
      action: "create_sitelink_asset",
      entityId: "999",
      changeId: 1,
    });
    expect(mockMutateResources.mock.calls[0][0][0].resource).toMatchObject({
      final_urls: ["https://example.com/pricing"],
      sitelink_asset: {
        link_text: "Pricing",
        description1: "See current plans",
        description2: "Compare every option",
      },
    });
    expect(mockMutateResources.mock.calls[0][0][1].resource).toMatchObject({
      campaign: "customers/1234567890/campaigns/100",
      field_type: 13,
    });
  });

  it("createSitelinkAsset blocks when any campaign target is in an active experiment before mutating", async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          experiment: {
            resource_name: "customers/1234567890/experiments/555",
            id: "555",
            name: "LP test",
            status: "ENABLED",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          experiment_arm: {
            experiment: "customers/1234567890/experiments/555",
            name: "treatment",
            control: false,
            traffic_split: 50,
            campaigns: ["customers/1234567890/campaigns/200"],
            in_design_campaigns: [],
          },
        },
      ]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("createSitelinkAsset", {
      linkText: "Pricing",
      finalUrl: "https://example.com/pricing",
      targets: [
        { level: "campaign", campaignId: "100" },
        { level: "campaign", campaignId: "200" },
      ],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: false,
      executed: false,
      reason: "CAMPAIGN_IN_ACTIVE_EXPERIMENT",
    });
    expect(JSON.stringify(structured.impacts)).toContain("LP test");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("createSitelinkAsset (no targets) creates only the asset", async () => {
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { asset_result: { resource_name: "customers/1234567890/assets/999" } },
      ],
    });

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("createSitelinkAsset", {
      linkText: "Pricing",
      finalUrl: "https://example.com/pricing",
    });
    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: true,
      action: "create_sitelink_asset",
      entityId: "999",
      changeId: 1,
    });
    expect(mockMutateResources.mock.calls[0][0]).toHaveLength(1);
    expect(mockMutateResources.mock.calls[0][0][0].entity).toBe("asset");
  });

  it("unlinkAssetLinks flows through execWrite and removes by canonical resource_name", async () => {
    mockMutateResources.mockResolvedValueOnce({});
    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("unlinkAssetLinks", {
      linkResourceNames: ["customers/1234567890/campaignAssets/100~999~13"],
    });
    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: true,
      action: "unlink_asset",
      removed: 1,
      changeId: 1,
    });
    expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
      entity: "campaign_asset",
      operation: "remove",
      resource: "customers/1234567890/campaignAssets/100~999~13",
    });
  });

  it("getAssetLinks aggregates across all 4 link entities (read-only)", async () => {
    mockQuery.mockResolvedValue([]);
    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("getAssetLinks", { assetId: "999" });
    const structured = expectOk(result);
    expect(structured).toMatchObject({ assetId: "999", links: [] });
    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockMutateResources).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce([])
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
    expect(mockQuery.mock.calls[0][0]).toContain("FROM ad_group_criterion");
    expect(mockQuery.mock.calls[0][0]).not.toContain("FROM keyword_view");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("bulkUpdateBids validates keyword existence from ad_group_criterion before mutating", async () => {
    const keywordRow = {
      campaign: { id: "100", status: "ENABLED", bidding_strategy_type: "MANUAL_CPC" },
      ad_group: { id: "111", status: "ENABLED" },
      ad_group_criterion: {
        criterion_id: "222",
        status: "ENABLED",
        negative: false,
        cpc_bid_micros: 1_000_000,
        keyword: { match_type: "PHRASE" },
      },
    };
    mockQuery
      .mockResolvedValueOnce([keywordRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([keywordRow]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkUpdateBids", {
      updates: [
        { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 1.1 },
      ],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      executed: true,
      summary: { total: 1, succeeded: 1, failed: 0 },
    });
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[0][0]).toContain("FROM ad_group_criterion");
    expect(mockQuery.mock.calls[0][0]).not.toContain("FROM keyword_view");
    expect(mockQuery.mock.calls[1][0]).toContain("FROM experiment");
    expect(mockQuery.mock.calls[2][0]).toContain("FROM ad_group_criterion");
    expect(mockQuery.mock.calls[2][0]).not.toContain("FROM keyword_view");
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });

  it("bulkUpdateBids blocks active experiment campaigns before mutating", async () => {
    const keywordRow = {
      campaign: { id: "100", status: "ENABLED", bidding_strategy_type: "MANUAL_CPC" },
      ad_group: { id: "111", status: "ENABLED" },
      ad_group_criterion: {
        criterion_id: "222",
        status: "ENABLED",
        negative: false,
        cpc_bid_micros: 1_000_000,
        keyword: { match_type: "PHRASE" },
      },
    };
    mockQuery
      .mockResolvedValueOnce([keywordRow])
      .mockResolvedValueOnce([
        {
          experiment: {
            resource_name: "customers/1234567890/experiments/555",
            id: "555",
            name: "LP test",
            status: "ENABLED",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          experiment_arm: {
            experiment: "customers/1234567890/experiments/555",
            name: "control",
            control: true,
            traffic_split: 50,
            campaigns: ["customers/1234567890/campaigns/100"],
            in_design_campaigns: [],
          },
        },
      ]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("bulkUpdateBids", {
      updates: [
        { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 1.1 },
      ],
    });

    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: false,
      executed: false,
      reason: "CAMPAIGN_IN_ACTIVE_EXPERIMENT",
    });
    expect(JSON.stringify(structured.impacts)).toContain("LP test");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("active-experiment probe does not select experiment.id (UNRECOGNIZED_FIELD regression)", async () => {
    // Some accounts/API versions reject experiment.id with query_error=32
    // (UNRECOGNIZED_FIELD), which used to block 100% of guarded writes (e.g.
    // updateBid, bulkUpdateBids) even on accounts with zero experiments.
    // The probe must derive experimentId from experiment.resource_name instead.
    const keywordRow = {
      campaign: { id: "100", status: "ENABLED", bidding_strategy_type: "MANUAL_CPC" },
      ad_group: { id: "111", status: "ENABLED" },
      ad_group_criterion: {
        criterion_id: "222",
        status: "ENABLED",
        negative: false,
        cpc_bid_micros: 1_000_000,
        keyword: { match_type: "PHRASE" },
      },
    };
    mockQuery
      .mockResolvedValueOnce([keywordRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([keywordRow]);

    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    await harness.callTool("bulkUpdateBids", {
      updates: [
        { campaignId: "100", adGroupId: "111", criterionId: "222", newBidDollars: 1.1 },
      ],
    });

    const probeQuery = mockQuery.mock.calls.find((call) => /FROM experiment\b/.test(String(call[0])));
    expect(probeQuery, "expected the experiment guard probe to run").toBeDefined();
    expect(String(probeQuery![0])).not.toMatch(/\bexperiment\.id\b/);
  });

  it("simple-write tools targeting a campaign expose acknowledgeExperimentImpact", () => {
    // execWrite reads ctx.args.acknowledgeExperimentImpact via AsyncLocalStorage
    // (lib/tools/execute.ts), so any tool that passes a non-null campaignId to
    // execWrite must declare the override field in its schema — otherwise Zod
    // strips it before the handler runs and typed-tool-call hosts (Claude Code)
    // can't pass the override the error message tells them to pass. This test
    // pins the contract for the simple-write surface; bulk tools have their own
    // explicit-options path covered separately.
    const harness = buildHarness([registerWriteTools], TEST_AUTH);
    const simpleWriteTargetingCampaign = [
      "pauseKeyword", "addKeyword", "updateBid",
      "addNegativeKeyword", "removeNegativeKeyword", "updateCampaignBudget",
      "pauseCampaign", "enableCampaign", "removeCampaign",
      "createAdGroup", "updateAdGroup", "createAd", "pauseAd", "enableAd", "removeAd",
      "updateAdFinalUrl", "updateAdAssets",
      "renameCampaign", "renameAdGroup",
      "updateCampaignBidding", "updateCampaignGoals",
      "pausePmaxAssetGroup", "enablePmaxAssetGroup",
      "linkCampaignToBiddingStrategy",
      "linkNegativeListToCampaign", "unlinkNegativeListFromCampaign",
      "linkAsset",
    ];
    for (const name of simpleWriteTargetingCampaign) {
      const tool = harness.getTool(name);
      expect(tool.inputSchema, `${name} has no inputSchema`).toBeDefined();
      expect(
        Object.keys(tool.inputSchema!),
        `${name} schema is missing acknowledgeExperimentImpact`,
      ).toContain("acknowledgeExperimentImpact");
    }
  });
});
