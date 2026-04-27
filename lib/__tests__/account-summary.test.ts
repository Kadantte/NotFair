import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockQuery } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
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

import { getAccountSummary } from "@/lib/google-ads/account-summary";
import { clearCache } from "@/lib/google-ads/client";

const auth = { refreshToken: "refresh-token", customerId: "1234567890" };

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  mockCustomerFactory.mockReturnValue({ query: mockQuery });
});

// `runSafeGaqlReport` runs three queries in parallel — drive each one off the
// FROM clause so we can stub all three without depending on call order.
function routeQuery(rows: {
  customer?: unknown[];
  campaigns?: unknown[];
  conversionActions?: unknown[];
}) {
  mockQuery.mockImplementation(async (query: string) => {
    if (/FROM\s+customer\b/i.test(query)) return rows.customer ?? [];
    if (/FROM\s+campaign\b/i.test(query)) return rows.campaigns ?? [];
    if (/FROM\s+conversion_action\b/i.test(query)) return rows.conversionActions ?? [];
    return [];
  });
}

describe("getAccountSummary", () => {
  it("returns currency + time zone + tagging flags from the customer row", async () => {
    routeQuery({
      customer: [
        {
          customer: {
            id: "1234567890",
            descriptive_name: "Acme Pet Hotel",
            currency_code: "USD",
            time_zone: "America/Los_Angeles",
            auto_tagging_enabled: true,
            tracking_url_template: "https://example.com/?gclid={gclid}",
          },
        },
      ],
    });
    const summary = await getAccountSummary(auth);
    expect(summary.account).toEqual({
      id: "1234567890",
      name: "Acme Pet Hotel",
      currencyCode: "USD",
      timeZone: "America/Los_Angeles",
      autoTaggingEnabled: true,
      hasTrackingTemplate: true,
    });
  });

  it("translates the BiddingStrategyType landmines to canonical names", async () => {
    // The exact integers that caused the production misread that motivated
    // this tool. If any of these flip silently the regression is on us, not
    // the LLM.
    routeQuery({
      campaigns: [
        {
          campaign: {
            id: "1",
            name: "Boarding — Maximize Conversions",
            status: 2, // ENABLED
            advertising_channel_type: 2, // SEARCH
            bidding_strategy_type: 10, // MAXIMIZE_CONVERSIONS
            target_cpa: { target_cpa_micros: 25_000_000 },
            network_settings: {
              target_google_search: true,
              target_search_network: false,
              target_content_network: false,
            },
          },
          campaign_budget: { amount_micros: 50_000_000 },
        },
        {
          campaign: {
            id: "2",
            name: "Daycare — Target ROAS",
            status: 2,
            advertising_channel_type: 2,
            bidding_strategy_type: 8, // TARGET_ROAS
            target_roas: { target_roas: 4.0 },
            network_settings: {
              target_google_search: true,
              target_search_network: true,
              target_content_network: false,
            },
          },
          campaign_budget: { amount_micros: 30_000_000 },
        },
        {
          campaign: {
            id: "3",
            name: "Brand — Target Impression Share",
            status: 2,
            advertising_channel_type: 2,
            bidding_strategy_type: 15, // TARGET_IMPRESSION_SHARE — NOT MaxClicks
            network_settings: {
              target_google_search: true,
              target_search_network: false,
              target_content_network: false,
            },
          },
          campaign_budget: { amount_micros: 10_000_000 },
        },
      ],
    });

    const summary = await getAccountSummary(auth);
    expect(summary.campaigns.map((c) => c.biddingStrategy)).toEqual([
      "MAXIMIZE_CONVERSIONS",
      "TARGET_ROAS",
      "TARGET_IMPRESSION_SHARE",
    ]);
  });

  it("converts target_cpa_micros and budget micros to major units", async () => {
    routeQuery({
      campaigns: [
        {
          campaign: {
            id: "1",
            name: "Boarding",
            status: 2,
            advertising_channel_type: 2,
            bidding_strategy_type: 6, // TARGET_CPA
            target_cpa: { target_cpa_micros: 11_000_000 },
            network_settings: {
              target_google_search: true,
              target_search_network: false,
              target_content_network: false,
            },
          },
          campaign_budget: { amount_micros: 75_500_000 },
        },
      ],
    });
    const [c] = (await getAccountSummary(auth)).campaigns;
    expect(c.targetCpa).toBe(11);
    expect(c.dailyBudget).toBe(75.5);
    expect(c.targetRoas).toBeNull();
  });

  it("reads tCPA from maximize_conversions.target_cpa_micros (the optional cap form)", async () => {
    routeQuery({
      campaigns: [
        {
          campaign: {
            id: "1",
            name: "Capped MaxConv",
            status: 2,
            advertising_channel_type: 2,
            bidding_strategy_type: 10, // MAXIMIZE_CONVERSIONS
            // No target_cpa.target_cpa_micros — value lives under maximize_conversions
            maximize_conversions: { target_cpa_micros: 18_000_000 },
            network_settings: {
              target_google_search: true,
              target_search_network: false,
              target_content_network: false,
            },
          },
          campaign_budget: { amount_micros: 50_000_000 },
        },
      ],
    });
    const [c] = (await getAccountSummary(auth)).campaigns;
    expect(c.biddingStrategy).toBe("MAXIMIZE_CONVERSIONS");
    expect(c.targetCpa).toBe(18);
  });

  it("flags manager-owned conversion actions as read-only", async () => {
    routeQuery({
      conversionActions: [
        {
          conversion_action: {
            id: "111",
            name: "First Booking Import",
            status: 2, // ENABLED
            category: 4, // PURCHASE (per ConversionActionCategory enum)
            type: 7, // UPLOAD_CLICKS
            counting_type: 2,
            include_in_conversions_metric: true,
            primary_for_goal: true,
            owner_customer: "customers/1234567890", // same as auth — owned here
            value_settings: { default_value: 425 },
          },
        },
        {
          conversion_action: {
            id: "222",
            name: "Inherited GA4 Purchase",
            status: 2,
            category: 4,
            type: 41, // GOOGLE_ANALYTICS_4_PURCHASE
            counting_type: 2,
            include_in_conversions_metric: true,
            primary_for_goal: false,
            owner_customer: "customers/9999999999", // different — manager-owned
          },
        },
      ],
    });

    const summary = await getAccountSummary(auth);
    expect(summary.conversionActions).toHaveLength(2);
    expect(summary.conversionActions[0]).toMatchObject({
      id: "111",
      name: "First Booking Import",
      status: "ENABLED",
      primaryForGoal: true,
      isManagerOwned: false,
      defaultValue: 425,
    });
    expect(summary.conversionActions[1]).toMatchObject({
      id: "222",
      isManagerOwned: true,
      primaryForGoal: false,
    });
  });

  it("warns when no enabled conversion action is primary_for_goal", async () => {
    routeQuery({
      conversionActions: [
        {
          conversion_action: {
            id: "1",
            name: "Form Fill",
            status: 2,
            category: 13, // SUBMIT_LEAD_FORM
            type: 8, // WEBSITE
            counting_type: 1,
            include_in_conversions_metric: true,
            primary_for_goal: false,
            owner_customer: "customers/1234567890",
          },
        },
      ],
    });
    const summary = await getAccountSummary(auth);
    expect(summary.conversionActions[0].category).toBe("SUBMIT_LEAD_FORM");
    expect(summary.notes.some((n) => n.includes("primary_for_goal"))).toBe(true);
  });

  it("warns on mixed value-mode and count-mode bidding", async () => {
    routeQuery({
      campaigns: [
        {
          campaign: {
            id: "1",
            name: "Value campaign",
            status: 2,
            advertising_channel_type: 2,
            bidding_strategy_type: 11, // MAXIMIZE_CONVERSION_VALUE
            network_settings: {
              target_google_search: true,
              target_search_network: false,
              target_content_network: false,
            },
          },
          campaign_budget: { amount_micros: 10_000_000 },
        },
        {
          campaign: {
            id: "2",
            name: "Count campaign",
            status: 2,
            advertising_channel_type: 2,
            bidding_strategy_type: 10, // MAXIMIZE_CONVERSIONS
            network_settings: {
              target_google_search: true,
              target_search_network: false,
              target_content_network: false,
            },
          },
          campaign_budget: { amount_micros: 10_000_000 },
        },
      ],
    });
    const summary = await getAccountSummary(auth);
    expect(summary.notes.some((n) => /Mixed optimization mode/i.test(n))).toBe(true);
  });

  it("returns empty arrays when the account has no campaigns or conversion actions", async () => {
    routeQuery({
      customer: [
        {
          customer: {
            id: "1234567890",
            descriptive_name: "Empty",
            currency_code: "USD",
            time_zone: "UTC",
            auto_tagging_enabled: false,
            tracking_url_template: "",
          },
        },
      ],
    });
    const summary = await getAccountSummary(auth);
    expect(summary.campaigns).toEqual([]);
    expect(summary.conversionActions).toEqual([]);
    expect(summary.notes).toEqual([]);
    expect(summary.account.hasTrackingTemplate).toBe(false);
  });
});
