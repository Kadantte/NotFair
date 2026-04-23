/**
 * Integration test: real `lib/google-ads` entry points with demo auth.
 * Proves the one-line demo gates short-circuit before hitting the Google
 * Ads client (which would fail since we have no refresh token or env vars).
 */
import { describe, expect, it } from "vitest";
import {
  getAccountInfo,
  getConversionActions,
  getImpressionShare,
  getKeywords,
  getRecommendations,
  getSearchTermReport,
  listAdGroups,
  listAds,
  listCampaigns,
  pauseCampaign,
  enableCampaign,
  updateCampaignBudget,
  addNegativeKeyword,
} from "@/lib/google-ads";
import { DEMO_CUSTOMER_ID } from "@/lib/demo/constants";

const demoAuth = { refreshToken: "unused-in-demo", customerId: DEMO_CUSTOMER_ID };

describe("demo integration — reads via lib/google-ads", () => {
  it("listCampaigns returns 5 demo campaigns", async () => {
    const rows = await listCampaigns(demoAuth, { limit: 10, days: 30 });
    expect(rows.length).toBe(5);
    expect(rows[0].cost).toBeGreaterThan(0);
  });

  it("getAccountInfo returns demo account metadata", async () => {
    const info = await getAccountInfo(demoAuth);
    expect(info.id).toBe(DEMO_CUSTOMER_ID);
    expect(info.isTestAccount).toBe(true);
  });

  it("getKeywords returns demo keywords for search campaigns", async () => {
    const result = await getKeywords(demoAuth, "900000000001", 30, 50);
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  it("getSearchTermReport returns a cost-sorted list", async () => {
    const result = await getSearchTermReport(demoAuth, "900000000002", 30, 20);
    expect(result.searchTerms.length).toBeGreaterThan(0);
    // Confirm at least one 0-conv term surfaces for the wasted-spend campaign.
    expect(result.searchTerms.some((t) => t.conversions === 0)).toBe(true);
  });

  it("getImpressionShare returns IS only for search campaigns", async () => {
    const pmax = await getImpressionShare(demoAuth, "900000000005", 30);
    expect(pmax.impressionShare).toBeNull();
    const search = await getImpressionShare(demoAuth, "900000000001", 30);
    expect(search.impressionShare).toBeGreaterThan(0);
  });

  it("getRecommendations returns demo suggestions", async () => {
    const recs = await getRecommendations(demoAuth);
    expect(recs.recommendations.length).toBeGreaterThan(0);
  });

  it("getConversionActions returns purchase + add-to-cart + signup", async () => {
    const rows = await getConversionActions(demoAuth);
    expect(rows.length).toBe(3);
    expect(rows.some((r) => r.category === "PURCHASE")).toBe(true);
  });

  it("listAdGroups returns ad groups for search campaigns", async () => {
    const rows = await listAdGroups(demoAuth, "900000000001", 10);
    expect(rows.length).toBe(2);
  });

  it("listAds returns RSA variants for search ad groups", async () => {
    const result = await listAds(demoAuth, "900000000001", undefined, 30, 20);
    expect(result.ads.length).toBeGreaterThan(0);
    expect(result.ads[0].headlines.length).toBeGreaterThanOrEqual(3);
  });
});

describe("demo integration — writes short-circuit to success", () => {
  it("pauseCampaign + enableCampaign are no-op successes", async () => {
    const p = await pauseCampaign(demoAuth, "900000000001");
    expect(p.success).toBe(true);
    expect(p.afterValue).toBe("PAUSED");
    const e = await enableCampaign(demoAuth, "900000000001");
    expect(e.success).toBe(true);
  });

  it("updateCampaignBudget + addNegativeKeyword return success without a real customer", async () => {
    const b = await updateCampaignBudget(demoAuth, "900000000001", 200_000_000);
    expect(b.success).toBe(true);
    const n = await addNegativeKeyword(demoAuth, "900000000002", "walmart cheap");
    expect(n.success).toBe(true);
  });
});
