import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn().mockResolvedValue([]);

vi.mock("google-ads-api", () => {
  return {
    GoogleAdsApi: class {
      Customer() {
        return { query: mockQuery };
      }
    },
  };
});

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("mock-value"),
}));

import { getAccountBudgetSummary, clearCache, type AuthContext } from "@/lib/google-ads";

const auth: AuthContext = { refreshToken: "test-token", customerId: "1234567890" };

beforeEach(() => {
  mockQuery.mockReset();
  clearCache();
});

describe("getAccountBudgetSummary", () => {
  it("returns zeros for no campaigns", async () => {
    mockQuery.mockResolvedValue([]);
    const result = await getAccountBudgetSummary(auth);
    expect(result.totalDailyBudget).toBe(0);
    expect(result.activeCampaigns).toBe(0);
    expect(result.currencyCode).toBeNull();
  });

  it("sums distinct budgets correctly", async () => {
    mockQuery.mockResolvedValue([
      {
        campaign: { id: "1", campaign_budget: "customers/123/campaignBudgets/1" },
        campaign_budget: { amount_micros: 10_000_000 },
        customer: { currency_code: "USD" },
      },
      {
        campaign: { id: "2", campaign_budget: "customers/123/campaignBudgets/2" },
        campaign_budget: { amount_micros: 20_000_000 },
        customer: { currency_code: "USD" },
      },
    ]);
    const result = await getAccountBudgetSummary(auth);
    expect(result.totalDailyBudget).toBe(30);
    expect(result.activeCampaigns).toBe(2);
    expect(result.currencyCode).toBe("USD");
  });

  it("deduplicates shared budgets", async () => {
    const sharedBudget = "customers/123/campaignBudgets/1";
    mockQuery.mockResolvedValue([
      {
        campaign: { id: "1", campaign_budget: sharedBudget },
        campaign_budget: { amount_micros: 50_000_000 },
        customer: { currency_code: "EUR" },
      },
      {
        campaign: { id: "2", campaign_budget: sharedBudget },
        campaign_budget: { amount_micros: 50_000_000 },
        customer: { currency_code: "EUR" },
      },
    ]);
    const result = await getAccountBudgetSummary(auth);
    expect(result.totalDailyBudget).toBe(50);
    expect(result.activeCampaigns).toBe(2);
    expect(result.currencyCode).toBe("EUR");
  });

  it("handles missing amount_micros", async () => {
    mockQuery.mockResolvedValue([
      {
        campaign: { id: "1", campaign_budget: "customers/123/campaignBudgets/1" },
        campaign_budget: {},
        customer: { currency_code: "USD" },
      },
    ]);
    const result = await getAccountBudgetSummary(auth);
    expect(result.totalDailyBudget).toBe(0);
    expect(result.activeCampaigns).toBe(1);
  });

  it("handles missing currency_code", async () => {
    mockQuery.mockResolvedValue([
      {
        campaign: { id: "1", campaign_budget: "customers/123/campaignBudgets/1" },
        campaign_budget: { amount_micros: 5_000_000 },
        customer: {},
      },
    ]);
    const result = await getAccountBudgetSummary(auth);
    expect(result.currencyCode).toBeNull();
    expect(result.totalDailyBudget).toBe(5);
  });
});
