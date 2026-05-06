/**
 * Demo implementations of the google-ads read functions. Each returns data
 * in exactly the shape the real function does, so callers don't need to
 * branch beyond the one-line guard at the top of the real function.
 */
import { formatDate, getDateRange } from "@/lib/google-ads";
import {
  DEMO_BUSINESS,
  DEMO_CAMPAIGNS,
  DEMO_HISTORY_DAYS,
  demoAdGroups,
  demoAds,
  demoImpressionShare,
  demoNegativeKeywords,
  demoRecommendations,
  findDemoCampaign,
  generateDemoDailyMetrics,
  generateDemoKeywords,
  generateDemoSearchTerms,
  type DemoCampaign,
} from "./fixtures";
import { DEMO_CUSTOMER_ID, DEMO_CUSTOMER_NAME } from "./constants";

// ─── Campaign totals helper ─────────────────────────────────────────

function totalsForCampaign(campaign: DemoCampaign, days: number) {
  const bounded = Math.min(Math.max(days, 1), DEMO_HISTORY_DAYS);
  const dailies = generateDemoDailyMetrics(campaign, bounded);
  return dailies.reduce(
    (acc, d) => ({
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
      cost: acc.cost + d.cost,
      conversions: acc.conversions + d.conversions,
      conversionValue: acc.conversionValue + d.conversionValue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
  );
}

// ─── Top-level reads ─────────────────────────────────────────────────

export function demoGetAccountInfo() {
  return {
    id: DEMO_CUSTOMER_ID,
    name: DEMO_CUSTOMER_NAME,
    currencyCode: DEMO_BUSINESS.currency,
    timeZone: DEMO_BUSINESS.timeZone,
    isTestAccount: true,
    isManager: false,
  };
}

export function demoListCampaigns(options: { limit?: number; includeRemoved?: boolean; days?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const days = options.days ?? 30;
  const rows = DEMO_CAMPAIGNS.map((c) => {
    const t = totalsForCampaign(c, days);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      channelType: c.channelType,
      biddingStrategy: c.biddingStrategy,
      networkDisplayEnabled: c.networkDisplayEnabled,
      trackingTemplate: c.trackingTemplate,
      currencyCode: 'USD' as string | null,
      impressions: t.impressions,
      clicks: t.clicks,
      cost: t.cost,
      conversions: t.conversions,
      allConversions: t.conversions,
    };
  }).sort((a, b) => b.impressions - a.impressions);
  return rows.slice(0, limit);
}

// ─── Campaign performance with per-day breakdown ────────────────────

export type DemoCampaignPerformanceOptions = {
  days?: number;
  startDate?: string;
  endDate?: string;
  comparePreviousPeriod?: boolean;
};

function ratios(t: {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  allConversions: number;
  conversionValue: number;
}) {
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    averageCpc: t.clicks > 0 ? t.cost / t.clicks : 0,
    cpa: t.conversions > 0 ? t.cost / t.conversions : null,
    roas: t.cost > 0 ? t.conversionValue / t.cost : null,
  };
}

function sumRows(rows: ReturnType<typeof dailyRows>["rows"]) {
  return rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      cost: acc.cost + r.cost,
      conversions: acc.conversions + r.conversions,
      allConversions: acc.allConversions + r.allConversions,
      conversionValue: acc.conversionValue + r.conversionValue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, allConversions: 0, conversionValue: 0 },
  );
}

function dailyRows(campaign: DemoCampaign, startDate: string, endDate: string) {
  const dailies = generateDemoDailyMetrics(campaign, DEMO_HISTORY_DAYS);
  const inWindow = dailies.filter((d) => d.date >= startDate && d.date <= endDate);
  const rows = inWindow.map((d) => ({
    date: d.date,
    impressions: d.impressions,
    clicks: d.clicks,
    cost: d.cost,
    conversions: d.conversions,
    allConversions: d.conversions,
    conversionValue: d.conversionValue,
    ctr: d.impressions > 0 ? d.clicks / d.impressions : 0,
    averageCpc: d.clicks > 0 ? d.cost / d.clicks : 0,
  }));
  return { rows };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

export function demoGetCampaignPerformance(
  campaignId: string,
  daysOrOptions: number | DemoCampaignPerformanceOptions = 30,
) {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) throw new Error(`Unknown demo campaign: ${campaignId}`);

  const opts: DemoCampaignPerformanceOptions =
    typeof daysOrOptions === "number" ? { days: daysOrOptions } : daysOrOptions;

  let start: string;
  let end: string;
  let periodDays: number;
  if (opts.startDate && opts.endDate) {
    start = opts.startDate;
    end = opts.endDate;
    periodDays = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
    ) + 1;
  } else {
    periodDays = Math.min(Math.max(opts.days ?? 30, 1), 365);
    ({ start, end } = getDateRange(periodDays));
  }

  const { rows } = dailyRows(campaign, start, end);
  const totals = ratios(sumRows(rows));
  const base = {
    campaignId,
    campaignName: campaign.name,
    dateRange: { start, end, days: periodDays },
    totals,
    daily: rows,
  };
  if (!opts.comparePreviousPeriod) return base;

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - periodDays + 1);
  const prev = dailyRows(campaign, formatDate(prevStart), formatDate(prevEnd));
  const prevTotals = ratios(sumRows(prev.rows));
  return {
    ...base,
    comparison: {
      dateRange: {
        start: formatDate(prevStart),
        end: formatDate(prevEnd),
        days: periodDays,
      },
      totals: prevTotals,
      daily: prev.rows,
      changes: {
        impressions: pctChange(totals.impressions, prevTotals.impressions),
        clicks: pctChange(totals.clicks, prevTotals.clicks),
        cost: pctChange(totals.cost, prevTotals.cost),
        conversions: pctChange(totals.conversions, prevTotals.conversions),
        conversionValue: pctChange(totals.conversionValue, prevTotals.conversionValue),
        ctr: pctChange(totals.ctr, prevTotals.ctr),
        averageCpc: pctChange(totals.averageCpc, prevTotals.averageCpc),
      },
    },
  };
}

// ─── Keywords ────────────────────────────────────────────────────────

export function demoGetKeywords(campaignId: string, days: number, limit: number) {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) return { campaignId, dateRange: getDateRangeWithDays(days), keywords: [] };
  const rows = generateDemoKeywords(campaign, Math.min(days, DEMO_HISTORY_DAYS), limit);
  return {
    campaignId,
    dateRange: getDateRangeWithDays(days),
    keywords: rows.map((r) => ({
      criterionId: r.criterionId,
      adGroupId: r.adGroupId,
      adGroupName: r.adGroupName,
      text: r.text,
      matchType: r.matchType,
      status: r.status,
      qualityScore: r.qualityScore,
      // The real getKeywords also emits these sub-scores via quality_info — mirror them as null.
      creativeQualityScore: null as number | null,
      postClickQualityScore: null as number | null,
      searchPredictedCtr: null as number | null,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      cost: r.cost,
      averageCpc: r.averageCpc,
      conversions: r.conversions,
      firstPageCpc: r.firstPageCpc,
      firstPositionCpc: r.firstPositionCpc,
    })),
  };
}

function getDateRangeWithDays(days: number) {
  const bounded = Math.min(Math.max(days, 1), 365);
  return { ...getDateRange(bounded), days: bounded };
}

// ─── Search term report ─────────────────────────────────────────────

export function demoGetSearchTermReport(campaignId: string, days: number, limit: number) {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) return { campaignId, dateRange: getDateRangeWithDays(days), searchTerms: [] };
  const rows = generateDemoSearchTerms(campaign, Math.min(days, DEMO_HISTORY_DAYS), limit);
  return {
    campaignId,
    dateRange: getDateRangeWithDays(days),
    searchTerms: rows.map((r) => ({
      searchTerm: r.searchTerm,
      status: "ADDED",
      matchType: r.matchType,
      campaignName: campaign.name,
      adGroupName: r.adGroupName,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.impressions > 0 ? r.clicks / r.impressions : 0,
      cost: r.cost,
      conversions: r.conversions,
    })),
  };
}

// ─── Impression share ───────────────────────────────────────────────

export function demoGetImpressionShare(campaignId: string, days: number) {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) {
    return { campaignId, days, impressionShare: null, message: "No data for this date range" };
  }
  const bounded = Math.min(Math.max(days, 1), 90);
  const is = demoImpressionShare(campaign, bounded);
  return {
    campaignId,
    campaignName: campaign.name,
    dateRange: { ...getDateRange(bounded), days: bounded },
    impressionShare: is.impressionShare,
    absoluteTopImpressionShare: is.absoluteTopImpressionShare,
    topImpressionShare: is.topImpressionShare,
    exactMatchImpressionShare: is.exactMatchImpressionShare,
    budgetLostImpressionShare: is.budgetLostImpressionShare,
    rankLostImpressionShare: is.rankLostImpressionShare,
    totalImpressions: is.totalImpressions,
    totalClicks: is.totalClicks,
    totalCost: is.totalCost,
  };
}

// ─── Ad groups / ads ────────────────────────────────────────────────

export function demoListAdGroups(campaignId: string, limit: number) {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) return [];
  const groups = demoAdGroups(campaignId);
  const totals = totalsForCampaign(campaign, 30);
  return groups.slice(0, limit).map((g) => ({
    id: g.id,
    name: g.name,
    status: "ENABLED",
    type: g.type,
    impressions: Math.round(totals.impressions * g.costShare),
    clicks: Math.round(totals.clicks * g.costShare),
    cost: Math.round(totals.cost * g.costShare * 100) / 100,
    conversions: Math.round(totals.conversions * g.costShare * 10) / 10,
  }));
}

export function demoListAds(campaignId: string, adGroupId: string | undefined, days: number, limit: number) {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) {
    return { campaignId, dateRange: getDateRangeWithDays(days), ads: [] };
  }
  const allAds = demoAds(campaignId);
  const filtered = adGroupId ? allAds.filter((a) => a.adGroupId === adGroupId) : allAds;
  const totals = totalsForCampaign(campaign, Math.min(days, DEMO_HISTORY_DAYS));
  const groups = demoAdGroups(campaignId);
  // Per-ad cost = group share × ad share
  const adsWithMetrics = filtered.map((ad) => {
    const group = groups.find((g) => g.id === ad.adGroupId);
    const groupShare = group?.costShare ?? 1;
    const cost = Math.round(totals.cost * groupShare * ad.costShare * 100) / 100;
    const clicks = Math.round(totals.clicks * groupShare * ad.costShare);
    const impr = Math.round(totals.impressions * groupShare * ad.costShare);
    const conv = Math.round(totals.conversions * groupShare * ad.costShare * 10) / 10;
    return {
      adId: ad.adId,
      adName: null as string | null,
      status: ad.status,
      type: ad.type,
      adGroupId: ad.adGroupId,
      adGroupName: ad.adGroupName,
      finalUrls: [...ad.finalUrls],
      headlines: [...ad.headlines],
      descriptions: [...ad.descriptions],
      adStrength: ad.adStrength,
      impressions: impr,
      clicks,
      cost,
      conversions: conv,
    };
  });
  return { campaignId, dateRange: getDateRangeWithDays(days), ads: adsWithMetrics.slice(0, limit) };
}

// ─── Negative keywords ──────────────────────────────────────────────

export function demoGetNegativeKeywords(campaignId: string, limit: number) {
  const rows = demoNegativeKeywords(campaignId);
  return rows.slice(0, limit);
}

// ─── Recommendations ────────────────────────────────────────────────

export function demoGetRecommendations(campaignId?: string) {
  const all = demoRecommendations();
  const filtered = campaignId ? all.filter((r) => r.campaignId === campaignId) : all;
  return { recommendations: filtered };
}

// ─── Conversion actions ─────────────────────────────────────────────

export function demoGetConversionActions() {
  return [
    {
      id: "940000001",
      name: "Purchase (Threadline)",
      type: "WEBPAGE",
      status: "ENABLED",
      category: "PURCHASE",
      includeInConversions: true,
      primaryForGoal: true,
      countingType: "ONE_PER_CLICK",
      defaultValue: null,
      alwaysUseDefaultValue: false,
      mutable: true,
      readOnlyReason: null,
    },
    {
      id: "940000002",
      name: "Add to Cart",
      type: "WEBPAGE",
      status: "ENABLED",
      category: "ADD_TO_CART",
      includeInConversions: false,
      primaryForGoal: false,
      countingType: "ONE_PER_CLICK",
      defaultValue: null,
      alwaysUseDefaultValue: false,
      mutable: true,
      readOnlyReason: null,
    },
    {
      id: "940000003",
      name: "Newsletter Signup",
      type: "WEBPAGE",
      status: "ENABLED",
      category: "SIGNUP",
      includeInConversions: false,
      primaryForGoal: false,
      countingType: "ONE_PER_CLICK",
      defaultValue: 1,
      alwaysUseDefaultValue: true,
      mutable: true,
      readOnlyReason: null,
    },
  ];
}

// ─── Account settings ───────────────────────────────────────────────

export function demoGetAccountSettings() {
  return {
    id: DEMO_CUSTOMER_ID,
    name: DEMO_CUSTOMER_NAME,
    autoTaggingEnabled: true,
    trackingUrlTemplate: null,
    conversionTrackingId: "9400000",
    crossAccountConversionTrackingId: null,
  };
}

// ─── Campaign settings ──────────────────────────────────────────────

export function demoGetCampaignSettings(campaignId: string) {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) return null;
  return {
    campaignId,
    campaignName: campaign.name,
    status: campaign.status,
    startDate: "2026-01-01",
    endDate: null as string | null,
    biddingStrategy: campaign.biddingStrategy,
    targetCpaMicros:
      campaign.biddingStrategy === "TARGET_CPA" ? Math.round((campaign.avgDailyCost / (campaign.avgDailyCost > 0 ? Math.max(campaign.cvr * (campaign.avgDailyCost / campaign.avgCpc), 1) : 1)) * 1_000_000) : null,
    targetRoas: campaign.biddingStrategy === "TARGET_ROAS" ? 3.2 : null,
    networks: {
      googleSearch: true,
      searchPartners: false,
      contentNetwork: false,
    },
    geoTargetPositive: "PRESENCE_OR_INTEREST",
    geoTargetNegative: "PRESENCE",
    locations: [
      { id: "2840", name: "United States", type: "POSITIVE" as const },
    ],
    languages: [{ id: "1000", name: "English" }],
    adSchedule: [] as Array<Record<string, unknown>>,
  };
}

// ─── Budget summary ─────────────────────────────────────────────────

export function demoGetAccountBudgetSummary() {
  const enabled = DEMO_CAMPAIGNS.filter((c) => c.status === "ENABLED");
  const total = enabled.reduce((s, c) => s + c.dailyBudget, 0);
  return {
    totalDailyBudget: total,
    activeCampaigns: enabled.length,
    currencyCode: DEMO_BUSINESS.currency,
  };
}

// ─── Exported campaign list for account switcher / sync ─────────────

export function demoConnectedAccounts() {
  return [{ id: DEMO_CUSTOMER_ID, name: DEMO_CUSTOMER_NAME }];
}
