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

import {
  createBiddingStrategy,
  updateBiddingStrategy,
  removeBiddingStrategy,
  linkCampaignToBiddingStrategy,
  listBiddingStrategies,
  getBiddingStrategyPerformance,
} from "@/lib/google-ads";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

describe("portfolio bidding strategies (RMF C.96/97, M.96/97, R.130)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
    });
  });

  describe("createBiddingStrategy", () => {
    it("creates a TARGET_CPA portfolio with target_cpa_micros", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { bidding_strategy_result: { resource_name: "customers/1301265570/biddingStrategies/777" } },
        ],
      });
      const result = await createBiddingStrategy(auth, {
        name: "Lead Gen CPA",
        type: "TARGET_CPA",
        targetCpaMicros: 5_000_000,
      });
      expect(result).toMatchObject({ success: true, entityId: "777", action: "create_bidding_strategy" });
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        name: "Lead Gen CPA",
        target_cpa: { target_cpa_micros: 5_000_000 },
      });
    });

    it("creates a TARGET_ROAS portfolio with target_roas", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { bidding_strategy_result: { resource_name: "customers/1301265570/biddingStrategies/888" } },
        ],
      });
      const result = await createBiddingStrategy(auth, {
        name: "Shop ROAS",
        type: "TARGET_ROAS",
        targetRoas: 2.0,
      });
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        name: "Shop ROAS",
        target_roas: { target_roas: 2.0 },
      });
    });

    it("rejects TARGET_CPA without targetCpaMicros", async () => {
      const result = await createBiddingStrategy(auth, {
        name: "Bad",
        type: "TARGET_CPA",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/targetCpaMicros is required/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects TARGET_ROAS without targetRoas", async () => {
      const result = await createBiddingStrategy(auth, {
        name: "Bad",
        type: "TARGET_ROAS",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/targetRoas is required/);
    });

    it("rejects empty name", async () => {
      const result = await createBiddingStrategy(auth, {
        name: "   ",
        type: "TARGET_CPA",
        targetCpaMicros: 5_000_000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot be empty/i);
    });

    it("rejects CPA below $0.10 floor", async () => {
      const result = await createBiddingStrategy(auth, {
        name: "Cheap",
        type: "TARGET_CPA",
        targetCpaMicros: 50_000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/\$0\.10/);
    });

    it("rejects non-positive ROAS", async () => {
      const result = await createBiddingStrategy(auth, {
        name: "Zero",
        type: "TARGET_ROAS",
        targetRoas: 0,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/greater than 0/);
    });
  });

  describe("updateBiddingStrategy", () => {
    it("updates target_cpa on a TARGET_CPA strategy", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          bidding_strategy: {
            id: "777",
            name: "Lead Gen CPA",
            type: "TARGET_CPA",
            target_cpa: { target_cpa_micros: 5_000_000 },
          },
        },
      ]);
      mockMutateResources.mockResolvedValueOnce({});

      const result = await updateBiddingStrategy(auth, {
        biddingStrategyId: "777",
        targetCpaMicros: 7_000_000,
      });
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        resource_name: "customers/1301265570/biddingStrategies/777",
        target_cpa: { target_cpa_micros: 7_000_000 },
      });
    });

    it("updates target_roas on a TARGET_ROAS strategy", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          bidding_strategy: {
            id: "888",
            name: "Shop ROAS",
            type: "TARGET_ROAS",
            target_roas: { target_roas: 2.0 },
          },
        },
      ]);
      mockMutateResources.mockResolvedValueOnce({});

      const result = await updateBiddingStrategy(auth, {
        biddingStrategyId: "888",
        targetRoas: 3.0,
      });
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        resource_name: "customers/1301265570/biddingStrategies/888",
        target_roas: { target_roas: 3.0 },
      });
    });

    it("returns not-found for missing strategy", async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await updateBiddingStrategy(auth, {
        biddingStrategyId: "999",
        targetCpaMicros: 5_000_000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/);
    });

    it("rejects setting ROAS on a CPA strategy", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          bidding_strategy: { id: "777", name: "x", type: "TARGET_CPA", target_cpa: { target_cpa_micros: 5_000_000 } },
        },
      ]);
      const result = await updateBiddingStrategy(auth, {
        biddingStrategyId: "777",
        targetRoas: 2.0,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Cannot set targetRoas/);
    });
  });

  describe("removeBiddingStrategy", () => {
    it("sends a remove mutation with the full resource name", async () => {
      mockMutateResources.mockResolvedValueOnce({});
      const result = await removeBiddingStrategy(auth, "777");
      expect(result.success).toBe(true);
      expect(result.afterValue).toBe("REMOVED");
      expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
        entity: "bidding_strategy",
        operation: "remove",
        resource: "customers/1301265570/biddingStrategies/777",
      });
    });
  });

  describe("linkCampaignToBiddingStrategy", () => {
    it("sets campaign.bidding_strategy to the portfolio resource name", async () => {
      mockQuery.mockResolvedValueOnce([
        { campaign: { bidding_strategy: null, bidding_strategy_type: "TARGET_CPA" } },
      ]);
      mockMutateResources.mockResolvedValueOnce({});
      const result = await linkCampaignToBiddingStrategy(auth, "111", "777");
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        resource_name: "customers/1301265570/campaigns/111",
        bidding_strategy: "customers/1301265570/biddingStrategies/777",
      });
    });

    it("returns campaign-not-found when query returns empty", async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await linkCampaignToBiddingStrategy(auth, "111", "777");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Campaign not found/);
    });
  });

  describe("listBiddingStrategies", () => {
    it("returns normalized rows with target values extracted from the right subtype", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          bidding_strategy: {
            id: "777",
            name: "Lead Gen CPA",
            type: "TARGET_CPA",
            status: "ENABLED",
            target_cpa: { target_cpa_micros: 5_000_000 },
            campaign_count: 2,
          },
        },
        {
          bidding_strategy: {
            id: "888",
            name: "Shop ROAS",
            type: "TARGET_ROAS",
            status: "ENABLED",
            target_roas: { target_roas: 2.5 },
            campaign_count: 0,
          },
        },
      ]);
      const result = await listBiddingStrategies(auth);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "777",
        name: "Lead Gen CPA",
        type: "TARGET_CPA",
        targetCpaMicros: 5_000_000,
        targetRoas: null,
        linkedCampaignCount: 2,
      });
      expect(result[1]).toMatchObject({
        id: "888",
        type: "TARGET_ROAS",
        targetRoas: 2.5,
        targetCpaMicros: null,
        linkedCampaignCount: 0,
      });
    });
  });

  describe("getBiddingStrategyPerformance (R.130)", () => {
    it("returns the RMF-required metrics aggregated per strategy", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          bidding_strategy: { id: "777", name: "Lead Gen CPA", type: "TARGET_CPA", status: "ENABLED" },
          metrics: {
            clicks: 1250,
            cost_micros: 8_500_000,
            impressions: 45_000,
            average_cpc: 6_800,
            conversions: 42,
            cost_per_conversion: 200_000,
          },
        },
      ]);
      const result = await getBiddingStrategyPerformance(auth, { days: 30 });
      expect(result.strategies).toHaveLength(1);
      expect(result.strategies[0]).toMatchObject({
        id: "777",
        clicks: 1250,
        costMicros: 8_500_000,
        impressions: 45_000,
        averageCpcMicros: 6_800,
        conversions: 42,
        costPerConversionMicros: 200_000,
      });
      expect(result.dateRange.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.dateRange.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("includes REMOVED strategies only when asked", async () => {
      // Use distinct `days` values so the per-customer query cache doesn't
      // collide with other tests' identical queries.
      mockQuery.mockResolvedValueOnce([]);
      await getBiddingStrategyPerformance(auth, { includeRemoved: true, days: 17 });
      const query = String(mockQuery.mock.calls.at(-1)?.[0] ?? "");
      expect(query).not.toMatch(/status != 'REMOVED'/);

      mockQuery.mockResolvedValueOnce([]);
      await getBiddingStrategyPerformance(auth, { includeRemoved: false, days: 19 });
      const query2 = String(mockQuery.mock.calls.at(-1)?.[0] ?? "");
      expect(query2).toMatch(/status != 'REMOVED'/);
    });
  });
});
