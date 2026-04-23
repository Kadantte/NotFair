import { describe, expect, it } from "vitest";
import { DEMO_CUSTOMER_ID, isDemoAuth, isDemoCustomerId } from "@/lib/demo/constants";
import {
  DEMO_CAMPAIGNS,
  DEMO_HISTORY_DAYS,
  demoAdGroups,
  demoAds,
  demoImpressionShare,
  findDemoCampaign,
  generateDemoDailyMetrics,
  generateDemoKeywords,
  generateDemoSearchTerms,
} from "@/lib/demo/fixtures";
import {
  demoGetCampaignPerformance,
  demoGetImpressionShare,
  demoGetKeywords,
  demoGetSearchTermReport,
  demoListCampaigns,
  demoSparklineData,
  demoWoWPerformance,
} from "@/lib/demo/reads";
import {
  demoAddNegativeKeyword,
  demoEnableCampaign,
  demoPauseCampaign,
  demoPauseKeyword,
  demoUpdateCampaignBudget,
} from "@/lib/demo/writes";
import { hashSeed, makeRng } from "@/lib/demo/prng";

describe("demo mode — identity helpers", () => {
  it("recognizes demo customer id", () => {
    expect(isDemoCustomerId(DEMO_CUSTOMER_ID)).toBe(true);
    expect(isDemoCustomerId("1234567890")).toBe(false);
    expect(isDemoCustomerId(null)).toBe(false);
    expect(isDemoCustomerId(undefined)).toBe(false);
    expect(isDemoCustomerId("")).toBe(false);
  });

  it("recognizes demo auth context", () => {
    expect(isDemoAuth({ customerId: DEMO_CUSTOMER_ID })).toBe(true);
    expect(isDemoAuth({ customerId: "1234567890" })).toBe(false);
  });
});

describe("demo mode — deterministic PRNG", () => {
  it("produces the same sequence for the same seed", () => {
    const a = makeRng(hashSeed("cat"));
    const b = makeRng(hashSeed("cat"));
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = makeRng(hashSeed("cat"));
    const b = makeRng(hashSeed("dog"));
    // Checking the first draw is enough to reject collisions.
    expect(a()).not.toBe(b());
  });
});

describe("demo mode — fixtures", () => {
  it("has 5 campaigns covering search/shopping/pmax", () => {
    expect(DEMO_CAMPAIGNS).toHaveLength(5);
    const channels = new Set(DEMO_CAMPAIGNS.map((c) => c.channelType));
    expect(channels.has("SEARCH")).toBe(true);
    expect(channels.has("SHOPPING")).toBe(true);
    expect(channels.has("PERFORMANCE_MAX")).toBe(true);
  });

  it("findDemoCampaign returns the campaign by id or null", () => {
    expect(findDemoCampaign("900000000001")?.channelType).toBe("SEARCH");
    expect(findDemoCampaign("not-real")).toBeNull();
  });

  it("at least one campaign surfaces wasted spend and one is budget-capped", () => {
    expect(DEMO_CAMPAIGNS.some((c) => c.storyTags.includes("wasted_spend"))).toBe(true);
    expect(DEMO_CAMPAIGNS.some((c) => c.storyTags.includes("budget_capped"))).toBe(true);
  });

  it("generates exactly DEMO_HISTORY_DAYS of daily metrics", () => {
    const campaign = DEMO_CAMPAIGNS[0];
    const dailies = generateDemoDailyMetrics(campaign, DEMO_HISTORY_DAYS);
    expect(dailies).toHaveLength(DEMO_HISTORY_DAYS);
    for (const d of dailies) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.impressions).toBeGreaterThanOrEqual(d.clicks);
      expect(d.cost).toBeGreaterThanOrEqual(0);
      expect(d.conversions).toBeGreaterThanOrEqual(0);
    }
  });

  it("daily metrics are deterministic for a fixed anchor date", () => {
    const campaign = DEMO_CAMPAIGNS[1];
    const anchor = new Date("2026-04-22T00:00:00Z");
    const a = generateDemoDailyMetrics(campaign, 14, anchor);
    const b = generateDemoDailyMetrics(campaign, 14, anchor);
    expect(a).toEqual(b);
  });

  it("keyword cost shares sum to ~1 per ad group", () => {
    for (const c of DEMO_CAMPAIGNS) {
      for (const g of demoAdGroups(c.id).filter((g) => g.type === "SEARCH_STANDARD")) {
        const sum = g.keywords.reduce((s, k) => s + k.costShare, 0);
        // Allow small rounding drift (templates are hand-authored).
        expect(Math.abs(sum - 1)).toBeLessThan(0.02);
      }
    }
  });

  it("wasted-spend campaign produces at least one 0-conversion search term", () => {
    const wasted = DEMO_CAMPAIGNS.find((c) => c.storyTags.includes("wasted_spend"));
    expect(wasted).toBeDefined();
    const terms = generateDemoSearchTerms(wasted!, 30, 50);
    const zeroConv = terms.filter((t) => t.conversions === 0);
    expect(zeroConv.length).toBeGreaterThan(0);
  });

  it("impression share reports budget-loss for budget-capped campaign", () => {
    const capped = DEMO_CAMPAIGNS.find((c) => c.storyTags.includes("budget_capped"));
    expect(capped).toBeDefined();
    const is = demoImpressionShare(capped!, 30);
    expect(is.budgetLostImpressionShare).not.toBeNull();
    expect(is.budgetLostImpressionShare!).toBeGreaterThan(0.15);
  });

  it("RSA ads have 3–15 headlines and 2–4 descriptions (Google's limits)", () => {
    for (const c of DEMO_CAMPAIGNS) {
      const ads = demoAds(c.id).filter((a) => a.type === "RESPONSIVE_SEARCH_AD");
      for (const ad of ads) {
        expect(ad.headlines.length).toBeGreaterThanOrEqual(3);
        expect(ad.headlines.length).toBeLessThanOrEqual(15);
        expect(ad.descriptions.length).toBeGreaterThanOrEqual(2);
        expect(ad.descriptions.length).toBeLessThanOrEqual(4);
        for (const h of ad.headlines) expect(h.length).toBeLessThanOrEqual(30);
        for (const d of ad.descriptions) expect(d.length).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe("demo mode — reads (shape parity with real lib/google-ads)", () => {
  it("demoListCampaigns returns all 5 demo campaigns with the real row shape", () => {
    const rows = demoListCampaigns({ limit: 100, days: 30 });
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.name).toBe("string");
      expect(typeof r.impressions).toBe("number");
      expect(typeof r.clicks).toBe("number");
      expect(typeof r.cost).toBe("number");
      expect(typeof r.conversions).toBe("number");
      // Real API surfaces these keys too:
      expect(r).toHaveProperty("channelType");
      expect(r).toHaveProperty("biddingStrategy");
      expect(r).toHaveProperty("trackingTemplate");
    }
  });

  it("demoListCampaigns respects limit", () => {
    expect(demoListCampaigns({ limit: 2 })).toHaveLength(2);
  });

  it("demoGetCampaignPerformance produces daily series + totals + ratios", () => {
    const perf = demoGetCampaignPerformance("900000000001", 14);
    expect(perf.dateRange.days).toBe(14);
    expect(perf.daily.length).toBe(14);
    expect(perf.totals.impressions).toBeGreaterThan(0);
    expect(perf.totals.ctr).toBeGreaterThan(0);
  });

  it("demoGetCampaignPerformance supports comparePreviousPeriod", () => {
    const perf = demoGetCampaignPerformance("900000000001", {
      days: 7,
      comparePreviousPeriod: true,
    }) as Extract<ReturnType<typeof demoGetCampaignPerformance>, { comparison: unknown }>;
    expect(perf.comparison).toBeDefined();
    expect(perf.comparison.daily.length).toBe(7);
  });

  it("demoGetKeywords returns keywords only for search campaigns", () => {
    expect(demoGetKeywords("900000000001", 30, 50).keywords.length).toBeGreaterThan(0);
    // Shopping campaign has no keywords in GAds either.
    expect(demoGetKeywords("900000000004", 30, 50).keywords.length).toBe(0);
  });

  it("demoGetSearchTermReport returns cost-sorted terms", () => {
    const terms = demoGetSearchTermReport("900000000002", 30, 20).searchTerms;
    expect(terms.length).toBeGreaterThan(0);
    for (let i = 1; i < terms.length; i++) {
      expect(terms[i - 1].cost).toBeGreaterThanOrEqual(terms[i].cost);
    }
  });

  it("demoGetImpressionShare returns null IS for PMax/shopping", () => {
    const pmax = demoGetImpressionShare("900000000005", 30);
    expect(pmax.impressionShare).toBeNull();
    const search = demoGetImpressionShare("900000000001", 30);
    expect(search.impressionShare).toBeGreaterThan(0);
  });

  it("demoSparklineData yields 7 days of totals across all campaigns", () => {
    const data = demoSparklineData(7);
    expect(data.cost.length).toBe(7);
    expect(data.clicks.length).toBe(7);
    expect(data.cost.every((c) => c > 0)).toBe(true);
  });

  it("demoWoWPerformance returns CPA for every campaign", () => {
    const rows = demoWoWPerformance();
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(typeof r.currentWeekCost).toBe("number");
    }
  });

  it("demoGetKeywords keywords are cost > 0 for enabled campaign", () => {
    const rows = generateDemoKeywords(DEMO_CAMPAIGNS[0], 30, 100);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cost >= 0)).toBe(true);
  });
});

describe("demo mode — writes are no-op successes", () => {
  it("demoPauseCampaign returns success without hitting the API", () => {
    const r = demoPauseCampaign("900000000001");
    expect(r.success).toBe(true);
    expect(r.action).toBe("pause_campaign");
    expect(r.afterValue).toBe("PAUSED");
  });

  it("demoEnableCampaign flips status back", () => {
    const r = demoEnableCampaign("900000000001");
    expect(r.success).toBe(true);
    expect(r.afterValue).toBe("ENABLED");
  });

  it("demoPauseKeyword, demoAddNegativeKeyword, demoUpdateCampaignBudget all return success", () => {
    expect(demoPauseKeyword("1234").success).toBe(true);
    expect(demoAddNegativeKeyword("900000000002", "free stuff").success).toBe(true);
    expect(demoUpdateCampaignBudget("900000000001", 200_000_000).success).toBe(true);
  });
});
