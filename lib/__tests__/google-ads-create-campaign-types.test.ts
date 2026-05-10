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

import { createCampaign } from "@/lib/google-ads";

const auth = { refreshToken: "rt", customerId: "130-126-5570" };

beforeEach(() => {
  vi.clearAllMocks();
  mockCustomerFactory.mockReturnValue({
    mutateResources: mockMutateResources,
    query: mockQuery,
  });
  mockMutateResources.mockResolvedValue({ mutate_operation_responses: [] });
  mockQuery.mockResolvedValue([]);
});

// Mock-response helpers — match the index where each builder reads campaign_result/ad_group_result.
const searchResponses = () => ({
  mutate_operation_responses: [
    {},
    { campaign_result: { resource_name: "customers/1305705570/campaigns/1" } },
    { ad_group_result: { resource_name: "customers/1305705570/adGroups/2" } },
    {},
    {},
  ],
});
const shoppingResponses = () => ({
  mutate_operation_responses: [
    {},
    { campaign_result: { resource_name: "customers/1305705570/campaigns/1" } },
    { ad_group_result: { resource_name: "customers/1305705570/adGroups/2" } },
    {},
    {},
  ],
});
const pmaxResponses = () => ({
  mutate_operation_responses: [
    {},
    { campaign_result: { resource_name: "customers/1305705570/campaigns/1" } },
    { asset_group_result: { resource_name: "customers/1305705570/assetGroups/2" } },
    ...Array(40).fill({}),
  ],
});
const displayResponses = () => ({
  mutate_operation_responses: [
    {},
    { campaign_result: { resource_name: "customers/1305705570/campaigns/1" } },
    { ad_group_result: { resource_name: "customers/1305705570/adGroups/2" } },
    {},
  ],
});
const videoResponses = () => ({
  mutate_operation_responses: [
    {},
    { campaign_result: { resource_name: "customers/1305705570/campaigns/1" } },
    { ad_group_result: { resource_name: "customers/1305705570/adGroups/2" } },
    {},
    {},
  ],
});
const appResponses = () => ({
  mutate_operation_responses: [
    {},
    { campaign_result: { resource_name: "customers/1305705570/campaigns/1" } },
    { asset_group_result: { resource_name: "customers/1305705570/assetGroups/2" } },
    ...Array(20).fill({}),
  ],
});

const baseSearch = {
  campaignType: "SEARCH" as const,
  campaignName: "Test Search",
  dailyBudgetDollars: 10,
  keywords: ["alpha", "beta"],
  headlines: ["H1", "H2", "H3"],
  descriptions: ["D1 description longer text", "D2 description longer text"],
  finalUrl: "https://example.com",
};
const baseShopping = {
  campaignType: "SHOPPING" as const,
  campaignName: "Test Shopping",
  dailyBudgetDollars: 20,
  merchantId: 123456789,
  salesCountry: "US",
};
const basePmax = {
  campaignType: "PERFORMANCE_MAX" as const,
  campaignName: "Test PMax",
  dailyBudgetDollars: 50,
  finalUrl: "https://example.com/shop",
  headlines: ["Buy", "Save", "Shop"],
  longHeadlines: ["Shop our entire collection of products online today"],
  descriptions: ["Great products and prices await.", "Fast shipping on most orders today."],
  businessName: "Example Store",
};
const baseDisplay = {
  campaignType: "DISPLAY" as const,
  campaignName: "Test Display",
  dailyBudgetDollars: 15,
  finalUrl: "https://example.com",
  headlines: ["Sale Now"],
  longHeadline: "Big savings on quality products this week",
  descriptions: ["Quality products at low prices today."],
  businessName: "Sale Co",
  marketingImageAssetId: "9001",
  squareMarketingImageAssetId: "9002",
};
const baseVideo = {
  campaignType: "VIDEO" as const,
  campaignName: "Test Video",
  dailyBudgetDollars: 40,
  youtubeVideoId: "abc123",
  finalUrl: "https://example.com/video",
  headline: "Watch Us",
};
const baseApp = {
  campaignType: "APP" as const,
  campaignName: "Test App",
  dailyBudgetDollars: 30,
  appId: "123456789",
  appStore: "GOOGLE_APP_STORE" as const,
  finalUrl: "https://play.google.com/store/apps/details?id=x",
  headlines: ["Install Now", "Top App"],
  descriptions: ["Best app ever made."],
};

const findCampaignOp = (ops: any[]) =>
  ops.find((op) => op.entity === "campaign" && op.operation === "create");
const findAdGroupOp = (ops: any[]) =>
  ops.find((op) => op.entity === "ad_group" && op.operation === "create");

describe("createCampaign — bidding-strategy field per type (landmine: BiddingStrategyType integers easily swapped)", () => {
  it("SEARCH + MAXIMIZE_CONVERSIONS sets maximize_conversions={} on campaign resource", async () => {
    mockMutateResources.mockResolvedValueOnce(searchResponses());
    await createCampaign(auth, { ...baseSearch, bidding: { strategy: "MAXIMIZE_CONVERSIONS" } });
    const ops = mockMutateResources.mock.calls[0][0];
    expect(findCampaignOp(ops).resource.maximize_conversions).toEqual({});
  });

  it("SEARCH + MAXIMIZE_CLICKS sets target_spend={} on campaign resource (NOT a literal MAXIMIZE_CLICKS field)", async () => {
    mockMutateResources.mockResolvedValueOnce(searchResponses());
    await createCampaign(auth, { ...baseSearch, bidding: { strategy: "MAXIMIZE_CLICKS" } });
    const ops = mockMutateResources.mock.calls[0][0];
    const campaign = findCampaignOp(ops).resource;
    expect(campaign.target_spend).toEqual({});
    expect(campaign.maximize_clicks).toBeUndefined();
  });

  it("SEARCH + MANUAL_CPC sets manual_cpc.enhanced_cpc_enabled=false", async () => {
    mockMutateResources.mockResolvedValueOnce(searchResponses());
    await createCampaign(auth, { ...baseSearch, bidding: { strategy: "MANUAL_CPC" } });
    const ops = mockMutateResources.mock.calls[0][0];
    expect(findCampaignOp(ops).resource.manual_cpc).toEqual({ enhanced_cpc_enabled: false });
  });

  it("SHOPPING + TARGET_ROAS sets target_roas.target_roas to the provided value", async () => {
    mockMutateResources.mockResolvedValueOnce(shoppingResponses());
    await createCampaign(auth, {
      ...baseShopping,
      bidding: { strategy: "TARGET_ROAS", targetRoas: 3.5 },
    });
    const ops = mockMutateResources.mock.calls[0][0];
    expect(findCampaignOp(ops).resource.target_roas).toEqual({ target_roas: 3.5 });
  });

  it("SHOPPING + MANUAL_CPC sets cpc_bid_micros on ad_group AND on the root listing_group criterion", async () => {
    mockMutateResources.mockResolvedValueOnce(shoppingResponses());
    await createCampaign(auth, {
      ...baseShopping,
      bidding: { strategy: "MANUAL_CPC", defaultCpcDollars: 0.5 },
    });
    const ops = mockMutateResources.mock.calls[0][0];
    expect(findAdGroupOp(ops).resource.cpc_bid_micros).toBe(500_000);
    const listingGroupOp = ops.find(
      (op: any) => op.entity === "ad_group_criterion" && op.resource.listing_group !== undefined,
    );
    expect(listingGroupOp.resource.cpc_bid_micros).toBe(500_000);
  });

  it("DISPLAY + MANUAL_CPC sets cpc_bid on ad_group level", async () => {
    mockMutateResources.mockResolvedValueOnce(displayResponses());
    await createCampaign(auth, {
      ...baseDisplay,
      bidding: { strategy: "MANUAL_CPC", defaultCpcDollars: 0.75 },
    });
    const ops = mockMutateResources.mock.calls[0][0];
    expect(findAdGroupOp(ops).resource.cpc_bid_micros).toBe(750_000);
  });

  it("PERFORMANCE_MAX defaults advertising_channel_type=10 and status=PAUSED on the campaign resource", async () => {
    mockMutateResources.mockResolvedValueOnce(pmaxResponses());
    await createCampaign(auth, basePmax);
    const ops = mockMutateResources.mock.calls[0][0];
    const campaign = findCampaignOp(ops).resource;
    expect(campaign.advertising_channel_type).toBe(10);
    expect(campaign.status).toBe(3); // PAUSED
  });

  it("VIDEO + TARGET_CPV sets target_cpv field", async () => {
    mockMutateResources.mockResolvedValueOnce(videoResponses());
    await createCampaign(auth, {
      ...baseVideo,
      bidding: { strategy: "TARGET_CPV", targetCpvDollars: 0.05 },
    });
    const ops = mockMutateResources.mock.calls[0][0];
    expect(findCampaignOp(ops).resource.target_cpv).toEqual({ target_cpv_micros: 50_000 });
  });

  it("APP + TARGET_CPA sets target_cpa.target_cpa_micros from targetCpaDollars", async () => {
    mockMutateResources.mockResolvedValueOnce(appResponses());
    await createCampaign(auth, {
      ...baseApp,
      bidding: { strategy: "TARGET_CPA", targetCpaDollars: 5 },
    });
    const ops = mockMutateResources.mock.calls[0][0];
    expect(findCampaignOp(ops).resource.target_cpa).toEqual({ target_cpa_micros: 5_000_000 });
  });
});

describe("createCampaign — early validation rejections (no API call)", () => {
  it("SEARCH rejects keywords.length === 0 — mutateResources not called", async () => {
    const result = await createCampaign(auth, { ...baseSearch, keywords: [] });
    expect(result.success).toBe(false);
    expect(result.error).toContain("keyword");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("SEARCH rejects dailyBudgetDollars < 1 — error message names $1 minimum", async () => {
    const result = await createCampaign(auth, { ...baseSearch, dailyBudgetDollars: 0.5 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("$1");
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("SEARCH rejects finalUrl missing http(s):// prefix", async () => {
    const result = await createCampaign(auth, { ...baseSearch, finalUrl: "example.com" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/http/i);
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("SEARCH rejects RSA when fewer than 3 headlines or 2 descriptions", async () => {
    const result = await createCampaign(auth, {
      ...baseSearch,
      headlines: ["only one", "only two"],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("Unsupported campaignType returns success:false with an error message", async () => {
    const result = await createCampaign(auth, {
      campaignType: "BOGUS",
      campaignName: "x",
      dailyBudgetDollars: 5,
    } as any);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported|BOGUS/);
    expect(mockMutateResources).not.toHaveBeenCalled();
  });
});

describe("createCampaign — policy-failure surface", () => {
  it("policy violation returns success:false with policy.policyTopics and retryable=false", async () => {
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message:
            "The resource has been disapproved since the policy summary includes policy topics of type PROHIBITED.",
          error_code: { policy_finding_error: 2 },
        },
      ],
    });
    const result = await createCampaign(auth, baseSearch);
    expect(result.success).toBe(false);
    expect(result.policy?.policyTopics).toEqual(expect.arrayContaining(["POLICY"]));
    expect(result.policy?.retryable).toBe(false);
  });

  it("session-scoped retry suppression: second identical createCampaign call within session returns 'Skipped retry'", async () => {
    const sessionAuth = { ...auth, sessionId: 904 };
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message:
            "The resource has been disapproved since the policy summary includes policy topics of type PROHIBITED.",
          error_code: { policy_finding_error: 2 },
        },
      ],
    });
    const first = await createCampaign(sessionAuth, baseSearch);
    const second = await createCampaign(sessionAuth, baseSearch);
    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    expect(second.error).toContain("Skipped retry");
    expect(second.policy?.retryable).toBe(false);
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });
});
