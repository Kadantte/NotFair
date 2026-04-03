/**
 * Tests for Google Ads mutateResources operation format.
 *
 * The google-ads-api library's mutateResources() builds operations like:
 *   { [operation]: mutation.resource }
 *
 * For "remove" operations, the Google Ads API expects:
 *   { remove: "customers/123/adGroupCriteria/456~789" }  ← resource name string
 *
 * For "create"/"update" operations, it expects:
 *   { create: { field: value, ... } }  ← resource object
 *
 * Passing { resource_name: "..." } to a remove operation produces:
 *   { remove: { resource_name: "..." } }  ← WRONG, API rejects this
 *
 * These tests mock mutateResources to capture the operations passed in
 * and verify the format is correct for each mutation function.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the google-ads-api module before importing the module under test
const mockMutateResources = vi.fn().mockResolvedValue({
  mutate_operation_responses: [],
});
const mockQuery = vi.fn().mockResolvedValue([]);
const mockCustomer = {
  mutateResources: mockMutateResources,
  query: mockQuery,
};

vi.mock("google-ads-api", () => {
  return {
    GoogleAdsApi: class {
      Customer() {
        return mockCustomer;
      }
    },
  };
});

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("mock-value"),
}));

import {
  removeKeyword,
  removeNegativeKeyword,
  removeCampaign,
  pauseKeyword,
  enableKeyword,
  addKeyword,
  updateBid,
  pauseCampaign,
  enableCampaign,
  addNegativeKeyword,
  updateCampaignSettings,
  type AuthContext,
} from "@/lib/google-ads";

const AUTH: AuthContext = {
  refreshToken: "test-refresh-token",
  customerId: "123-456-7890",
};

/**
 * Helper: asserts every "remove" operation in a mutateResources call
 * passes resource as a string (not an object).
 */
function assertRemoveResourceIsString(
  calls: any[][],
  msg?: string,
) {
  for (const call of calls) {
    const ops = call[0];
    if (!Array.isArray(ops)) continue;
    for (const op of ops) {
      if (op.operation === "remove") {
        expect(typeof op.resource, msg ?? `remove resource should be string, got: ${JSON.stringify(op.resource)}`).toBe("string");
      }
    }
  }
}

describe("mutateResources operation format", () => {
  beforeEach(() => {
    mockMutateResources.mockClear();
    mockQuery.mockClear();
    mockMutateResources.mockResolvedValue({
      mutate_operation_responses: [],
    });
  });

  describe("remove operations must pass resource as a string", () => {
    it("removeKeyword passes resource as a string, not an object", async () => {
      await removeKeyword(AUTH, "111", "222");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations).toHaveLength(1);
      expect(operations[0].operation).toBe("remove");
      // Resource MUST be a string for remove operations
      expect(typeof operations[0].resource).toBe("string");
      expect(operations[0].resource).toBe(
        "customers/1234567890/adGroupCriteria/111~222",
      );
    });

    it("removeNegativeKeyword passes resource as a string, not an object", async () => {
      // Mock the query that looks up the negative keyword's criterion ID
      mockQuery.mockResolvedValueOnce([
        {
          campaign_criterion: {
            keyword: { text: "free stuff" },
            criterion_id: "999",
          },
        },
      ]);

      await removeNegativeKeyword(AUTH, "555", "free stuff");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations).toHaveLength(1);
      expect(operations[0].operation).toBe("remove");
      expect(typeof operations[0].resource).toBe("string");
      expect(operations[0].resource).toContain("campaignCriteria/");
    });

    it("removeCampaign passes resource as a string, not an object", async () => {
      await removeCampaign(AUTH, "777");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations).toHaveLength(1);
      expect(operations[0].operation).toBe("remove");
      expect(typeof operations[0].resource).toBe("string");
      expect(operations[0].resource).toBe(
        "customers/1234567890/campaigns/777",
      );
    });
  });

  describe("update operations must pass resource as an object", () => {
    it("pauseKeyword passes resource as an object with resource_name", async () => {
      // Mock: needs to check active keyword count first
      mockQuery.mockResolvedValueOnce([
        { ad_group_criterion: { criterion_id: "222" } },
        { ad_group_criterion: { criterion_id: "333" } },
      ]);

      await pauseKeyword(AUTH, "100", "111", "222");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations).toHaveLength(1);
      expect(operations[0].operation).toBe("update");
      expect(typeof operations[0].resource).toBe("object");
      expect(operations[0].resource.resource_name).toBe(
        "customers/1234567890/adGroupCriteria/111~222",
      );
    });

    it("enableKeyword passes resource as an object with resource_name", async () => {
      await enableKeyword(AUTH, "111", "222");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations[0].operation).toBe("update");
      expect(typeof operations[0].resource).toBe("object");
      expect(operations[0].resource.resource_name).toBeDefined();
    });

    it("updateBid passes resource as an object with cpc_bid_micros", async () => {
      // Mock: updateBid queries bidding strategy + current bid first
      mockQuery.mockResolvedValueOnce([
        {
          campaign: { bidding_strategy_type: "MANUAL_CPC" },
          ad_group_criterion: { cpc_bid_micros: 1_400_000 },
        },
      ]);

      await updateBid(AUTH, "100", "111", "222", 1_500_000);

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations[0].operation).toBe("update");
      expect(typeof operations[0].resource).toBe("object");
      expect(operations[0].resource.cpc_bid_micros).toBe(1_500_000);
    });

    it("pauseCampaign passes resource as an object with status", async () => {
      await pauseCampaign(AUTH, "100");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations[0].operation).toBe("update");
      expect(typeof operations[0].resource).toBe("object");
      expect(operations[0].resource.status).toBe(3); // PAUSED
    });

    it("enableCampaign passes resource as an object with status", async () => {
      await enableCampaign(AUTH, "100");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations[0].operation).toBe("update");
      expect(typeof operations[0].resource).toBe("object");
      expect(operations[0].resource.status).toBe(2); // ENABLED
    });
  });

  describe("create operations must pass resource as an object", () => {
    it("addKeyword passes resource as an object with ad_group and keyword", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          {
            ad_group_criterion_result: {
              resource_name:
                "customers/1234567890/adGroupCriteria/111~12345",
            },
          },
        ],
      });

      await addKeyword(AUTH, "111", "test keyword", "PHRASE");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations[0].operation).toBe("create");
      expect(typeof operations[0].resource).toBe("object");
      expect(operations[0].resource.keyword).toBeDefined();
      expect(operations[0].resource.keyword.text).toBe("test keyword");
    });

    it("addNegativeKeyword passes resource as an object with campaign and keyword", async () => {
      await addNegativeKeyword(AUTH, "100", "bad keyword", "PHRASE");

      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const operations = mockMutateResources.mock.calls[0][0];
      expect(operations[0].operation).toBe("create");
      expect(typeof operations[0].resource).toBe("object");
      expect(operations[0].resource.campaign).toBeDefined();
      expect(operations[0].resource.keyword.text).toBe("bad keyword");
    });
  });

  describe("updateCampaignSettings location removes use string resources", () => {
    it("location removal operations pass resource as a string", async () => {
      // Mock the geo criteria query
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

      // Find the mutateResources call that has a remove operation
      const removeCalls = mockMutateResources.mock.calls.filter(
        (call) =>
          Array.isArray(call[0]) &&
          call[0].some((op: any) => op.operation === "remove"),
      );
      expect(removeCalls.length).toBeGreaterThan(0);

      assertRemoveResourceIsString(removeCalls);
    });
  });

  describe("invariant: all remove ops across every mutateResources call use string resource", () => {
    it("no remove operation ever passes an object resource", async () => {
      // Run a few mutation functions that use remove operations
      // and verify the invariant holds across all of them

      // removeKeyword
      await removeKeyword(AUTH, "111", "222");

      // removeCampaign
      await removeCampaign(AUTH, "777");

      // removeNegativeKeyword
      mockQuery.mockResolvedValueOnce([
        {
          campaign_criterion: {
            keyword: { text: "spam" },
            criterion_id: "888",
          },
        },
      ]);
      await removeNegativeKeyword(AUTH, "555", "spam");

      // Check ALL mutateResources calls
      assertRemoveResourceIsString(mockMutateResources.mock.calls);
    });
  });
});

describe("resource name format", () => {
  beforeEach(() => {
    mockMutateResources.mockClear();
    mockQuery.mockClear();
    mockMutateResources.mockResolvedValue({
      mutate_operation_responses: [],
    });
  });

  it("normalizes customer ID by removing dashes", async () => {
    await removeCampaign(
      { ...AUTH, customerId: "123-456-7890" },
      "999",
    );

    const resource = mockMutateResources.mock.calls[0][0][0].resource;
    expect(resource).toBe("customers/1234567890/campaigns/999");
    expect(resource).not.toContain("-");
  });

  it("removeKeyword includes adGroupId~criterionId format", async () => {
    await removeKeyword(AUTH, "111", "222");

    const op = mockMutateResources.mock.calls[0][0][0];
    // After fix: resource should be a string
    const resourceStr = typeof op.resource === "string"
      ? op.resource
      : op.resource?.resource_name;
    expect(resourceStr).toMatch(/adGroupCriteria\/111~222$/);
  });

  it("removeNegativeKeyword includes campaignCriteria with tilde separator", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          keyword: { text: "bad" },
          criterion_id: "999",
        },
      },
    ]);

    const result = await removeNegativeKeyword(AUTH, "555", "bad");
    expect(result.success).toBe(true);

    expect(mockMutateResources).toHaveBeenCalledTimes(1);
    const op = mockMutateResources.mock.calls[0][0][0];
    const resourceStr = typeof op.resource === "string"
      ? op.resource
      : op.resource?.resource_name;
    expect(resourceStr).toMatch(/campaignCriteria\/555~999$/);
  });
});
