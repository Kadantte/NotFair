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

const capturedOps: Array<
  { entity: string; operation: string; resource: unknown }[]
> = [];

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
  createSearchCampaign,
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
  mockMutateResources.mockImplementation((ops: any[]) => {
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
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
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

  it("createSearchCampaign", async () => {
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
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
    await createSearchCampaign(AUTH, {
      campaignName: "Test Campaign",
      dailyBudgetDollars: 10,
      keywords: ["keyword one", "keyword two"],
      headlines: ["Headline 1", "Headline 2", "Headline 3"],
      descriptions: ["Description 1", "Description 2"],
      finalUrl: "https://example.com",
    });
    assertAllCapturedOpsEncode();
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
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
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
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
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
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
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
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
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
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
      capturedOps.push(ops);
      return Promise.resolve(defaultMutateResponse());
    });

    await moveKeywords(AUTH, "100", "200", "300", ["222"], "PHRASE");
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
