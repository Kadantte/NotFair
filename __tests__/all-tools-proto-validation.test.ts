/**
 * Protobuf wire-format validation for ALL MCP write tools.
 *
 * Calls each real google-ads.ts function with a mock customer, captures
 * the operations passed to mutateResources, then encodes them through
 * the REAL google-ads-node protobuf layer. If the format is wrong
 * (e.g. object where string expected for remove ops), the protobuf
 * encoder throws — proving the operation would fail in production.
 *
 * This is the test that would have caught the remove-operation bug
 * before it shipped.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { protos } = require("google-ads-node");
const services = protos.google.ads.googleads.v22.services;

// ─── Shared mock infrastructure ─────────────────────────────────────

type CapturedOperation = { entity: string; operation: string; resource: unknown };

const capturedOps: CapturedOperation[][] = [];

const mockMutateResources = vi.fn();
const mockQuery = vi.fn();
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
  // Keyword management
  pauseKeyword,
  enableKeyword,
  addKeyword,
  removeKeyword,
  updateBid,
  // Negative keywords
  addNegativeKeyword,
  removeNegativeKeyword,
  // Budget
  updateCampaignBudget,
  // Campaign management
  createCampaign,
  pauseCampaign,
  enableCampaign,
  removeCampaign,
  renameCampaign,
  updateCampaignSettings,
  // Tracking templates
  setTrackingTemplate,
  // Ad group management
  createAdGroup,
  renameAdGroup,
  // Ad management
  createAd,
  pauseAd,
  enableAd,
  updateAdFinalUrl,
  updateAdAssets,
  // Bidding strategy
  updateCampaignBidding,
  // Bulk operations
  bulkUpdateBids,
  bulkPauseKeywords,
  bulkAddKeywords,
  moveKeywords,
  addCalloutAsset,
  linkCalloutAsset,
  addStructuredSnippetAsset,
  unlinkStructuredSnippetAsset,
  addSitelinkAsset,
  linkSitelinkAsset,
  unlinkSitelinkAsset,
  type AuthContext,
} from "@/lib/google-ads";

const AUTH: AuthContext = {
  refreshToken: "test-token",
  customerId: "123-456-7890",
};

// ─── Protobuf validation helpers ────────────────────────────────────

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

function getFieldMask(
  resource: Record<string, unknown>,
): { paths: string[] } {
  return {
    paths: Object.keys(resource).filter((k) => k !== "resource_name"),
  };
}

/**
 * Reproduce what google-ads-api does: build a MutateOperation protobuf
 * from our mutation, then encode it. Throws if format is invalid.
 */
function encodeAsProtobuf(mutation: {
  entity: string;
  operation: string;
  resource: unknown;
}) {
  const opKey = toSnakeCase(`${mutation.entity}Operation`);
  const operation: Record<string, unknown> = {
    [mutation.operation]: mutation.resource,
  };
  if (mutation.operation === "update") {
    operation.update_mask = getFieldMask(
      mutation.resource as Record<string, unknown>,
    );
  }
  const mutateOp = new services.MutateOperation({ [opKey]: operation });
  return services.MutateOperation.encode(mutateOp).finish();
}

/** Encode all captured operations. Throws on first invalid one. */
function assertAllCapturedOpsEncode() {
  expect(capturedOps.length).toBeGreaterThan(0);
  for (const opSet of capturedOps) {
    for (const op of opSet) {
      expect(() => encodeAsProtobuf(op)).not.toThrow();
    }
  }
}

// ─── Default mock responses ─────────────────────────────────────────

function defaultMutateResponse(overrides?: Record<string, unknown>) {
  return { mutate_operation_responses: [], ...overrides };
}

function resetMocks() {
  capturedOps.length = 0;
  mockMutateResources.mockReset();
  mockQuery.mockReset();
  mockMutateResources.mockImplementation((ops: CapturedOperation[]) => {
    capturedOps.push(ops);
    return Promise.resolve(defaultMutateResponse());
  });
  mockQuery.mockResolvedValue([]);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("protobuf validation: keyword management", () => {
  beforeEach(resetMocks);

  it("pauseKeyword", async () => {
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222", status: 2, negative: false, keyword: { text: "running shoes" } } },
      { ad_group_criterion: { criterion_id: "333", status: 2, negative: false, keyword: { text: "trail runners" } } },
    ]);
    await pauseKeyword(AUTH, "100", "111", "222");
    assertAllCapturedOpsEncode();
  });

  it("enableKeyword", async () => {
    await enableKeyword(AUTH, "111", "222");
    assertAllCapturedOpsEncode();
  });

  it("addKeyword", async () => {
    mockMutateResources.mockImplementationOnce((ops: Array<{ entity: string; operation: string; resource: unknown }>) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {
              ad_group_criterion_result: {
                resource_name:
                  "customers/1234567890/adGroupCriteria/111~99999",
              },
            },
          ],
        }),
      );
    });
    await addKeyword(AUTH, "111", "test keyword", "PHRASE");
    assertAllCapturedOpsEncode();
  });

  it("removeKeyword", async () => {
    await removeKeyword(AUTH, "111", "222");
    assertAllCapturedOpsEncode();
  });

  it("updateBid", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { bidding_strategy_type: "MANUAL_CPC" },
        ad_group_criterion: { cpc_bid_micros: 1_400_000 },
      },
    ]);
    await updateBid(AUTH, "100", "111", "222", 1_500_000);
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: negative keywords", () => {
  beforeEach(resetMocks);

  it("addNegativeKeyword", async () => {
    await addNegativeKeyword(AUTH, "100", "bad keyword", "PHRASE");
    assertAllCapturedOpsEncode();
  });

  it("removeNegativeKeyword", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          keyword: { text: "spam" },
          criterion_id: "888",
        },
      },
    ]);
    await removeNegativeKeyword(AUTH, "555", "spam");
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: budget management", () => {
  beforeEach(resetMocks);

  it("updateCampaignBudget", async () => {
    // updateCampaignBudget queries campaign.campaign_budget (resource name) + amount
    mockQuery.mockResolvedValueOnce([
      {
        campaign: {
          campaign_budget: "customers/1234567890/campaignBudgets/9999",
        },
        campaign_budget: {
          amount_micros: 5_000_000,
        },
      },
    ]);
    await updateCampaignBudget(AUTH, "100", 7_000_000);
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: campaign management", () => {
  beforeEach(resetMocks);

  it("createCampaign (SEARCH)", async () => {
    mockMutateResources.mockImplementationOnce((ops: Array<{ entity: string; operation: string; resource: unknown }>) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            {
              campaign_result: {
                resource_name: "customers/1234567890/campaigns/55555",
              },
            },
            {},
            {},
            {},
          ],
        }),
      );
    });
    await createCampaign(AUTH, {
      campaignType: "SEARCH",
      campaignName: "Test Campaign",
      dailyBudgetDollars: 10,
      keywords: ["keyword one", "keyword two"],
      headlines: ["Headline 1", "Headline 2", "Headline 3"],
      descriptions: ["Description 1", "Description 2"],
      finalUrl: "https://example.com",
    });
    assertAllCapturedOpsEncode();
  });

  it("createCampaign (SHOPPING, manual CPC + inventory filter + geo/language)", async () => {
    mockMutateResources.mockImplementationOnce((ops: Array<{ entity: string; operation: string; resource: unknown }>) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            {
              campaign_result: {
                resource_name: "customers/1234567890/campaigns/77777",
              },
            },
            {
              ad_group_result: {
                resource_name: "customers/1234567890/adGroups/88888",
              },
            },
            // root listing group criterion
            {},
            // shopping product ad
            {},
            // inventory filter criterion 1 (productType)
            {},
            // inventory filter criterion 2 (customLabel)
            {},
            // geo criterion
            {},
            // language criterion
            {},
          ],
        }),
      );
    });
    const result = await createCampaign(AUTH, {
      campaignType: "SHOPPING",
      campaignName: "Test Shopping Campaign",
      dailyBudgetDollars: 20,
      merchantId: 123456789,
      salesCountry: "US",
      campaignPriority: 1,
      enableLocal: false,
      bidding: { strategy: "MANUAL_CPC", defaultCpcDollars: 0.50 },
      searchPartners: true,
      geoTargetIds: ["2840"],
      languageIds: ["1000"],
      inventoryFilter: [
        { productType: { level: 1, value: "Electronics" } },
        { customLabel: { index: 0, value: "sale" } },
      ],
    });
    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    // Verify ad_group and root listing_group criterion both have cpc_bid_micros=500000
    const ops = capturedOps.flat();
    const adGroupOp = ops.find((op) => op.entity === "ad_group" && op.operation === "create");
    expect((adGroupOp?.resource as Record<string, unknown>).cpc_bid_micros).toBe(500_000);

    const listingGroupOp = ops.find(
      (op) => op.entity === "ad_group_criterion" && op.operation === "create" &&
        (op.resource as Record<string, unknown>).listing_group !== undefined,
    );
    expect((listingGroupOp?.resource as Record<string, unknown>).cpc_bid_micros).toBe(500_000);

    // Verify network_settings on campaign
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    const networkSettings = (campaignOp?.resource as Record<string, unknown>).network_settings as Record<string, unknown>;
    expect(networkSettings.target_google_search).toBe(true);
    expect(networkSettings.target_search_network).toBe(true);

    // Verify geo and language criteria exist
    const geoCriterion = ops.find(
      (op) => op.entity === "campaign_criterion" &&
        (op.resource as Record<string, unknown>).location !== undefined,
    );
    expect(geoCriterion).toBeDefined();
    const langCriterion = ops.find(
      (op) => op.entity === "campaign_criterion" &&
        (op.resource as Record<string, unknown>).language !== undefined,
    );
    expect(langCriterion).toBeDefined();
  });

  it("createCampaign (SHOPPING, target ROAS, no filter + geo)", async () => {
    mockMutateResources.mockImplementationOnce((ops: Array<{ entity: string; operation: string; resource: unknown }>) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            {
              campaign_result: {
                resource_name: "customers/1234567890/campaigns/99999",
              },
            },
            {
              ad_group_result: {
                resource_name: "customers/1234567890/adGroups/11111",
              },
            },
            // root listing group criterion
            {},
            // shopping product ad
            {},
            // geo criterion
            {},
          ],
        }),
      );
    });
    const result = await createCampaign(AUTH, {
      campaignType: "SHOPPING",
      campaignName: "Test Shopping ROAS Campaign",
      dailyBudgetDollars: 50,
      merchantId: 987654321,
      salesCountry: "GB",
      bidding: { strategy: "TARGET_ROAS", targetRoas: 3.5 },
      geoTargetIds: ["2840"],
    });
    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    // TARGET_ROAS — no cpc_bid_micros on ad_group
    const ops = capturedOps.flat();
    const adGroupOp = ops.find((op) => op.entity === "ad_group" && op.operation === "create");
    expect((adGroupOp?.resource as Record<string, unknown>).cpc_bid_micros).toBeUndefined();

    // Geo criterion should encode
    const geoCriterion = ops.find(
      (op) => op.entity === "campaign_criterion" &&
        (op.resource as Record<string, unknown>).location !== undefined,
    );
    expect(geoCriterion).toBeDefined();
  });

  it("createCampaign (SHOPPING, MAXIMIZE_CLICKS)", async () => {
    mockMutateResources.mockImplementationOnce((ops: Array<{ entity: string; operation: string; resource: unknown }>) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            {
              campaign_result: {
                resource_name: "customers/1234567890/campaigns/55555",
              },
            },
            {
              ad_group_result: {
                resource_name: "customers/1234567890/adGroups/66666",
              },
            },
            // root listing group criterion
            {},
            // shopping product ad
            {},
          ],
        }),
      );
    });
    const result = await createCampaign(AUTH, {
      campaignType: "SHOPPING",
      campaignName: "Test Shopping MaxClicks Campaign",
      dailyBudgetDollars: 30,
      merchantId: 667676442,
      salesCountry: "US",
      bidding: { strategy: "MAXIMIZE_CLICKS" },
    });
    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    // MAXIMIZE_CLICKS — no cpc_bid_micros on ad_group or listing group
    const ops = capturedOps.flat();
    const adGroupOp = ops.find((op) => op.entity === "ad_group" && op.operation === "create");
    expect((adGroupOp?.resource as Record<string, unknown>).cpc_bid_micros).toBeUndefined();

    const listingGroupOp = ops.find(
      (op) => op.entity === "ad_group_criterion" && op.operation === "create" &&
        (op.resource as Record<string, unknown>).listing_group !== undefined,
    );
    expect((listingGroupOp?.resource as Record<string, unknown>).cpc_bid_micros).toBeUndefined();

    // Campaign should have target_spend bidding
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).target_spend).toBeDefined();
  });

  it("pauseCampaign", async () => {
    await pauseCampaign(AUTH, "100");
    assertAllCapturedOpsEncode();
  });

  it("enableCampaign", async () => {
    await enableCampaign(AUTH, "100");
    assertAllCapturedOpsEncode();
  });

  it("removeCampaign", async () => {
    await removeCampaign(AUTH, "100");
    assertAllCapturedOpsEncode();
  });

  it("renameCampaign", async () => {
    mockQuery.mockResolvedValueOnce([
      { campaign: { name: "Old Name" } },
    ]);
    await renameCampaign(AUTH, "100", "New Name");
    assertAllCapturedOpsEncode();
  });
});

// ─── Performance Max ─────────────────────────────────────────────────

describe("protobuf validation: createCampaign (PERFORMANCE_MAX)", () => {
  beforeEach(resetMocks);

  it("createCampaign (PERFORMANCE_MAX, MAXIMIZE_CONVERSIONS + text assets + geo/language)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            { campaign_result: { resource_name: "customers/1234567890/campaigns/10001" } },
            { asset_group_result: { resource_name: "customers/1234567890/assetGroups/20001" } },
            // text asset ops (asset + asset_group_asset for each) — 5 headlines x2 + 1 long x2 + 2 desc x2 + 1 biz x2 = 18 ops
            ...Array(18).fill({}),
            // geo criterion
            {},
            // language criterion
            {},
          ],
        }),
      );
    });

    const result = await createCampaign(AUTH, {
      campaignType: "PERFORMANCE_MAX",
      campaignName: "Test PMax Campaign",
      dailyBudgetDollars: 50,
      finalUrl: "https://example.com/shop",
      headlines: ["Buy Now", "Great Deals", "Shop Today", "Save Big", "Best Prices"],
      longHeadlines: ["Shop our entire collection of products online today"],
      descriptions: ["We have what you need at great prices.", "Fast shipping on all orders over $50."],
      businessName: "Example Store",
      bidding: { strategy: "MAXIMIZE_CONVERSIONS", targetCpaDollars: 25 },
      geoTargetIds: ["2840"],
      languageIds: ["1000"],
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();

    // Campaign should have PERFORMANCE_MAX channel type (10) and PAUSED status
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).advertising_channel_type).toBe(10);
    expect((campaignOp?.resource as Record<string, unknown>).status).toBe(3); // PAUSED

    // Asset group should reference campaign temp
    const assetGroupOp = ops.find((op) => op.entity === "asset_group" && op.operation === "create");
    expect(assetGroupOp).toBeDefined();

    // Text asset ops should exist
    const assetOps = ops.filter((op) => op.entity === "asset" && op.operation === "create");
    expect(assetOps.length).toBeGreaterThan(0);

    // AssetGroupAsset ops should link assets to asset group
    const agaOps = ops.filter((op) => op.entity === "asset_group_asset" && op.operation === "create");
    expect(agaOps.length).toBeGreaterThan(0);

    // Geo/language criteria
    const geoCriterion = ops.find(
      (op) => op.entity === "campaign_criterion" && (op.resource as Record<string, unknown>).location !== undefined,
    );
    expect(geoCriterion).toBeDefined();

    const langCriterion = ops.find(
      (op) => op.entity === "campaign_criterion" && (op.resource as Record<string, unknown>).language !== undefined,
    );
    expect(langCriterion).toBeDefined();
  });

  it("createCampaign (PERFORMANCE_MAX, MAXIMIZE_CONVERSION_VALUE + retail PMax with merchantId)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(defaultMutateResponse({
        mutate_operation_responses: [
          {},
          { campaign_result: { resource_name: "customers/1234567890/campaigns/10002" } },
          { asset_group_result: { resource_name: "customers/1234567890/assetGroups/20002" } },
          ...Array(14).fill({}), // 3 headlines + 2 long + 2 desc + 1 biz = 8 assets x2 ops = 16, but we have 3+1+2+1=7 → 14 ops
        ],
      }));
    });

    const result = await createCampaign(AUTH, {
      campaignType: "PERFORMANCE_MAX",
      campaignName: "Test Retail PMax",
      dailyBudgetDollars: 100,
      finalUrl: "https://shop.example.com",
      headlines: ["Shop Electronics", "New Arrivals Daily", "Free Shipping"],
      longHeadlines: ["The best electronics store online"],
      descriptions: ["Shop thousands of electronics.", "Returns accepted within 30 days."],
      businessName: "Electronics Shop",
      bidding: { strategy: "MAXIMIZE_CONVERSION_VALUE", targetRoas: 4.0 },
      merchantId: 123456789,
      salesCountry: "US",
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    // Should have shopping_setting for retail PMax
    expect((campaignOp?.resource as Record<string, unknown>).shopping_setting).toBeDefined();
    // Should have maximize_conversion_value bidding
    expect((campaignOp?.resource as Record<string, unknown>).maximize_conversion_value).toBeDefined();
  });
});

// ─── Demand Gen ──────────────────────────────────────────────────────

describe("protobuf validation: createCampaign (DEMAND_GEN)", () => {
  beforeEach(resetMocks);

  it("createCampaign (DEMAND_GEN, MAXIMIZE_CONVERSIONS + geo/language)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            { campaign_result: { resource_name: "customers/1234567890/campaigns/10010" } },
            { ad_group_result: { resource_name: "customers/1234567890/adGroups/20010" } },
            {}, // ad_group_ad
            {}, // geo criterion
            {}, // language criterion
          ],
        }),
      );
    });

    const result = await createCampaign(AUTH, {
      campaignType: "DEMAND_GEN",
      campaignName: "Test Demand Gen Campaign",
      dailyBudgetDollars: 30,
      finalUrl: "https://example.com/discover",
      headlines: ["Discover Our Products", "New This Season", "Shop Now"],
      longHeadlines: ["Explore our full collection of quality products today"],
      descriptions: ["Find exactly what you're looking for.", "Fast shipping and easy returns."],
      businessName: "Example Store",
      bidding: { strategy: "MAXIMIZE_CONVERSIONS", targetCpaDollars: 15 },
      geoTargetIds: ["2840"],
      languageIds: ["1000"],
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();

    // Campaign should have DEMAND_GEN channel type (14)
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).advertising_channel_type).toBe(14);
    expect((campaignOp?.resource as Record<string, unknown>).status).toBe(3); // PAUSED

    // Ad group op
    const adGroupOp = ops.find((op) => op.entity === "ad_group" && op.operation === "create");
    expect(adGroupOp).toBeDefined();

    // Ad group ad with demand_gen_multi_asset_ad
    const adGroupAdOp = ops.find((op) => op.entity === "ad_group_ad" && op.operation === "create");
    expect(adGroupAdOp).toBeDefined();
    const ad = ((adGroupAdOp?.resource as Record<string, unknown>).ad as Record<string, unknown>);
    expect(ad.demand_gen_multi_asset_ad).toBeDefined();
  });

  it("createCampaign (DEMAND_GEN, MAXIMIZE_CONVERSION_VALUE, no geo)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(defaultMutateResponse({
        mutate_operation_responses: [
          {},
          { campaign_result: { resource_name: "customers/1234567890/campaigns/10011" } },
          { ad_group_result: { resource_name: "customers/1234567890/adGroups/20011" } },
          {},
        ],
      }));
    });

    const result = await createCampaign(AUTH, {
      campaignType: "DEMAND_GEN",
      campaignName: "Test DG Value Campaign",
      dailyBudgetDollars: 50,
      finalUrl: "https://store.example.com",
      headlines: ["Top Quality Products", "Shop the Best Deals", "Limited Time Offer"],
      longHeadlines: ["Browse our curated selection of top-rated products"],
      descriptions: ["Quality you can trust.", "Join millions of happy customers."],
      businessName: "Great Store",
      bidding: { strategy: "MAXIMIZE_CONVERSION_VALUE", targetRoas: 3.0 },
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).maximize_conversion_value).toBeDefined();
  });
});

// ─── Display ─────────────────────────────────────────────────────────

describe("protobuf validation: createCampaign (DISPLAY)", () => {
  beforeEach(resetMocks);

  it("createCampaign (DISPLAY, MAXIMIZE_CONVERSIONS + image asset IDs + geo/language)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            { campaign_result: { resource_name: "customers/1234567890/campaigns/10020" } },
            { ad_group_result: { resource_name: "customers/1234567890/adGroups/20020" } },
            {}, // ad_group_ad
            {}, // geo
            {}, // language
          ],
        }),
      );
    });

    const result = await createCampaign(AUTH, {
      campaignType: "DISPLAY",
      campaignName: "Test Display Campaign",
      dailyBudgetDollars: 25,
      finalUrl: "https://example.com",
      headlines: ["Amazing Deals", "Shop Now"],
      longHeadline: "Discover the best deals on quality products today",
      descriptions: ["Top products at great prices.", "Fast and free shipping available."],
      businessName: "Example Co",
      marketingImageAssetId: "customers/1234567890/assets/9001",
      squareMarketingImageAssetId: "customers/1234567890/assets/9002",
      bidding: { strategy: "MAXIMIZE_CONVERSIONS", targetCpaDollars: 20 },
      geoTargetIds: ["2840"],
      languageIds: ["1000"],
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();

    // Campaign should have DISPLAY channel type (3) and target_content_network=true
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).advertising_channel_type).toBe(3);
    const netSettings = (campaignOp?.resource as Record<string, unknown>).network_settings as Record<string, unknown>;
    expect(netSettings.target_content_network).toBe(true);
    expect(netSettings.target_google_search).toBe(false);

    // Ad group should have DISPLAY_STANDARD type (3)
    const adGroupOp = ops.find((op) => op.entity === "ad_group" && op.operation === "create");
    expect((adGroupOp?.resource as Record<string, unknown>).type).toBe(3);

    // Ad should have responsive_display_ad
    const adGroupAdOp = ops.find((op) => op.entity === "ad_group_ad" && op.operation === "create");
    const adData = ((adGroupAdOp?.resource as Record<string, unknown>).ad as Record<string, unknown>);
    expect(adData.responsive_display_ad).toBeDefined();
    const rda = adData.responsive_display_ad as Record<string, unknown>;
    expect(Array.isArray(rda.marketing_images)).toBe(true);
    expect(Array.isArray(rda.square_marketing_images)).toBe(true);
  });

  it("createCampaign (DISPLAY, MANUAL_CPC with bid + logo image)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(defaultMutateResponse({
        mutate_operation_responses: [
          {},
          { campaign_result: { resource_name: "customers/1234567890/campaigns/10021" } },
          { ad_group_result: { resource_name: "customers/1234567890/adGroups/20021" } },
          {},
        ],
      }));
    });

    const result = await createCampaign(AUTH, {
      campaignType: "DISPLAY",
      campaignName: "Test Display Manual",
      dailyBudgetDollars: 15,
      finalUrl: "https://example.com/sale",
      headlines: ["Shop the Sale"],
      longHeadline: "Big savings on all items this weekend only",
      descriptions: ["Shop now and save up to 40%."],
      businessName: "Sale Store",
      marketingImageAssetId: "9001",
      squareMarketingImageAssetId: "9002",
      logoImageAssetId: "9003",
      bidding: { strategy: "MANUAL_CPC", defaultCpcDollars: 0.75 },
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).manual_cpc).toBeDefined();

    const adGroupOp = ops.find((op) => op.entity === "ad_group" && op.operation === "create");
    expect((adGroupOp?.resource as Record<string, unknown>).cpc_bid_micros).toBe(750_000);

    // Logo image should be included
    const adGroupAdOp = ops.find((op) => op.entity === "ad_group_ad" && op.operation === "create");
    const rda = ((adGroupAdOp?.resource as Record<string, unknown>).ad as Record<string, unknown>)
      .responsive_display_ad as Record<string, unknown>;
    expect(rda.logo_images).toBeDefined();
  });
});

// ─── Video ───────────────────────────────────────────────────────────

describe("protobuf validation: createCampaign (VIDEO)", () => {
  beforeEach(resetMocks);

  it("createCampaign (VIDEO, TARGET_CPV + geo/language)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            { campaign_result: { resource_name: "customers/1234567890/campaigns/10030" } },
            { ad_group_result: { resource_name: "customers/1234567890/adGroups/20030" } },
            {}, // video asset
            {}, // ad_group_ad
            {}, // geo
            {}, // language
          ],
        }),
      );
    });

    const result = await createCampaign(AUTH, {
      campaignType: "VIDEO",
      campaignName: "Test YouTube Campaign",
      dailyBudgetDollars: 40,
      youtubeVideoId: "abc123XYZ99",
      finalUrl: "https://example.com/video",
      headline: "Watch Our Story",
      longHeadline: "See what makes us the best choice for your needs",
      description: "Quality products and excellent service.",
      callToAction: "LEARN_MORE",
      bidding: { strategy: "TARGET_CPV", targetCpvDollars: 0.05 },
      geoTargetIds: ["2840"],
      languageIds: ["1000"],
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();

    // Campaign should have VIDEO channel type (6)
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).advertising_channel_type).toBe(6);
    expect((campaignOp?.resource as Record<string, unknown>).target_cpv).toBeDefined();

    // Ad group type should be VIDEO_TRUE_VIEW_IN_STREAM (9)
    const adGroupOp = ops.find((op) => op.entity === "ad_group" && op.operation === "create");
    expect((adGroupOp?.resource as Record<string, unknown>).type).toBe(9);

    // YouTube video asset
    const assetOp = ops.find((op) => op.entity === "asset" && op.operation === "create");
    expect(assetOp).toBeDefined();
    expect((assetOp?.resource as Record<string, unknown>).youtube_video_asset).toBeDefined();

    // video_responsive_ad
    const adGroupAdOp = ops.find((op) => op.entity === "ad_group_ad" && op.operation === "create");
    const adData = ((adGroupAdOp?.resource as Record<string, unknown>).ad as Record<string, unknown>);
    expect(adData.video_responsive_ad).toBeDefined();

    // Geo/language criteria
    const geoCriterion = ops.find(
      (op) => op.entity === "campaign_criterion" && (op.resource as Record<string, unknown>).location !== undefined,
    );
    expect(geoCriterion).toBeDefined();
  });

  it("createCampaign (VIDEO, MAXIMIZE_CONVERSIONS, no optional fields)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(defaultMutateResponse({
        mutate_operation_responses: [
          {},
          { campaign_result: { resource_name: "customers/1234567890/campaigns/10031" } },
          { ad_group_result: { resource_name: "customers/1234567890/adGroups/20031" } },
          {},
          {},
        ],
      }));
    });

    const result = await createCampaign(AUTH, {
      campaignType: "VIDEO",
      campaignName: "Test Video Max Conv",
      dailyBudgetDollars: 20,
      youtubeVideoId: "dEfGhIjKlMn",
      finalUrl: "https://example.com",
      headline: "Buy Our Product",
      bidding: { strategy: "MAXIMIZE_CONVERSIONS", targetCpaDollars: 50 },
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).maximize_conversions).toBeDefined();
    expect((campaignOp?.resource as Record<string, unknown>).target_cpv).toBeUndefined();
  });
});

// ─── App Campaign ─────────────────────────────────────────────────────

describe("protobuf validation: createCampaign (APP)", () => {
  beforeEach(resetMocks);

  it("createCampaign (APP, iOS, TARGET_CPA + geo/language)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {},
            { campaign_result: { resource_name: "customers/1234567890/campaigns/10040" } },
            { asset_group_result: { resource_name: "customers/1234567890/assetGroups/20040" } },
            // 2 headlines x2 + 2 desc x2 + 1 biz x2 = 10 asset ops
            ...Array(10).fill({}),
            {}, // geo
            {}, // language
          ],
        }),
      );
    });

    const result = await createCampaign(AUTH, {
      campaignType: "APP",
      campaignName: "Test iOS App Install",
      dailyBudgetDollars: 30,
      finalUrl: "https://apps.apple.com/app/id123456789",
      appId: "123456789",
      appStore: "APPLE_APP_STORE",
      headlines: ["Download Free Today", "Top-Rated App"],
      descriptions: ["Join millions of happy users.", "Free download, no ads."],
      businessName: "My App Inc",
      bidding: { strategy: "TARGET_CPA", targetCpaDollars: 5 },
      geoTargetIds: ["2840"],
      languageIds: ["1000"],
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();

    // Campaign should have MULTI_CHANNEL (7) + APP_CAMPAIGN sub_type (12)
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    expect((campaignOp?.resource as Record<string, unknown>).advertising_channel_type).toBe(7);
    expect((campaignOp?.resource as Record<string, unknown>).advertising_channel_sub_type).toBe(12);

    const appSetting = (campaignOp?.resource as Record<string, unknown>).app_campaign_setting as Record<string, unknown>;
    expect(appSetting).toBeDefined();
    expect(appSetting.app_id).toBe("123456789");
    expect(appSetting.app_store).toBe(2); // APPLE_APP_STORE
    expect(appSetting.bidding_strategy_goal_type).toBe(2); // OPTIMIZE_INSTALLS_TARGET_INSTALL_COST

    // target_cpa bidding
    expect((campaignOp?.resource as Record<string, unknown>).target_cpa).toBeDefined();

    // Asset group
    const assetGroupOp = ops.find((op) => op.entity === "asset_group" && op.operation === "create");
    expect(assetGroupOp).toBeDefined();

    // Text asset ops
    const assetOps = ops.filter((op) => op.entity === "asset" && op.operation === "create");
    expect(assetOps.length).toBeGreaterThan(0);

    // Geo/language
    const geoCriterion = ops.find(
      (op) => op.entity === "campaign_criterion" && (op.resource as Record<string, unknown>).location !== undefined,
    );
    expect(geoCriterion).toBeDefined();
  });

  it("createCampaign (APP, Android, MAXIMIZE_CONVERSIONS, no businessName)", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(defaultMutateResponse({
        mutate_operation_responses: [
          {},
          { campaign_result: { resource_name: "customers/1234567890/campaigns/10041" } },
          { asset_group_result: { resource_name: "customers/1234567890/assetGroups/20041" } },
          // 2 headlines x2 + 1 desc x2 = 6 asset ops
          ...Array(6).fill({}),
        ],
      }));
    });

    const result = await createCampaign(AUTH, {
      campaignType: "APP",
      campaignName: "Test Android App",
      dailyBudgetDollars: 50,
      finalUrl: "https://play.google.com/store/apps/details?id=com.example.app",
      appId: "com.example.app",
      appStore: "GOOGLE_APP_STORE",
      headlines: ["Install Now", "Best Productivity App"],
      descriptions: ["Get organized with our app."],
      bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
    });

    expect(result.success).toBe(true);
    assertAllCapturedOpsEncode();

    const ops = capturedOps.flat();
    const campaignOp = ops.find((op) => op.entity === "campaign" && op.operation === "create");
    const appSetting = (campaignOp?.resource as Record<string, unknown>).app_campaign_setting as Record<string, unknown>;
    expect(appSetting.app_store).toBe(3); // GOOGLE_APP_STORE
    expect(appSetting.bidding_strategy_goal_type).toBe(7); // OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST

    expect((campaignOp?.resource as Record<string, unknown>).maximize_conversions).toBeDefined();
  });
});

describe("protobuf validation: updateCampaignBidding", () => {
  beforeEach(resetMocks);

  const mockCurrentBidding = () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: {
          bidding_strategy_type: "MANUAL_CPC",
          target_cpa: null,
          maximize_conversions: null,
          target_roas: null,
        },
      },
    ]);
  };

  it("TARGET_CPA strategy", async () => {
    mockCurrentBidding();
    await updateCampaignBidding(AUTH, "100", {
      biddingStrategy: "TARGET_CPA",
      targetCpaMicros: 5_000_000,
    });
    assertAllCapturedOpsEncode();
  });

  it("MAXIMIZE_CONVERSIONS strategy (no cap)", async () => {
    mockCurrentBidding();
    await updateCampaignBidding(AUTH, "100", {
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
    });
    assertAllCapturedOpsEncode();
  });

  it("MAXIMIZE_CONVERSIONS strategy (with target CPA cap)", async () => {
    mockCurrentBidding();
    await updateCampaignBidding(AUTH, "100", {
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
      targetCpaMicros: 10_000_000,
    });
    assertAllCapturedOpsEncode();
  });

  it("TARGET_ROAS strategy", async () => {
    mockCurrentBidding();
    await updateCampaignBidding(AUTH, "100", {
      biddingStrategy: "TARGET_ROAS",
      targetRoas: 2.0,
    });
    assertAllCapturedOpsEncode();
  });

  it("MAXIMIZE_CLICKS strategy", async () => {
    mockCurrentBidding();
    await updateCampaignBidding(AUTH, "100", {
      biddingStrategy: "MAXIMIZE_CLICKS",
    });
    assertAllCapturedOpsEncode();
  });

  it("MANUAL_CPC strategy", async () => {
    mockCurrentBidding();
    await updateCampaignBidding(AUTH, "100", {
      biddingStrategy: "MANUAL_CPC",
    });
    assertAllCapturedOpsEncode();
  });

  it("TARGET_IMPRESSION_SHARE strategy", async () => {
    mockCurrentBidding();
    await updateCampaignBidding(AUTH, "100", {
      biddingStrategy: "TARGET_IMPRESSION_SHARE",
      impressionShareLocation: "TOP_OF_PAGE",
      locationFractionMicros: 950_000,
      cpcBidCeilingMicros: 2_000_000,
    });
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: updateCampaignSettings", () => {
  beforeEach(resetMocks);

  it("network settings update", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: {
          network_settings: {
            target_google_search: true,
            target_search_network: false,
            target_content_network: false,
          },
        },
      },
    ]);
    await updateCampaignSettings(AUTH, "100", {
      networks: {
        googleSearch: true,
        searchPartners: true,
        displayNetwork: false,
      },
    });
    assertAllCapturedOpsEncode();
  });

  it("location targeting add", async () => {
    await updateCampaignSettings(AUTH, "100", {
      locationTargeting: { add: ["2840"] },
    });
    assertAllCapturedOpsEncode();
  });

  it("location targeting remove", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          resource_name:
            "customers/1234567890/campaignCriteria/100~1001",
          location: {
            geo_target_constant: "geoTargetConstants/2840",
          },
          negative: false,
        },
      },
    ]);
    await updateCampaignSettings(AUTH, "100", {
      locationTargeting: { remove: ["2840"] },
    });
    assertAllCapturedOpsEncode();
  });

  it("negative location targeting add", async () => {
    await updateCampaignSettings(AUTH, "100", {
      negativeLocationTargeting: { add: ["2840"] },
    });
    assertAllCapturedOpsEncode();
  });

  it("negative location targeting remove", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          resource_name:
            "customers/1234567890/campaignCriteria/100~2002",
          location: {
            geo_target_constant: "geoTargetConstants/2840",
          },
          negative: true,
        },
      },
    ]);
    await updateCampaignSettings(AUTH, "100", {
      negativeLocationTargeting: { remove: ["2840"] },
    });
    assertAllCapturedOpsEncode();
  });

  it("ad schedule set — replaces existing", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          resource_name: "customers/1234567890/campaignCriteria/100~3003",
          ad_schedule: { day_of_week: 2, start_hour: 0, start_minute: 2, end_hour: 24, end_minute: 2 },
        },
      },
    ]);
    await updateCampaignSettings(AUTH, "100", {
      adSchedule: {
        set: [{ dayOfWeek: "ALL", startHour: 7, endHour: 23 }],
      },
    });
    assertAllCapturedOpsEncode();
  });

  it("ad schedule set — clears schedule with empty array", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          resource_name: "customers/1234567890/campaignCriteria/100~3004",
          ad_schedule: { day_of_week: 6, start_hour: 9, start_minute: 3, end_hour: 17, end_minute: 4 },
        },
      },
    ]);
    await updateCampaignSettings(AUTH, "100", {
      adSchedule: { set: [] },
    });
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: tracking templates", () => {
  beforeEach(resetMocks);

  it("setTrackingTemplate — account level", async () => {
    // Prefetch query from getTrackingTemplate
    mockQuery.mockResolvedValueOnce([
      { customer: { tracking_url_template: "" } },
    ]);
    // Signature: (auth, level, trackingTemplate, entityId?)
    await setTrackingTemplate(AUTH, "account", "{lpurl}?src=google");
    assertAllCapturedOpsEncode();
  });

  it("setTrackingTemplate — campaign level", async () => {
    // Prefetch query from getTrackingTemplate
    mockQuery.mockResolvedValueOnce([
      { campaign: { tracking_url_template: "" } },
    ]);
    await setTrackingTemplate(AUTH, "campaign", "{lpurl}?src=google", "100");
    assertAllCapturedOpsEncode();
  });

  it("setTrackingTemplate — ad_group level", async () => {
    // Prefetch query from getTrackingTemplate
    mockQuery.mockResolvedValueOnce([
      { ad_group: { tracking_url_template: "" }, campaign: { id: 100 } },
    ]);
    await setTrackingTemplate(AUTH, "ad_group", "{lpurl}?src=google", "200");
    assertAllCapturedOpsEncode();
  });

  it("setTrackingTemplate — ad level", async () => {
    // Prefetch query from getTrackingTemplate
    mockQuery.mockResolvedValueOnce([
      { ad_group_ad: { ad: { tracking_url_template: "" } }, campaign: { id: 100 } },
    ]);
    await setTrackingTemplate(AUTH, "ad", "{lpurl}?src=google", "300");
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: ad group management", () => {
  beforeEach(resetMocks);

  it("createAdGroup", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {
              ad_group_result: {
                resource_name: "customers/1234567890/adGroups/77777",
              },
            },
          ],
        }),
      );
    });
    await createAdGroup(AUTH, "100", "Test Ad Group");
    assertAllCapturedOpsEncode();
  });

  it("renameAdGroup", async () => {
    mockQuery.mockResolvedValueOnce([
      { ad_group: { name: "Old Group" } },
    ]);
    await renameAdGroup(AUTH, "100", "200", "New Group");
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: ad management", () => {
  beforeEach(resetMocks);

  it("createAd", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            {
              ad_group_ad_result: {
                resource_name:
                  "customers/1234567890/adGroupAds/200~88888",
              },
            },
          ],
        }),
      );
    });
    await createAd(AUTH, "200", {
      headlines: ["H1", "H2", "H3"],
      descriptions: ["D1", "D2"],
      finalUrl: "https://example.com",
    });
    assertAllCapturedOpsEncode();
  });

  it("pauseAd", async () => {
    await pauseAd(AUTH, "200", "300");
    assertAllCapturedOpsEncode();
  });

  it("enableAd", async () => {
    await enableAd(AUTH, "200", "300");
    assertAllCapturedOpsEncode();
  });

  it("updateAdFinalUrl", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_ad: {
          ad: { final_urls: ["https://old.com"] },
        },
      },
    ]);
    await updateAdFinalUrl(AUTH, "200", "300", "https://new.com");
    assertAllCapturedOpsEncode();
  });

  it("updateAdAssets", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_ad: {
          ad: {
            responsive_search_ad: {
              headlines: [{ text: "Old H1" }],
              descriptions: [{ text: "Old D1" }],
            },
          },
        },
      },
    ]);
    await updateAdAssets(AUTH, "200", "300", {
      headlines: [
        { text: "New H1" },
        { text: "New H2" },
        { text: "New H3" },
      ],
      descriptions: [{ text: "New D1" }, { text: "New D2" }],
    });
    assertAllCapturedOpsEncode();
  });

  it("updateAdAssets with pin values", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_ad: {
          ad: {
            responsive_search_ad: {
              headlines: [{ text: "Old H1" }],
              descriptions: [{ text: "Old D1" }],
            },
          },
        },
      },
    ]);
    await updateAdAssets(AUTH, "200", "300", {
      headlines: [
        { text: "Pinned H1", pin: 1 },
        { text: "H2" },
        { text: "H3", pin: 3 },
      ],
      descriptions: [{ text: "Pinned D1", pin: 1 }, { text: "D2" }],
    });
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: bulk operations", () => {
  beforeEach(resetMocks);

  it("bulkUpdateBids", async () => {
    // bulkUpdateBids does 1 query per campaign (batch), not per keyword
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { bidding_strategy_type: "MANUAL_CPC" },
        ad_group: { id: "111" },
        ad_group_criterion: { criterion_id: "222", cpc_bid_micros: 1_000_000 },
      },
      {
        campaign: { bidding_strategy_type: "MANUAL_CPC" },
        ad_group: { id: "111" },
        ad_group_criterion: { criterion_id: "333", cpc_bid_micros: 2_000_000 },
      },
    ]);

    await bulkUpdateBids(AUTH, [
      {
        campaignId: "100",
        adGroupId: "111",
        criterionId: "222",
        newBidDollars: 1.1,
      },
      {
        campaignId: "100",
        adGroupId: "111",
        criterionId: "333",
        newBidDollars: 2.2,
      },
    ]);
    assertAllCapturedOpsEncode();
  });

  it("bulkPauseKeywords", async () => {
    // bulkPauseKeywords does 1 query per campaign for active keyword count
    // Must return MORE active keywords than we're pausing
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222" } },
      { ad_group_criterion: { criterion_id: "333" } },
      { ad_group_criterion: { criterion_id: "444" } },
    ]);

    await bulkPauseKeywords(AUTH, [
      { campaignId: "100", adGroupId: "111", criterionId: "222" },
      { campaignId: "100", adGroupId: "111", criterionId: "333" },
    ]);
    assertAllCapturedOpsEncode();
  });

  it("bulkAddKeywords", async () => {
    // bulkAddKeywords does a single batch mutate and returns responses per keyword
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve({
        mutate_operation_responses: [
          {
            ad_group_criterion_result: {
              resource_name: "customers/1234567890/adGroupCriteria/111~10001",
            },
          },
          {
            ad_group_criterion_result: {
              resource_name: "customers/1234567890/adGroupCriteria/111~10002",
            },
          },
        ],
      });
    });

    // BulkAddKeywordInput uses { keyword: string, matchType?: ... }
    await bulkAddKeywords(AUTH, "111", [
      { keyword: "keyword one", matchType: "PHRASE" },
      { keyword: "keyword two", matchType: "EXACT" },
    ]);
    assertAllCapturedOpsEncode();
  });

  it("moveKeywords", async () => {
    // Step 1: query keyword text
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_criterion: {
          criterion_id: "222",
          keyword: { text: "test kw", match_type: "PHRASE" },
        },
      },
    ]);

    // Step 2: addKeyword to destination
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve({
        mutate_operation_responses: [
          {
            ad_group_criterion_result: {
              resource_name:
                "customers/1234567890/adGroupCriteria/300~55555",
            },
          },
        ],
      });
    });

    // Step 3: pauseKeyword in source — needs active keyword count query
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222" } },
      { ad_group_criterion: { criterion_id: "444" } },
    ]);

    // The pauseKeyword mutate call
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(defaultMutateResponse());
    });

    await moveKeywords(AUTH, "100", "200", "300", ["222"], "PHRASE");
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: asset extensions", () => {
  beforeEach(resetMocks);

  it("addCalloutAsset creates an asset and campaign_asset link", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            { asset_result: { resource_name: "customers/1234567890/assets/999" } },
            { campaign_asset_result: { resource_name: "customers/1234567890/campaignAssets/100~999~11" } },
          ],
        }),
      );
    });

    await addCalloutAsset(AUTH, {
      text: "Free shipping",
      targets: [{ level: "campaign", campaignId: "100" }],
    });
    assertAllCapturedOpsEncode();
  });

  it("linkCalloutAsset creates an ad_group_asset link", async () => {
    mockQuery.mockResolvedValueOnce([{ asset: { source: "ADVERTISER" } }]);
    await linkCalloutAsset(AUTH, {
      assetId: "999",
      target: { level: "ad_group", adGroupId: "111" },
    });
    assertAllCapturedOpsEncode();
  });

  it("addStructuredSnippetAsset creates an asset and campaign_asset links", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            { asset_result: { resource_name: "customers/1234567890/assets/999" } },
            { campaign_asset_result: { resource_name: "customers/1234567890/campaignAssets/100~999~12" } },
            { campaign_asset_result: { resource_name: "customers/1234567890/campaignAssets/200~999~12" } },
          ],
        }),
      );
    });

    await addStructuredSnippetAsset(AUTH, {
      header: "Services",
      values: ["Plumbing", "Electrical", "HVAC"],
      targets: [
        { level: "campaign", campaignId: "100" },
        { level: "campaign", campaignId: "200" },
      ],
    });
    assertAllCapturedOpsEncode();
  });

  it("unlinkStructuredSnippetAsset removes link resources as strings", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_asset: {
          resource_name: "customers/1234567890/campaignAssets/100~999~12",
        },
      },
    ]);

    await unlinkStructuredSnippetAsset(AUTH, {
      assetId: "999",
      target: { level: "campaign", campaignId: "100" },
    });
    assertAllCapturedOpsEncode();
  });

  it("addSitelinkAsset creates an asset and campaign_asset link", async () => {
    mockMutateResources.mockImplementationOnce((ops: CapturedOperation[]) => {
      capturedOps.push(ops);
      return Promise.resolve(
        defaultMutateResponse({
          mutate_operation_responses: [
            { asset_result: { resource_name: "customers/1234567890/assets/999" } },
            { campaign_asset_result: { resource_name: "customers/1234567890/campaignAssets/100~999~13" } },
          ],
        }),
      );
    });

    await addSitelinkAsset(AUTH, {
      linkText: "Pricing",
      finalUrl: "https://example.com/pricing",
      description1: "See current plans",
      description2: "Compare every option",
      targets: [{ level: "campaign", campaignId: "100" }],
    });
    assertAllCapturedOpsEncode();
  });

  it("linkSitelinkAsset creates an account-level customer_asset link", async () => {
    mockQuery.mockResolvedValueOnce([{ asset: { source: "ADVERTISER" } }]);
    await linkSitelinkAsset(AUTH, {
      assetId: "999",
      target: { level: "account" },
    });
    assertAllCapturedOpsEncode();
  });

  it("unlinkSitelinkAsset removes link resources as strings", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        ad_group_asset: {
          resource_name: "customers/1234567890/adGroupAssets/111~999~13",
        },
      },
    ]);

    await unlinkSitelinkAsset(AUTH, {
      assetId: "999",
      target: { level: "ad_group", adGroupId: "111" },
    });
    assertAllCapturedOpsEncode();
  });
});

describe("protobuf validation: invariants", () => {
  beforeEach(resetMocks);

  it("every remove operation across all functions uses a string resource", async () => {
    // Run every remove function
    await removeKeyword(AUTH, "111", "222");
    await removeCampaign(AUTH, "777");

    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          keyword: { text: "junk" },
          criterion_id: "888",
        },
      },
    ]);
    await removeNegativeKeyword(AUTH, "555", "junk");

    // Location remove via updateCampaignSettings
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          resource_name:
            "customers/1234567890/campaignCriteria/100~9999",
          location: {
            geo_target_constant: "geoTargetConstants/2840",
          },
          negative: false,
        },
      },
    ]);
    await updateCampaignSettings(AUTH, "100", {
      locationTargeting: { remove: ["2840"] },
    });

    // All must encode
    assertAllCapturedOpsEncode();

    // Extra check: all removes specifically use string
    const removeOps = capturedOps
      .flat()
      .filter((op) => op.operation === "remove");
    expect(removeOps.length).toBeGreaterThanOrEqual(4);
    for (const op of removeOps) {
      expect(
        typeof op.resource,
        `remove op for ${op.entity} has object resource: ${JSON.stringify(op.resource)}`,
      ).toBe("string");
    }
  });
});
