/**
 * Assembles an AuditResult for the demo customer so `runAudit` via MCP
 * returns a fully-populated response instead of the empty safety-net result.
 * This is the flagship tool reviewers are most likely to try — a hollow
 * audit reads like a broken integration.
 */
import { getDateRange } from "@/lib/google-ads";
import type {
  AuditResult,
  WastedItem,
  SearchTermItem,
  LandingPage,
  RecentChange,
} from "@/lib/google-ads/audit";
import {
  DEMO_BUSINESS,
  DEMO_CAMPAIGNS,
  DEMO_HISTORY_DAYS,
  demoAdGroups,
  demoAds,
  demoImpressionShare,
  demoNegativeKeywords,
  generateDemoDailyMetrics,
  generateDemoKeywords,
  generateDemoSearchTerms,
} from "./fixtures";
import { DEMO_CUSTOMER_NAME } from "./constants";

// ─── Top-level assembler ────────────────────────────────────────────

export function demoRunAudit(days: number = DEMO_HISTORY_DAYS): AuditResult {
  const boundedDays = Math.min(Math.max(days, 1), DEMO_HISTORY_DAYS);
  const { start, end } = getDateRange(boundedDays);

  // Roll-up totals across campaigns. We reuse `generateDemoDailyMetrics` so the
  // numbers match whatever `listCampaigns` and `getCampaignPerformance` returned
  // moments ago — agents shouldn't see inconsistent headline numbers.
  const perCampaign = DEMO_CAMPAIGNS.map((c) => {
    const dailies = generateDemoDailyMetrics(c, boundedDays);
    const keywords = generateDemoKeywords(c, boundedDays, 100);
    const terms = generateDemoSearchTerms(c, boundedDays, 100);
    const is = demoImpressionShare(c, boundedDays);
    const adGroups = demoAdGroups(c.id);
    const ads = demoAds(c.id);
    const impressions = dailies.reduce((s, d) => s + d.impressions, 0);
    const clicks = dailies.reduce((s, d) => s + d.clicks, 0);
    const spend = dailies.reduce((s, d) => s + d.cost, 0);
    const conversions = dailies.reduce((s, d) => s + d.conversions, 0);
    const conversionValue = dailies.reduce((s, d) => s + d.conversionValue, 0);
    return { c, keywords, terms, is, adGroups, ads, impressions, clicks, spend, conversions, conversionValue };
  });

  // Summary totals.
  const totalSpend = perCampaign.reduce((s, p) => s + p.spend, 0);
  const totalConversions = perCampaign.reduce((s, p) => s + p.conversions, 0);
  const totalClicks = perCampaign.reduce((s, p) => s + p.clicks, 0);
  const totalImpressions = perCampaign.reduce((s, p) => s + p.impressions, 0);
  const totalConversionValue = perCampaign.reduce((s, p) => s + p.conversionValue, 0);

  // Wasted-spend surfaces: zero-conversion search terms across the account.
  const wastedSearchTermsAll: SearchTermItem[] = perCampaign
    .flatMap((p) =>
      p.terms
        .filter((t) => t.conversions === 0 && t.cost >= 5)
        .map((t) => ({
          term: t.searchTerm,
          campaignName: p.c.name,
          adGroupName: t.adGroupName,
          spend: round2(t.cost),
          clicks: t.clicks,
          conversions: t.conversions,
          recentChange: null as RecentChange | null,
        })),
    )
    .sort((a, b) => b.spend - a.spend);

  const wastedSpendTotal = wastedSearchTermsAll.reduce((s, i) => s + i.spend, 0);

  // Wasted keywords: keywords with 0 conversions and meaningful spend.
  const wastedKeywordsAll: WastedItem[] = perCampaign
    .flatMap((p) =>
      p.keywords
        .filter((k) => k.conversions === 0 && k.cost >= 10)
        .map((k) => ({
          text: k.text,
          matchType: k.matchType,
          campaignName: p.c.name,
          adGroupName: k.adGroupName,
          spend: round2(k.cost),
          clicks: k.clicks,
          qualityScore: k.qualityScore,
          recentChange: null as RecentChange | null,
        })),
    )
    .sort((a, b) => b.spend - a.spend);

  // Brand-leakage: zero-conv search terms that contain the brand name.
  const brandVariants = ["threadline", "threadlineapparel", "thread line"];
  const brandLeakageItems: SearchTermItem[] = perCampaign
    .flatMap((p) =>
      p.terms
        .filter((t) => {
          const q = t.searchTerm.toLowerCase();
          const nonBrandCampaign = !p.c.name.toLowerCase().includes("brand");
          return nonBrandCampaign && brandVariants.some((v) => q.includes(v));
        })
        .map((t) => ({
          term: t.searchTerm,
          campaignName: p.c.name,
          adGroupName: t.adGroupName,
          spend: round2(t.cost),
          clicks: t.clicks,
          conversions: t.conversions,
          recentChange: null as RecentChange | null,
        })),
    )
    .sort((a, b) => b.spend - a.spend);

  // Mining opportunities: converting search terms not yet a keyword. For the
  // demo we pick converting terms with good cost/conv ratio.
  const miningOpps: SearchTermItem[] = perCampaign
    .flatMap((p) =>
      p.terms
        .filter((t) => t.conversions >= 1 && t.cost / Math.max(t.conversions, 1) < 50)
        .slice(0, 3)
        .map((t) => ({
          term: t.searchTerm,
          campaignName: p.c.name,
          adGroupName: t.adGroupName,
          spend: round2(t.cost),
          clicks: t.clicks,
          conversions: t.conversions,
          recentChange: null as RecentChange | null,
        })),
    )
    .slice(0, 10);

  // Budget-constrained winners: campaigns with high budget-lost IS and solid CPA.
  const budgetConstrainedAll = perCampaign
    .filter((p) => (p.is.budgetLostImpressionShare ?? 0) > 0.15)
    .map((p) => ({
      campaignName: p.c.name,
      budgetLostIS: round2(p.is.budgetLostImpressionShare ?? 0),
      cpa: p.conversions > 0 ? round2(p.spend / p.conversions) : 0,
      dailyBudget: p.c.dailyBudget,
      spend: round2(p.spend),
      recentChange: null as RecentChange | null,
    }))
    .sort((a, b) => b.budgetLostIS - a.budgetLostIS);

  // Landing pages: one row per unique final URL across ads.
  const landingPageMap = new Map<string, LandingPage>();
  for (const p of perCampaign) {
    for (const ad of p.ads) {
      for (const url of ad.finalUrls) {
        const existing = landingPageMap.get(url) ?? {
          url,
          spend: 0,
          clicks: 0,
          conversions: 0,
          cpa: null,
          conversionRate: 0,
        };
        // Split campaign totals across URLs proportionally via ad.costShare
        const adShare = ad.costShare * (p.adGroups.find((g) => g.id === ad.adGroupId)?.costShare ?? 1);
        existing.spend += p.spend * adShare;
        existing.clicks += p.clicks * adShare;
        existing.conversions += p.conversions * adShare;
        landingPageMap.set(url, existing);
      }
    }
  }
  const landingPages: LandingPage[] = [...landingPageMap.values()].map((lp) => ({
    url: lp.url,
    spend: round2(lp.spend),
    clicks: Math.round(lp.clicks),
    conversions: round2(lp.conversions),
    cpa: lp.conversions > 0 ? round2(lp.spend / lp.conversions) : null,
    conversionRate: lp.clicks > 0 ? lp.conversions / lp.clicks : 0,
  }));

  // Match-type distribution.
  type MtAgg = { matchType: string; spend: number; clicks: number; conversions: number; keywordCount: number };
  const mtMap = new Map<string, MtAgg>();
  for (const p of perCampaign) {
    for (const k of p.keywords) {
      const existing = mtMap.get(k.matchType) ?? {
        matchType: k.matchType,
        spend: 0,
        clicks: 0,
        conversions: 0,
        keywordCount: 0,
      };
      existing.spend += k.cost;
      existing.clicks += k.clicks;
      existing.conversions += k.conversions;
      existing.keywordCount += 1;
      mtMap.set(k.matchType, existing);
    }
  }
  const matchTypeDistribution = [...mtMap.values()].map((m) => ({
    matchType: m.matchType,
    spend: round2(m.spend),
    clicks: m.clicks,
    conversions: round2(m.conversions),
    keywordCount: m.keywordCount,
  }));

  return {
    account: {
      name: DEMO_CUSTOMER_NAME,
      currency: DEMO_BUSINESS.currency,
      timezone: DEMO_BUSINESS.timeZone,
      autoTagging: true,
      trackingTemplate: null,
    },
    dateRange: { start, end, days: boundedDays },
    summary: {
      totalSpend: round2(totalSpend),
      totalConversions: round1(totalConversions),
      totalConversionValue: round2(totalConversionValue),
      totalClicks: totalClicks,
      totalImpressions: totalImpressions,
      cpa: totalConversions > 0 ? round2(totalSpend / totalConversions) : null,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      conversionRate: totalClicks > 0 ? totalConversions / totalClicks : 0,
      roas: totalSpend > 0 ? round2(totalConversionValue / totalSpend) : null,
      activeCampaigns: DEMO_CAMPAIGNS.filter((c) => c.status === "ENABLED").length,
    },
    pulse: {
      wasteRate: totalSpend > 0 ? wastedSpendTotal / totalSpend : 0,
      wasteUsd: round2(wastedSpendTotal),
      demandCaptured: demandCaptured(perCampaign),
      cpa: totalConversions > 0 ? round2(totalSpend / totalConversions) : null,
    },
    campaigns: perCampaign.map((p) => buildCampaign(p)),
    findings: {
      wastedKeywords: toFindingList(wastedKeywordsAll, 10, (i) => i.spend),
      wastedSearchTerms: toFindingList(wastedSearchTermsAll, 10, (i) => i.spend),
      brandLeakage: {
        detected: brandLeakageItems.length > 0,
        businessName: DEMO_BUSINESS.name,
        variants: brandVariants,
        totalSpend: round2(brandLeakageItems.reduce((s, i) => s + i.spend, 0)),
        terms: toFindingList(brandLeakageItems, 10, (i) => i.spend),
      },
      miningOpportunities: toFindingList(miningOpps, 10, (i) => i.spend),
      budgetConstrainedWinners: toFindingList(budgetConstrainedAll, 5, (i) => i.spend),
      negativeConflicts: { shown: 0, total: 0, totalSpend: 0, items: [] },
      hasAudienceSegments: false,
      conversionActions: [
        { name: "Purchase (Threadline)", type: 2, countingType: 2, includeInConversions: true, primaryForGoal: true, defaultValue: null },
        { name: "Add to Cart", type: 2, countingType: 2, includeInConversions: false, primaryForGoal: false, defaultValue: null },
        { name: "Newsletter Signup", type: 2, countingType: 2, includeInConversions: false, primaryForGoal: false, defaultValue: 1 },
      ],
      matchTypeDistribution,
      assetCoverage: DEMO_CAMPAIGNS.filter((c) => c.channelType !== "PERFORMANCE_MAX").map((c) => ({
        campaignName: c.name,
        sitelinks: 4,
        callouts: 6,
        structuredSnippets: 2,
        images: c.channelType === "SHOPPING" ? 0 : 0,
        total: 12,
      })),
      landingPages: toFindingList(landingPages, 15, (i) => i.spend),
    },
    recentChanges: { shown: 0, total: 0, totalSpend: 0, items: [] },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

type PerCampaign = {
  c: (typeof DEMO_CAMPAIGNS)[number];
  keywords: ReturnType<typeof generateDemoKeywords>;
  terms: ReturnType<typeof generateDemoSearchTerms>;
  is: ReturnType<typeof demoImpressionShare>;
  adGroups: ReturnType<typeof demoAdGroups>;
  ads: ReturnType<typeof demoAds>;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
};

function demandCaptured(perCampaign: PerCampaign[]): number {
  // Weighted average impression share across campaigns that report one.
  let num = 0;
  let denom = 0;
  for (const p of perCampaign) {
    const is = p.c.searchImpressionShare;
    if (is == null) continue;
    num += is * p.impressions;
    denom += p.impressions;
  }
  return denom > 0 ? num / denom : 0;
}

function buildCampaign(p: PerCampaign) {
  const budgetLost = p.is.budgetLostImpressionShare;
  const rankLost = p.is.rankLostImpressionShare;
  const bl = budgetLost ?? 0;
  const rl = rankLost ?? 0;
  let isMatrix: "healthy" | "relevance_problem" | "capital_problem" | "structural_problem";
  if (bl < 0.15 && rl < 0.20) isMatrix = "healthy";
  else if (bl < 0.15 && rl >= 0.20) isMatrix = "relevance_problem";
  else if (bl >= 0.15 && rl < 0.20) isMatrix = "capital_problem";
  else isMatrix = "structural_problem";

  const cpa = p.conversions > 0 ? p.spend / p.conversions : null;
  const ctr = p.impressions > 0 ? p.clicks / p.impressions : 0;
  const conversionRate = p.clicks > 0 ? p.conversions / p.clicks : 0;
  const roas = p.spend > 0 ? p.conversionValue / p.spend : null;

  const channelTypeCode = p.c.channelType === "SEARCH" ? 2 : p.c.channelType === "SHOPPING" ? 6 : 11;

  // Quality-score weighted average for the campaign.
  const weightedQS = weightedQuality(p.keywords);

  // Share of spend driven by low-QS (≤4) keywords.
  const lowQsSpend = p.keywords.filter((k) => (k.qualityScore ?? 10) <= 4).reduce((s, k) => s + k.cost, 0);
  const lowQSSpendPct = p.spend > 0 ? lowQsSpend / p.spend : 0;

  // Top 5 keywords, adgroups, ads for preview.
  const topKeywords = [...p.keywords]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map((k) => ({
      text: k.text,
      matchType: k.matchType,
      qualityScore: k.qualityScore,
      spend: round2(k.cost),
      conversions: round1(k.conversions),
      clicks: k.clicks,
      cpa: k.conversions > 0 ? round2(k.cost / k.conversions) : null,
    }));

  const adGroupRows = p.adGroups.map((g) => ({
    id: g.id,
    name: g.name,
    spend: round2(p.spend * g.costShare),
    conversions: round1(p.conversions * g.costShare),
  }));

  const topAds = p.ads.slice(0, 5).map((ad) => ({
    adGroupName: ad.adGroupName,
    headlineCount: ad.headlines.length,
    descriptionCount: ad.descriptions.length,
    adStrength:
      ad.adStrength === "EXCELLENT" ? 5 : ad.adStrength === "GOOD" ? 4 : ad.adStrength === "AVERAGE" ? 3 : 2,
    finalUrl: ad.finalUrls[0] ?? null,
    spend: round2(p.spend * ad.costShare),
    conversions: round1(p.conversions * ad.costShare),
  }));

  // Simple plausible device split (mobile 55% / desktop 35% / tablet 10%).
  const deviceSplit = {
    MOBILE: 0.55,
    DESKTOP: 0.35,
    TABLET: 0.1,
  } as const;
  const deviceBreakdown: Record<string, {
    spend: number;
    clicks: number;
    impressions: number;
    conversions: number;
    cpa: number | null;
    ctr: number;
    conversionRate: number;
  }> = {};
  for (const [device, share] of Object.entries(deviceSplit)) {
    const s = p.spend * share;
    const c = p.clicks * share;
    const i = p.impressions * share;
    const conv = p.conversions * share;
    deviceBreakdown[device] = {
      spend: round2(s),
      clicks: Math.round(c),
      impressions: Math.round(i),
      conversions: round1(conv),
      cpa: conv > 0 ? round2(s / conv) : null,
      ctr: i > 0 ? c / i : 0,
      conversionRate: c > 0 ? conv / c : 0,
    };
  }

  const biddingStrategyCode = bidStrategyToCode(p.c.biddingStrategy);

  return {
    id: p.c.id,
    name: p.c.name,
    type: p.c.channelType,
    status: 2, // ENABLED
    spend: round2(p.spend),
    conversions: round1(p.conversions),
    conversionValue: round2(p.conversionValue),
    allConversions: round1(p.conversions),
    clicks: p.clicks,
    impressions: p.impressions,
    cpa,
    ctr,
    conversionRate,
    roas,
    dailyBudget: p.c.dailyBudget,
    impressionShare: p.c.searchImpressionShare,
    budgetLostIS: p.c.budgetLostIS,
    rankLostIS: p.c.rankLostIS,
    isMatrix,
    biddingStrategy: biddingStrategyCode,
    targetCpa: p.c.biddingStrategy === "TARGET_CPA" ? 40_000_000 : null,
    searchPartners: false,
    displayNetwork: false,
    geoTargetType: 4,
    weightedQS,
    lowQSSpendPct,
    negativeKeywordCount: demoNegativeKeywords(p.c.id).length,
    adGroups: adGroupRows,
    topAds,
    topKeywords,
    deviceBreakdown,
    searchPartnersMetrics: null,
    recentChange: null,
    metricsSplit: null,
    // The real interface enumerates the above fields — TypeScript will check
    // shape at call site. We intentionally omit channel/campaign fields not
    // emitted for non-search types.
    _type: channelTypeCode,
  } as unknown as AuditResult["campaigns"][number];
}

function weightedQuality(keywords: Array<{ qualityScore: number | null; impressions: number }>) {
  let numerator = 0;
  let denominator = 0;
  for (const k of keywords) {
    if (k.qualityScore == null) continue;
    numerator += k.qualityScore * k.impressions;
    denominator += k.impressions;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function bidStrategyToCode(strategy: string): number {
  switch (strategy) {
    case "MAXIMIZE_CONVERSIONS":
      return 10;
    case "MAXIMIZE_CONVERSION_VALUE":
      return 13;
    case "TARGET_CPA":
      return 6;
    case "TARGET_ROAS":
      return 11;
    case "MANUAL_CPC":
      return 2;
    default:
      return 0;
  }
}

function toFindingList<T>(all: T[], limit: number, getSpend: (item: T) => number) {
  let totalSpend = 0;
  for (const item of all) totalSpend += getSpend(item) || 0;
  const items = limit >= all.length ? all : all.slice(0, limit);
  return { shown: items.length, total: all.length, totalSpend: round2(totalSpend), items };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
