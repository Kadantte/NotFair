import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockMutateResources, mockQuery } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
  mockMutateResources: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn((name: string) => `${name.toLowerCase()}-value`),
  getEnv: vi.fn((name: string) => `${name.toLowerCase()}-value`),
}));

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer = mockCustomerFactory;
  },
}));

import { createCampaign, updateCampaignLanguages } from "@/lib/google-ads";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

describe("language targeting (RMF C.30 / M.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
    });
  });

  describe("createCampaign (SEARCH) with languageIds + geoTargetIds", () => {
    it("adds campaign_criterion.language and campaign_criterion.location rows to the batch", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          {}, // budget
          { campaign_result: { resource_name: "customers/1301265570/campaigns/12345" } },
          { ad_group_result: { resource_name: "customers/1301265570/adGroups/67890" } },
          {}, // keyword
          {}, // ad
          {}, // geo
          {}, // language
        ],
      });

      const result = await createCampaign(auth, {
        campaignType: "SEARCH",
        campaignName: "Test",
        dailyBudgetDollars: 10,
        keywords: ["buy widgets"],
        headlines: ["Buy Widgets Online", "Fast Delivery Today", "Shop Widgets Now"],
        descriptions: ["Huge selection of widgets.", "Free shipping over $50."],
        finalUrl: "https://example.com",
        geoTargetIds: ["2840"],
        languageIds: ["1000", "1003"],
      });

      expect(result.success).toBe(true);
      expect(result.campaignId).toBe("12345");

      const ops = mockMutateResources.mock.calls[0][0] as any[];
      const geoOps = ops.filter((op) => op.entity === "campaign_criterion" && op.resource.location);
      const langOps = ops.filter((op) => op.entity === "campaign_criterion" && op.resource.language);

      expect(geoOps).toHaveLength(1);
      expect(geoOps[0].resource.location.geo_target_constant).toBe("geoTargetConstants/2840");

      expect(langOps).toHaveLength(2);
      expect(langOps[0].resource.language.language_constant).toBe("languageConstants/1000");
      expect(langOps[1].resource.language.language_constant).toBe("languageConstants/1003");
    });

    it("accepts full resource names as well as bare IDs", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          {},
          { campaign_result: { resource_name: "customers/1301265570/campaigns/55555" } },
          { ad_group_result: { resource_name: "customers/1301265570/adGroups/99999" } },
          {}, {}, {},
        ],
      });
      await createCampaign(auth, {
        campaignType: "SEARCH",
        campaignName: "Test",
        dailyBudgetDollars: 5,
        keywords: ["x"],
        headlines: ["x x x", "y y y", "z z z"],
        descriptions: ["abc def ghi.", "jkl mno pqr."],
        finalUrl: "https://example.com",
        languageIds: ["languageConstants/1000"],
      });
      const ops = mockMutateResources.mock.calls[0][0] as any[];
      const langOps = ops.filter((op) => op.entity === "campaign_criterion" && op.resource.language);
      expect(langOps[0].resource.language.language_constant).toBe("languageConstants/1000");
    });

    it("works with no languages (preserves existing behavior)", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          {},
          { campaign_result: { resource_name: "customers/1301265570/campaigns/11111" } },
          { ad_group_result: { resource_name: "customers/1301265570/adGroups/22222" } },
          {}, {},
        ],
      });
      const result = await createCampaign(auth, {
        campaignType: "SEARCH",
        campaignName: "Test",
        dailyBudgetDollars: 5,
        keywords: ["x"],
        headlines: ["x x x", "y y y", "z z z"],
        descriptions: ["abc def ghi.", "jkl mno pqr."],
        finalUrl: "https://example.com",
      });
      expect(result.success).toBe(true);
      const ops = mockMutateResources.mock.calls[0][0] as any[];
      const langOps = ops.filter((op) => op.entity === "campaign_criterion" && op.resource.language);
      expect(langOps).toHaveLength(0);
    });
  });

  describe("updateCampaignLanguages", () => {
    it("adds new language criteria", async () => {
      mockMutateResources.mockResolvedValueOnce({});
      const result = await updateCampaignLanguages(auth, "111", { add: ["1000"] });
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        campaign: "customers/1301265570/campaigns/111",
        language: { language_constant: "languageConstants/1000" },
      });
    });

    it("removes existing language criteria by looking up resource names", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          campaign_criterion: {
            resource_name: "customers/1301265570/campaignCriteria/111~1000",
            language: { language_constant: "languageConstants/1000" },
          },
        },
      ]);
      mockMutateResources.mockResolvedValueOnce({});
      const result = await updateCampaignLanguages(auth, "111", { remove: ["1000"] });
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
        entity: "campaign_criterion",
        operation: "remove",
        resource: "customers/1301265570/campaignCriteria/111~1000",
      });
    });

    it("reports not-found when the language isn't targeted", async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await updateCampaignLanguages(auth, "111", { remove: ["1000"] });
      expect(result.success).toBe(false);
      expect(result.results[0].error).toMatch(/not found/);
    });

    it("rejects empty input", async () => {
      const result = await updateCampaignLanguages(auth, "111", {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/No languages/);
    });
  });
});
