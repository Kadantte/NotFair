/**
 * Audit-path integration: calls the same lib/google-ads functions the
 * /audit page server actions use, with demo auth. Confirms they all
 * short-circuit correctly before hitting the Google Ads client.
 */
import { describe, expect, it } from "vitest";
import {
  getAccountInfo,
  getAccountSettings,
  getConversionActions,
  getImpressionShare,
  getKeywords,
  getNegativeKeywords,
  getSearchTermReport,
  listAdGroups,
  listAds,
  listCampaigns,
} from "@/lib/google-ads";
import { DEMO_CUSTOMER_ID } from "@/lib/demo/constants";

const auth = { refreshToken: "unused", customerId: DEMO_CUSTOMER_ID };

describe("demo audit integration — matches /audit page fan-out", () => {
  it("overview fetch (account info + settings + campaigns + conversions) resolves", async () => {
    const [info, settings, campaigns, conversions] = await Promise.all([
      getAccountInfo(auth),
      getAccountSettings(auth),
      listCampaigns(auth, { limit: 50, days: 30 }),
      getConversionActions(auth),
    ]);
    expect(info.name).toContain("Threadline");
    expect(settings.autoTaggingEnabled).toBe(true);
    expect(campaigns.length).toBe(5);
    expect(conversions.some((c) => c.primaryForGoal)).toBe(true);
  });

  it("per-campaign fan-out (keywords/terms/IS/ads/negatives/adgroups) all resolve", async () => {
    const ids = ["900000000001", "900000000002", "900000000003", "900000000004", "900000000005"];
    const [kws, terms, iss, ads, negs, groups] = await Promise.all([
      Promise.all(ids.map((id) => getKeywords(auth, id, 30, 100))),
      Promise.all(ids.map((id) => getSearchTermReport(auth, id, 30, 100))),
      Promise.all(ids.map((id) => getImpressionShare(auth, id, 30))),
      Promise.all(ids.map((id) => listAds(auth, id, undefined, 30, 50))),
      Promise.all(ids.map((id) => getNegativeKeywords(auth, id, 500))),
      Promise.all(ids.map((id) => listAdGroups(auth, id, 100))),
    ]);
    // Search campaigns should return keywords; Shopping + PMax should return 0.
    expect(kws[0].keywords.length).toBeGreaterThan(0); // Brand
    expect(kws[3].keywords.length).toBe(0); // Shopping
    expect(terms.every((t) => Array.isArray(t.searchTerms))).toBe(true);
    expect(iss.every((i) => typeof i === "object")).toBe(true);
    expect(ads.every((a) => Array.isArray(a.ads))).toBe(true);
    expect(negs.every((n) => Array.isArray(n))).toBe(true);
    expect(groups.every((g) => Array.isArray(g))).toBe(true);
    // Every search campaign has ≥1 ad group.
    expect(groups[0].length).toBeGreaterThan(0);
  });
});
