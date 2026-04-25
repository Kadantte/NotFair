import { getCachedCustomer, getClient, getCustomer, MATCH_TYPE_NAME } from "./client";
import { extractErrorMessage, formatDate, getDateRange, micros, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";
import { isDemoAuth } from "@/lib/demo/constants";
import {
  demoGetAccountBudgetSummary,
  demoGetAccountInfo,
  demoGetAccountSettings,
  demoGetCampaignPerformance,
  demoGetCampaignSettings,
  demoGetConversionActions,
  demoGetImpressionShare,
  demoGetKeywords,
  demoGetNegativeKeywords,
  demoGetRecommendations,
  demoGetSearchTermReport,
  demoListAdGroups,
  demoListAds,
  demoListCampaigns,
} from "@/lib/demo/reads";

// ─── Read Functions ──────────────────────────────────────────────────

export async function getAccountInfo(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetAccountInfo();
  const customer = getCachedCustomer(auth);
  const result = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.test_account,
      customer.manager
    FROM customer
    LIMIT 1
  `);
  const row = (result as any[])[0]?.customer;
  return {
    id: String(row?.id ?? normalizeCustomerId(auth.customerId)),
    name: row?.descriptive_name ?? "Untitled account",
    currencyCode: row?.currency_code ?? null,
    timeZone: row?.time_zone ?? null,
    isTestAccount: Boolean(row?.test_account),
    isManager: Boolean(row?.manager),
  };
}

/**
 * Get budget summary for an account: total daily budget across all active campaigns,
 * number of active campaigns, and currency code.
 */
export async function getAccountBudgetSummary(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetAccountBudgetSummary();
  const customer = getCachedCustomer(auth);
  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.campaign_budget,
      campaign_budget.amount_micros,
      customer.currency_code
    FROM campaign
    WHERE campaign.status = 'ENABLED'
  `);
  const rows = result as any[];
  // Deduplicate budgets by resource name (shared budgets)
  const seenBudgets = new Set<string>();
  let totalBudgetMicros = 0;
  let currencyCode: string | null = null;
  let enabledCampaigns = 0;

  for (const row of rows) {
    enabledCampaigns++;
    if (!currencyCode) currencyCode = row.customer?.currency_code ?? null;
    const budgetName = row.campaign?.campaign_budget;
    if (budgetName && !seenBudgets.has(budgetName)) {
      seenBudgets.add(budgetName);
      totalBudgetMicros += row.campaign_budget?.amount_micros ?? 0;
    }
  }

  return {
    totalDailyBudget: micros(totalBudgetMicros),
    activeCampaigns: enabledCampaigns,
    currencyCode,
  };
}

export function getUsableAccounts<T extends { isManager: boolean }>(
  customers: Array<T | { error: string }>,
): T[] {
  return customers.filter((c): c is T => !("error" in c) && !c.isManager);
}

export function hasManagerAccount<T extends { isManager: boolean }>(
  customers: Array<T | { error: string }>,
): boolean {
  return customers.some((c) => !("error" in c) && c.isManager);
}

export async function listAccessibleCustomers(refreshToken: string) {
  const client = getClient();
  const response = (await client.listAccessibleCustomers(refreshToken)) as {
    resource_names?: string[];
  };

  return Promise.all(
    (response.resource_names ?? []).map(async (resourceName) => {
      const customerId = resourceName.replace("customers/", "");
      try {
        const info = await getAccountInfo({ refreshToken, customerId });
        return info;
      } catch (error) {
        return {
          id: customerId,
          name: "Unavailable",
          currencyCode: null,
          timeZone: null,
          isTestAccount: false,
          isManager: false,
          error: extractErrorMessage(error, { log: false }),
        };
      }
    }),
  );
}

/**
 * List all non-manager client accounts under a manager (MCC) account.
 * Used when the user only has manager accounts — we fetch their clients so
 * they can connect to an actual ad account.
 */
export async function listClientAccountsUnderManager(
  refreshToken: string,
  managerId: string,
): Promise<{ id: string; name: string }[]> {
  const customer = getClient().Customer({
    customer_id: normalizeCustomerId(managerId),
    login_customer_id: normalizeCustomerId(managerId),
    refresh_token: refreshToken,
  });

  const result = (await customer.query(`
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.manager,
      customer_client.hidden,
      customer_client.status
    FROM customer_client
    WHERE customer_client.manager = false
      AND customer_client.hidden = false
      AND customer_client.status = 'ENABLED'
  `)) as any[];

  return result
    .map((row) => ({
      id: String(row.customer_client?.id ?? ""),
      name: row.customer_client?.descriptive_name || "",
    }))
    .filter((c) => c.id);
}

export async function listCampaigns(
  auth: AuthContext,
  options: { limit?: number; includeRemoved?: boolean; days?: number } = {},
) {
  if (isDemoAuth(auth)) return demoListCampaigns(options);
  const customer = getCachedCustomer(auth);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const conditions: string[] = [];
  if (options.days != null) {
    const { start, end } = getDateRange(options.days);
    conditions.push(`segments.date BETWEEN '${start}' AND '${end}'`);
  }
  if (!options.includeRemoved) {
    conditions.push("campaign.status != 'REMOVED'");
  }
  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign.network_settings.target_content_network,
      campaign.tracking_url_template,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions
    FROM campaign
    ${whereClause}
    ORDER BY metrics.impressions DESC
    LIMIT ${limit}
  `);

  return (result as any[]).map((row) => ({
    id: String(row.campaign.id),
    name: row.campaign.name ?? "Untitled campaign",
    status: row.campaign.status ?? "UNKNOWN",
    channelType: row.campaign.advertising_channel_type ?? "UNKNOWN",
    biddingStrategy: row.campaign.bidding_strategy_type ?? "UNKNOWN",
    networkDisplayEnabled: row.campaign.network_settings?.target_content_network ?? false,
    trackingTemplate: row.campaign.tracking_url_template ?? null,
    impressions: row.metrics.impressions ?? 0,
    clicks: row.metrics.clicks ?? 0,
    cost: micros(row.metrics.cost_micros),
    conversions: row.metrics.conversions ?? 0,
    allConversions: row.metrics.all_conversions ?? 0,
  }));
}

type PerfTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  allConversions: number;
  conversionValue: number;
};

type PerfTotalsWithRatios = PerfTotals & {
  ctr: number;
  averageCpc: number;
  cpa: number | null;
  roas: number | null;
};

function computeRatios(t: PerfTotals): PerfTotalsWithRatios {
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    averageCpc: t.clicks > 0 ? t.cost / t.clicks : 0,
    cpa: t.conversions > 0 ? t.cost / t.conversions : null,
    roas: t.cost > 0 ? t.conversionValue / t.cost : null,
  };
}

function sumTotals(rows: PerfTotals[]): PerfTotals {
  return rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      cost: acc.cost + row.cost,
      conversions: acc.conversions + row.conversions,
      allConversions: acc.allConversions + row.allConversions,
      conversionValue: acc.conversionValue + row.conversionValue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, allConversions: 0, conversionValue: 0 },
  );
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

async function queryPerformanceRows(
  customer: any,
  campaignId: number,
  start: string,
  end: string,
) {
  const result = await customer.query(`
    SELECT
      campaign.id, campaign.name,
      segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.all_conversions, metrics.conversions_value,
      metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY segments.date ASC
  `);

  return {
    campaignName: (result as any[])[0]?.campaign?.name ?? "Unknown",
    rows: (result as any[]).map((row: any) => ({
      date: row.segments.date,
      impressions: row.metrics.impressions ?? 0,
      clicks: row.metrics.clicks ?? 0,
      cost: micros(row.metrics.cost_micros),
      conversions: row.metrics.conversions ?? 0,
      allConversions: row.metrics.all_conversions ?? 0,
      conversionValue: row.metrics.conversions_value ?? 0,
      ctr: row.metrics.ctr ?? 0,
      averageCpc: micros(row.metrics.average_cpc),
    })),
  };
}

export type CampaignPerformanceOptions = {
  /** Number of days to look back (alternative to startDate/endDate). Default 30. */
  days?: number;
  /** Explicit start date (YYYY-MM-DD). Overrides days when both startDate and endDate are set. */
  startDate?: string;
  /** Explicit end date (YYYY-MM-DD). Overrides days when both startDate and endDate are set. */
  endDate?: string;
  /** Include a comparison with the previous period of equal length. */
  comparePreviousPeriod?: boolean;
};

export async function getCampaignPerformance(
  auth: AuthContext,
  campaignId: string,
  daysOrOptions: number | CampaignPerformanceOptions = 30,
) {
  if (isDemoAuth(auth)) return demoGetCampaignPerformance(campaignId, daysOrOptions);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const opts: CampaignPerformanceOptions =
    typeof daysOrOptions === "number" ? { days: daysOrOptions } : daysOrOptions;

  let start: string;
  let end: string;
  let periodDays: number;

  if (opts.startDate || opts.endDate) {
    if (!opts.startDate || !opts.endDate) {
      throw new Error("Both startDate and endDate are required when specifying a date range");
    }
    start = opts.startDate;
    end = opts.endDate;
    periodDays = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
    ) + 1;
    if (periodDays < 1) {
      throw new Error("startDate must be before or equal to endDate");
    }
    if (periodDays > 365) {
      throw new Error("Date range cannot exceed 365 days");
    }
  } else {
    periodDays = Math.min(Math.max(opts.days ?? 30, 1), 365);
    ({ start, end } = getDateRange(periodDays));
  }

  const { campaignName, rows } = await queryPerformanceRows(customer, id, start, end);
  const totals = computeRatios(sumTotals(rows));

  const base = {
    campaignId,
    campaignName,
    dateRange: { start, end, days: periodDays },
    totals,
    daily: rows,
  };

  if (!opts.comparePreviousPeriod) return base;

  // Compute previous period of equal length ending the day before `start`
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - periodDays + 1);

  const prev = await queryPerformanceRows(
    customer, id, formatDate(prevStart), formatDate(prevEnd),
  );
  const prevTotals = computeRatios(sumTotals(prev.rows));

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

export async function getKeywords(
  auth: AuthContext,
  campaignId: string,
  days = 30,
  limit = 50,
) {
  if (isDemoAuth(auth)) return demoGetKeywords(campaignId, days, limit);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  // Query 1: keyword_view for metrics (quality_info sub-fields aren't available here)
  const metricsResult = await customer.query(`
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.average_cpc, metrics.conversions
    FROM keyword_view
    WHERE campaign.id = ${id}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY metrics.impressions DESC
    LIMIT ${boundedLimit}
  `);

  // Query 2: ad_group_criterion for quality_info + position_estimates
  // position_estimates (first_page / first_position CPC) is required by RMF R.50.
  // Queried here rather than in keyword_view because keyword_view doesn't expose it.
  const qualityResult = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      ad_group_criterion.position_estimates.first_page_cpc_micros,
      ad_group_criterion.position_estimates.first_position_cpc_micros
    FROM ad_group_criterion
    WHERE campaign.id = ${id}
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
  `);

  // Index quality + position data by criterion ID for fast lookup
  const detailsByCriterion = new Map<string, { quality: any; positionEstimates: any }>();
  for (const row of qualityResult as any[]) {
    const criterion = row.ad_group_criterion;
    detailsByCriterion.set(String(criterion.criterion_id), {
      quality: criterion.quality_info,
      positionEstimates: criterion.position_estimates,
    });
  }

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    keywords: (metricsResult as any[]).map((row) => {
      const rawMatchType = row.ad_group_criterion?.keyword?.match_type;
      const criterionId = String(row.ad_group_criterion.criterion_id);
      const details = detailsByCriterion.get(criterionId);
      const quality = details?.quality;
      const positionEstimates = details?.positionEstimates;
      return {
        criterionId,
        adGroupId: String(row.ad_group?.id ?? ""),
        adGroupName: row.ad_group?.name ?? "Unknown",
        text: row.ad_group_criterion.keyword?.text ?? "",
        matchType: (typeof rawMatchType === "number" ? MATCH_TYPE_NAME[rawMatchType] : rawMatchType) ?? "UNKNOWN",
        status: row.ad_group_criterion.status ?? "UNKNOWN",
        qualityScore: quality?.quality_score ?? null,
        creativeQuality: quality?.creative_quality_score ?? null,
        postClickQuality: quality?.post_click_quality_score ?? null,
        searchPredictedCtr: quality?.search_predicted_ctr ?? null,
        firstPageCpc: positionEstimates?.first_page_cpc_micros != null
          ? micros(Number(positionEstimates.first_page_cpc_micros))
          : null,
        firstPositionCpc: positionEstimates?.first_position_cpc_micros != null
          ? micros(Number(positionEstimates.first_position_cpc_micros))
          : null,
        impressions: row.metrics.impressions ?? 0,
        clicks: row.metrics.clicks ?? 0,
        ctr: row.metrics.ctr ?? 0,
        cost: micros(row.metrics.cost_micros),
        averageCpc: micros(row.metrics.average_cpc),
        conversions: row.metrics.conversions ?? 0,
      };
    }),
  };
}

export type ListKeywordsOptions = {
  campaignId?: string;
  adGroupId?: string;
  /** true = positive keywords only; false = negative keywords only. Default true. */
  positive?: boolean;
  /** true = only ENABLED criteria; false = include PAUSED but still exclude REMOVED. Default true. */
  enabledOnly?: boolean;
  /** Exclude rows under REMOVED campaigns/ad groups. Default true. */
  excludeRemovedParents?: boolean;
  includeQualityInfo?: boolean;
  includeBidInfo?: boolean;
  limit?: number;
};

export async function listKeywords(auth: AuthContext, options: ListKeywordsOptions = {}) {
  const {
    campaignId,
    adGroupId,
    positive = true,
    enabledOnly = true,
    excludeRemovedParents = true,
    includeQualityInfo = false,
    includeBidInfo = false,
  } = options;
  const boundedLimit = Math.min(Math.max(options.limit ?? 500, 1), 1000);

  if (isDemoAuth(auth)) {
    const campaigns = campaignId
      ? [{ id: campaignId }]
      : demoListCampaigns({ limit: 100 }).map((campaign) => ({ id: campaign.id }));
    const keywords = positive
      ? campaigns.flatMap((campaign) =>
          demoGetKeywords(campaign.id, 30, boundedLimit).keywords.map((keyword) => ({
            campaignId: campaign.id,
            campaignName: null as string | null,
            campaignStatus: "ENABLED",
            adGroupId: keyword.adGroupId,
            adGroupName: keyword.adGroupName,
            adGroupStatus: "ENABLED",
            criterionId: keyword.criterionId,
            resourceName: null as string | null,
            text: keyword.text,
            matchType: keyword.matchType,
            status: keyword.status,
            negative: false,
            ...(includeBidInfo ? { cpcBidMicros: null as number | null, cpcBid: null as number | null } : {}),
            ...(includeQualityInfo
              ? {
                  qualityScore: keyword.qualityScore,
                  creativeQualityScore: keyword.creativeQualityScore,
                  postClickQualityScore: keyword.postClickQualityScore,
                  searchPredictedCtr: keyword.searchPredictedCtr,
                }
              : {}),
          })),
        )
      : [];

    const filtered = adGroupId ? keywords.filter((keyword) => keyword.adGroupId === adGroupId) : keywords;
    return {
      filters: { campaignId: campaignId ?? null, adGroupId: adGroupId ?? null, positive, enabledOnly, excludeRemovedParents, includeQualityInfo, includeBidInfo },
      count: Math.min(filtered.length, boundedLimit),
      keywords: filtered.slice(0, boundedLimit),
    };
  }

  const customer = getCachedCustomer(auth);
  const selectFields = [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "ad_group.id",
    "ad_group.name",
    "ad_group.status",
    "ad_group_criterion.resource_name",
    "ad_group_criterion.criterion_id",
    "ad_group_criterion.status",
    "ad_group_criterion.negative",
    "ad_group_criterion.keyword.text",
    "ad_group_criterion.keyword.match_type",
  ];

  if (includeBidInfo) {
    selectFields.push("ad_group_criterion.cpc_bid_micros");
  }
  if (includeQualityInfo) {
    selectFields.push(
      "ad_group_criterion.quality_info.quality_score",
      "ad_group_criterion.quality_info.creative_quality_score",
      "ad_group_criterion.quality_info.post_click_quality_score",
      "ad_group_criterion.quality_info.search_predicted_ctr",
    );
  }

  const conditions = [
    "ad_group_criterion.type = 'KEYWORD'",
    `ad_group_criterion.negative = ${positive ? "FALSE" : "TRUE"}`,
    enabledOnly
      ? "ad_group_criterion.status = 'ENABLED'"
      : "ad_group_criterion.status != 'REMOVED'",
  ];
  if (campaignId) conditions.push(`campaign.id = ${safeEntityId(campaignId)}`);
  if (adGroupId) conditions.push(`ad_group.id = ${safeEntityId(adGroupId)}`);
  if (excludeRemovedParents) {
    conditions.push("campaign.status != 'REMOVED'", "ad_group.status != 'REMOVED'");
  }

  const rows = await customer.query(`
    SELECT
      ${selectFields.join(",\n      ")}
    FROM ad_group_criterion
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY campaign.name ASC, ad_group.name ASC, ad_group_criterion.keyword.text ASC
    LIMIT ${boundedLimit}
  `);

  return {
    filters: { campaignId: campaignId ?? null, adGroupId: adGroupId ?? null, positive, enabledOnly, excludeRemovedParents, includeQualityInfo, includeBidInfo },
    count: (rows as unknown[]).length,
    keywords: (rows as any[]).map((row) => {
      const rawMatchType = row.ad_group_criterion?.keyword?.match_type;
      const cpcBidMicros = row.ad_group_criterion?.cpc_bid_micros != null
        ? Number(row.ad_group_criterion.cpc_bid_micros)
        : null;
      const quality = row.ad_group_criterion?.quality_info ?? {};
      return {
        campaignId: String(row.campaign?.id ?? ""),
        campaignName: row.campaign?.name ?? null,
        campaignStatus: row.campaign?.status ?? "UNKNOWN",
        adGroupId: String(row.ad_group?.id ?? ""),
        adGroupName: row.ad_group?.name ?? null,
        adGroupStatus: row.ad_group?.status ?? "UNKNOWN",
        criterionId: String(row.ad_group_criterion?.criterion_id ?? ""),
        resourceName: row.ad_group_criterion?.resource_name ?? null,
        text: row.ad_group_criterion?.keyword?.text ?? "",
        matchType: normalizeKeywordMatchType(rawMatchType),
        status: row.ad_group_criterion?.status ?? "UNKNOWN",
        negative: row.ad_group_criterion?.negative ?? false,
        ...(includeBidInfo ? { cpcBidMicros, cpcBid: cpcBidMicros != null ? micros(cpcBidMicros) : null } : {}),
        ...(includeQualityInfo
          ? {
              qualityScore: quality.quality_score ?? null,
              creativeQualityScore: quality.creative_quality_score ?? null,
              postClickQualityScore: quality.post_click_quality_score ?? null,
              searchPredictedCtr: quality.search_predicted_ctr ?? null,
            }
          : {}),
      };
    }),
  };
}

function normalizeKeywordMatchType(raw: unknown): string {
  if (raw == null) return "UNKNOWN";
  if (typeof raw === "number") {
    if (raw === 0) return "UNSPECIFIED";
    return MATCH_TYPE_NAME[raw] ?? String(raw);
  }
  return String(raw);
}

export async function getSearchTermReport(
  auth: AuthContext,
  campaignId: string,
  days = 30,
  limit = 50,
) {
  if (isDemoAuth(auth)) return demoGetSearchTermReport(campaignId, days, limit);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      segments.search_term_match_type,
      campaign.name,
      ad_group.name,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE campaign.id = ${id}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY metrics.cost_micros DESC
    LIMIT ${boundedLimit}
  `);

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    searchTerms: (result as any[]).map((row) => {
      const rawMatchType = row.segments?.search_term_match_type;
      return {
        searchTerm: row.search_term_view.search_term ?? "",
        status: row.search_term_view.status ?? "UNKNOWN",
        matchType: (typeof rawMatchType === "number" ? MATCH_TYPE_NAME[rawMatchType] : rawMatchType) ?? "UNKNOWN",
        campaignName: row.campaign?.name ?? "Unknown",
        adGroupName: row.ad_group?.name ?? "Unknown",
        impressions: row.metrics.impressions ?? 0,
        clicks: row.metrics.clicks ?? 0,
        ctr: row.metrics.ctr ?? 0,
        cost: micros(row.metrics.cost_micros),
        conversions: row.metrics.conversions ?? 0,
      };
    }),
  };
}

export type PaidVsOrganicOptions = {
  days?: number;
  searchTermContains?: string;
  campaignId?: string;
  limit?: number;
};

export async function getPaidVsOrganicAnalysis(
  auth: AuthContext,
  options: PaidVsOrganicOptions = {},
) {
  const customer = getCachedCustomer(auth);
  const days = Math.min(Math.max(options.days ?? 90, 1), 365);
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  const { start, end } = getDateRange(days);

  const filters: string[] = [`segments.date BETWEEN '${start}' AND '${end}'`];
  if (options.searchTermContains) {
    const safe = options.searchTermContains.replace(/'/g, "");
    filters.push(`paid_organic_search_term_view.search_term LIKE '%${safe}%'`);
  }
  if (options.campaignId) {
    filters.push(`campaign.id = ${safeEntityId(options.campaignId)}`);
  }

  const result = await customer.query(`
    SELECT
      paid_organic_search_term_view.search_term,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.organic_impressions,
      metrics.organic_clicks,
      metrics.organic_clicks_per_query,
      metrics.organic_impressions_per_query,
      metrics.organic_queries,
      metrics.combined_clicks,
      metrics.combined_clicks_per_query,
      metrics.combined_queries
    FROM paid_organic_search_term_view
    WHERE ${filters.join(" AND ")}
    ORDER BY metrics.combined_queries DESC
    LIMIT ${limit}
  `);

  const rows = result as any[];

  if (rows.length === 0) {
    return {
      dateRange: { start, end, days },
      gscLinked: false,
      message: "No rows returned. paid_organic_search_term_view requires a Search Console property linked to this Google Ads account (Tools → Linked accounts → Search Console). Allow ~24h after linking for data to populate.",
      terms: [],
      summary: null,
    };
  }

  const terms = rows.map((row) => {
    const paidClicks = row.metrics?.clicks ?? 0;
    const paidImpressions = row.metrics?.impressions ?? 0;
    const paidConversions = row.metrics?.conversions ?? 0;
    const paidValue = row.metrics?.conversions_value ?? 0;
    const paidCost = micros(row.metrics?.cost_micros);
    const orgClicks = row.metrics?.organic_clicks ?? 0;
    const orgImpressions = row.metrics?.organic_impressions ?? 0;
    const orgQueries = row.metrics?.organic_queries ?? 0;
    const combinedClicks = row.metrics?.combined_clicks ?? 0;
    const combinedQueries = row.metrics?.combined_queries ?? 0;

    const paidConvRate = paidClicks > 0 ? paidConversions / paidClicks : 0;
    const totalClicks = paidClicks + orgClicks;
    const paidShare = totalClicks > 0 ? paidClicks / totalClicks : null;
    const organicShare = totalClicks > 0 ? orgClicks / totalClicks : null;
    const organicCtr = orgImpressions > 0 ? orgClicks / orgImpressions : null;

    // Cannibalization estimate: assume organic would have caught a share of ad clicks
    // proportional to organic's baseline strength on this query.
    const cannibalizationRate = organicShare ?? 0;
    const cannibalizedConversions = paidConversions * cannibalizationRate;
    const incrementalConversions = Math.max(paidConversions - cannibalizedConversions, 0);
    const incrementalCpa = incrementalConversions > 0 ? paidCost / incrementalConversions : null;

    let verdict: string;
    if (paidShare === null) {
      verdict = "no_data";
    } else if (organicShare !== null && organicShare > 0.7 && organicCtr !== null && organicCtr > 0.3) {
      verdict = "cannibalization_likely_pause_or_reduce";
    } else if (organicShare !== null && organicShare > 0.4) {
      verdict = "partial_cannibalization_keep_at_low_budget";
    } else if (orgImpressions > 0 && (organicCtr ?? 0) < 0.1) {
      verdict = "organic_weak_paid_doing_real_work";
    } else if (orgImpressions === 0) {
      verdict = "no_organic_presence_paid_essential";
    } else {
      verdict = "paid_incremental_keep";
    }

    return {
      searchTerm: row.paid_organic_search_term_view?.search_term ?? "",
      campaignName: row.campaign?.name ?? null,
      paid: {
        impressions: paidImpressions,
        clicks: paidClicks,
        cost: paidCost,
        conversions: paidConversions,
        conversionValue: paidValue,
        cpa: paidConversions > 0 ? paidCost / paidConversions : null,
        conversionRate: paidConvRate,
      },
      organic: {
        impressions: orgImpressions,
        clicks: orgClicks,
        queries: orgQueries,
        ctr: organicCtr,
        clicksPerQuery: row.metrics?.organic_clicks_per_query ?? null,
      },
      combined: {
        clicks: combinedClicks,
        queries: combinedQueries,
        clicksPerQuery: row.metrics?.combined_clicks_per_query ?? null,
      },
      analysis: {
        paidShare,
        organicShare,
        cannibalizationRate,
        estimatedCannibalizedConversions: cannibalizedConversions,
        estimatedIncrementalConversions: incrementalConversions,
        estimatedIncrementalCpa: incrementalCpa,
        verdict,
      },
    };
  });

  const totals = terms.reduce(
    (acc, t) => {
      acc.paidCost += t.paid.cost;
      acc.paidConversions += t.paid.conversions;
      acc.paidClicks += t.paid.clicks;
      acc.organicClicks += t.organic.clicks;
      acc.estIncrementalConversions += t.analysis.estimatedIncrementalConversions;
      return acc;
    },
    { paidCost: 0, paidConversions: 0, paidClicks: 0, organicClicks: 0, estIncrementalConversions: 0 },
  );

  return {
    dateRange: { start, end, days },
    gscLinked: true,
    rowCount: terms.length,
    summary: {
      totalPaidCost: totals.paidCost,
      totalPaidConversions: totals.paidConversions,
      totalPaidClicks: totals.paidClicks,
      totalOrganicClicks: totals.organicClicks,
      overallPaidShare: (totals.paidClicks + totals.organicClicks) > 0
        ? totals.paidClicks / (totals.paidClicks + totals.organicClicks)
        : null,
      estimatedIncrementalConversions: totals.estIncrementalConversions,
      estimatedIncrementalCpa: totals.estIncrementalConversions > 0
        ? totals.paidCost / totals.estIncrementalConversions
        : null,
      cannibalizationVerdict:
        totals.paidConversions > 0
          ? `${(((totals.paidConversions - totals.estIncrementalConversions) / totals.paidConversions) * 100).toFixed(0)}% of paid conversions estimated cannibalized by organic`
          : null,
    },
    terms,
  };
}

export async function getNegativeKeywords(
  auth: AuthContext,
  campaignId: string,
  limit = 100,
) {
  if (isDemoAuth(auth)) return demoGetNegativeKeywords(campaignId, limit);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedLimit = Math.min(Math.max(limit, 1), 500);

  const result = await customer.query(`
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type,
      campaign_criterion.negative
    FROM campaign_criterion
    WHERE campaign.id = ${id}
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
    LIMIT ${boundedLimit}
  `);

  return (result as any[]).map((row: any) => ({
    criterionId: String(row.campaign_criterion?.criterion_id ?? ""),
    text: row.campaign_criterion?.keyword?.text ?? "",
    matchType: row.campaign_criterion?.keyword?.match_type ?? "UNKNOWN",
  }));
}

export async function listAdGroups(
  auth: AuthContext,
  campaignId: string,
  limit = 50,
) {
  if (isDemoAuth(auth)) return demoListAdGroups(campaignId, limit);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const bounded = Math.min(Math.max(limit, 1), 100);

  const result = await customer.query(`
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${id}
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
    LIMIT ${bounded}
  `);

  return (result as any[]).map((row) => ({
    id: String(row.ad_group.id),
    name: row.ad_group.name ?? "Untitled ad group",
    status: row.ad_group.status ?? "UNKNOWN",
    type: row.ad_group.type ?? "UNKNOWN",
    impressions: row.metrics?.impressions ?? 0,
    clicks: row.metrics?.clicks ?? 0,
    cost: micros(row.metrics?.cost_micros),
    conversions: row.metrics?.conversions ?? 0,
  }));
}

export async function listAds(
  auth: AuthContext,
  campaignId: string,
  adGroupId?: string,
  days = 30,
  limit = 50,
) {
  if (isDemoAuth(auth)) return demoListAds(campaignId, adGroupId, days, limit);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const bounded = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const adGroupIdNum = adGroupId ? safeEntityId(adGroupId, "ad group") : null;
  const adGroupFilter = adGroupIdNum ? `AND ad_group.id = ${adGroupIdNum}` : "";

  const result = await customer.query(`
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad_strength,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group_ad
    WHERE campaign.id = ${id}
      AND ad_group_ad.status != 'REMOVED'
      AND segments.date BETWEEN '${start}' AND '${end}'
      ${adGroupFilter}
    ORDER BY metrics.impressions DESC
    LIMIT ${bounded}
  `);

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    ads: (result as any[]).map((row) => {
      const ad = row.ad_group_ad?.ad ?? {};
      const rsa = ad.responsive_search_ad ?? {};
      return {
        adId: String(ad.id ?? ""),
        adName: ad.name ?? null,
        status: row.ad_group_ad?.status ?? "UNKNOWN",
        type: ad.type ?? "UNKNOWN",
        adGroupId: String(row.ad_group?.id ?? ""),
        adGroupName: row.ad_group?.name ?? "",
        finalUrls: ad.final_urls ?? [],
        headlines: (rsa.headlines ?? []).map((h: any) => h.text ?? ""),
        descriptions: (rsa.descriptions ?? []).map((d: any) => d.text ?? ""),
        adStrength: row.ad_group_ad?.ad_strength ?? null,
        impressions: row.metrics?.impressions ?? 0,
        clicks: row.metrics?.clicks ?? 0,
        cost: micros(row.metrics?.cost_micros),
        conversions: row.metrics?.conversions ?? 0,
      };
    }),
  };
}

/** Fetch Smart campaign ads (basic fields only).
 *  Per Google Ads API docs, Smart campaign ad copy (headlines/descriptions) is NOT
 *  available through GAQL reporting — only campaign-level metrics and
 *  smart_campaign_search_term_view are supported for Smart campaigns.
 *  We still query ad_group_ad for basic info (id, status, final_urls). */
export async function getSmartCampaignAds(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.type,
      ad_group.id,
      ad_group.name
    FROM ad_group_ad
    WHERE campaign.id = ${id}
      AND ad_group_ad.status != 'REMOVED'
    LIMIT 50
  `);

  return (result as any[]).map((row) => {
    const ad = row.ad_group_ad?.ad ?? {};
    return {
      adId: String(ad.id ?? ""),
      adName: ad.name ?? null,
      status: row.ad_group_ad?.status ?? "UNKNOWN",
      type: "SMART_CAMPAIGN_AD",
      adGroupId: String(row.ad_group?.id ?? ""),
      adGroupName: row.ad_group?.name ?? "",
      finalUrls: ad.final_urls ?? [],
      headlines: [] as string[],
      descriptions: [] as string[],
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    };
  });
}

/** Fetch search terms that triggered a Smart campaign's ads.
 *  Uses smart_campaign_search_term_view (not standard search_term_view). */
export async function getSmartCampaignSearchTerms(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      smart_campaign_search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM smart_campaign_search_term_view
    WHERE campaign.id = ${id}
      AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 50
  `);

  return (result as any[]).map((row) => ({
    searchTerm: row.smart_campaign_search_term_view?.search_term ?? "",
    impressions: row.metrics?.impressions ?? 0,
    clicks: row.metrics?.clicks ?? 0,
    cost: micros(row.metrics?.cost_micros),
  }));
}

export async function getSmartCampaignKeywordThemes(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.keyword_theme.free_form_keyword_theme,
      campaign_criterion.keyword_theme.keyword_theme_constant,
      campaign_criterion.status
    FROM campaign_criterion
    WHERE campaign.id = ${id}
      AND campaign_criterion.type = 'KEYWORD_THEME'
      AND campaign_criterion.status != 'REMOVED'
    ORDER BY campaign_criterion.criterion_id ASC
  `);

  return (result as any[]).map((row) => {
    const cc = row.campaign_criterion ?? {};
    const theme = cc.keyword_theme ?? {};
    // Prefer free-form text; fall back to the last segment of the constant resource name
    const text = theme.free_form_keyword_theme
      || (theme.keyword_theme_constant
          ? String(theme.keyword_theme_constant).split("/").pop() ?? "Unknown theme"
          : "Unknown theme");
    return {
      criterionId: String(cc.criterion_id ?? ""),
      text,
      isFreeForm: Boolean(theme.free_form_keyword_theme),
      status: cc.status ?? "UNKNOWN",
    };
  });
}

export async function getSmartCampaignSetting(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      smart_campaign_setting.final_url,
      smart_campaign_setting.business_name,
      smart_campaign_setting.phone_number.phone_number,
      smart_campaign_setting.phone_number.country_code
    FROM smart_campaign_setting
    WHERE campaign.id = ${id}
    LIMIT 1
  `);

  const row = (result as any[])[0];
  if (!row) return null;
  const s = row.smart_campaign_setting ?? {};
  return {
    finalUrl: s.final_url ?? null,
    businessName: s.business_name ?? null,
    phoneNumber: s.phone_number?.phone_number ?? null,
  };
}

export async function getImpressionShare(
  auth: AuthContext,
  campaignId: string,
  days: number,
) {
  if (isDemoAuth(auth)) return demoGetImpressionShare(campaignId, days);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 90);
  const { start, end } = getDateRange(boundedDays);

  // Query without date segmentation to get Google's correctly weighted aggregate IS values
  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_absolute_top_impression_share,
      metrics.search_top_impression_share,
      metrics.search_exact_match_impression_share,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.id = ${id}
      AND segments.date BETWEEN '${start}' AND '${end}'
    LIMIT 1
  `);

  const row = (result as any[])[0];
  if (!row) {
    return { campaignId, days: boundedDays, impressionShare: null, message: "No data for this date range" };
  }

  const m = row.metrics ?? {};
  return {
    campaignId,
    campaignName: row.campaign?.name ?? "",
    dateRange: { start, end, days: boundedDays },
    impressionShare: m.search_impression_share ?? null,
    absoluteTopImpressionShare: m.search_absolute_top_impression_share ?? null,
    topImpressionShare: m.search_top_impression_share ?? null,
    exactMatchImpressionShare: m.search_exact_match_impression_share ?? null,
    budgetLostImpressionShare: m.search_budget_lost_impression_share ?? null,
    rankLostImpressionShare: m.search_rank_lost_impression_share ?? null,
    totalImpressions: m.impressions ?? 0,
    totalClicks: m.clicks ?? 0,
    totalCost: micros(m.cost_micros),
  };
}

export async function getConversionActions(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetConversionActions();
  const customer = getCachedCustomer(auth);

  const result = await customer.query(`
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.category,
      conversion_action.include_in_conversions_metric,
      conversion_action.counting_type,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.always_use_default_value,
      conversion_action.primary_for_goal
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name ASC
  `);

  return (result as any[]).map((row) => {
    const ca = row.conversion_action ?? {};
    return {
      id: String(ca.id ?? ""),
      name: ca.name ?? "Untitled",
      type: ca.type ?? "UNKNOWN",
      status: ca.status ?? "UNKNOWN",
      category: ca.category ?? "UNKNOWN",
      includeInConversions: ca.include_in_conversions_metric ?? true,
      primaryForGoal: ca.primary_for_goal ?? true,
      countingType: ca.counting_type ?? "UNKNOWN",
      defaultValue: ca.value_settings?.default_value ?? null,
      alwaysUseDefaultValue: ca.value_settings?.always_use_default_value ?? false,
    };
  });
}

export async function getAccountSettings(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetAccountSettings();
  const customer = getCachedCustomer(auth);

  const result = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.auto_tagging_enabled,
      customer.tracking_url_template,
      customer.conversion_tracking_setting.conversion_tracking_id,
      customer.conversion_tracking_setting.cross_account_conversion_tracking_id
    FROM customer
    LIMIT 1
  `);

  const row = (result as any[])[0]?.customer ?? {};
  return {
    id: String(row.id ?? normalizeCustomerId(auth.customerId)),
    name: row.descriptive_name ?? "Untitled account",
    autoTaggingEnabled: row.auto_tagging_enabled ?? false,
    trackingUrlTemplate: row.tracking_url_template ?? null,
    conversionTrackingId: row.conversion_tracking_setting?.conversion_tracking_id
      ? String(row.conversion_tracking_setting.conversion_tracking_id)
      : null,
    crossAccountConversionTrackingId: row.conversion_tracking_setting?.cross_account_conversion_tracking_id
      ? String(row.conversion_tracking_setting.cross_account_conversion_tracking_id)
      : null,
  };
}

export async function getCampaignSettings(
  auth: AuthContext,
  campaignId: string,
) {
  if (isDemoAuth(auth)) return demoGetCampaignSettings(campaignId);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  // 2 queries instead of 3: campaign settings + combined location/schedule criteria
  const [campaignResult, criteriaResult] = await Promise.all([
    customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.start_date,
        campaign.end_date,
        campaign.bidding_strategy_type,
        campaign.target_cpa.target_cpa_micros,
        campaign.target_roas.target_roas,
        campaign.maximize_conversions.target_cpa_micros,
        campaign.network_settings.target_google_search,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_content_network,
        campaign.geo_target_type_setting.positive_geo_target_type,
        campaign.geo_target_type_setting.negative_geo_target_type
      FROM campaign
      WHERE campaign.id = ${id}
      LIMIT 1
    `),
    customer.query(`
      SELECT
        campaign_criterion.type,
        campaign_criterion.criterion_id,
        campaign_criterion.negative,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.proximity.address.city_name,
        campaign_criterion.proximity.address.postal_code,
        campaign_criterion.proximity.radius,
        campaign_criterion.proximity.radius_units,
        campaign_criterion.proximity.geo_point.latitude_in_micro_degrees,
        campaign_criterion.proximity.geo_point.longitude_in_micro_degrees,
        campaign_criterion.ad_schedule.day_of_week,
        campaign_criterion.ad_schedule.start_hour,
        campaign_criterion.ad_schedule.start_minute,
        campaign_criterion.ad_schedule.end_hour,
        campaign_criterion.ad_schedule.end_minute,
        campaign_criterion.bid_modifier
      FROM campaign_criterion
      WHERE campaign.id = ${id}
        AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY', 'AD_SCHEDULE')
      LIMIT 100
    `),
  ]);

  const c = (campaignResult as any[])[0]?.campaign ?? {};
  const ns = c.network_settings ?? {};

  // Split combined criteria by type
  // google-ads-api returns enum fields as numeric values, not strings
  const CRITERION_TYPE = { LOCATION: 7, AD_SCHEDULE: 9, PROXIMITY: 17 } as const;
  const locationRows = (criteriaResult as any[]).filter((r) => r.campaign_criterion?.type === CRITERION_TYPE.LOCATION);
  const proximityRows = (criteriaResult as any[]).filter((r) => r.campaign_criterion?.type === CRITERION_TYPE.PROXIMITY);
  const scheduleRows = (criteriaResult as any[]).filter((r) => r.campaign_criterion?.type === CRITERION_TYPE.AD_SCHEDULE);

  const locations = locationRows.map((row) => {
    const cc = row.campaign_criterion ?? {};
    const geoConst = cc.location?.geo_target_constant ?? "";
    const geoId = geoConst ? geoConst.replace("geoTargetConstants/", "") : null;
    return {
      criterionId: String(cc.criterion_id ?? ""),
      negative: cc.negative ?? false,
      geoTargetConstantId: geoId,
    };
  });

  const proximityTargets = proximityRows.map((row) => {
    const cc = row.campaign_criterion ?? {};
    const prox = cc.proximity ?? {};
    const addr = prox.address ?? {};
    const geo = prox.geo_point ?? {};
    return {
      criterionId: String(cc.criterion_id ?? ""),
      negative: cc.negative ?? false,
      cityName: addr.city_name ?? null,
      postalCode: addr.postal_code ?? null,
      radius: prox.radius ?? null,
      radiusUnits: prox.radius_units ?? null,
      latitudeMicroDegrees: geo.latitude_in_micro_degrees ?? null,
      longitudeMicroDegrees: geo.longitude_in_micro_degrees ?? null,
    };
  });

  const adSchedule = scheduleRows
    .sort((a, b) => (a.campaign_criterion?.ad_schedule?.day_of_week ?? 0) - (b.campaign_criterion?.ad_schedule?.day_of_week ?? 0))
    .map((row) => {
      const cc = row.campaign_criterion ?? {};
      const sched = cc.ad_schedule ?? {};
      return {
        dayOfWeek: sched.day_of_week ?? "UNKNOWN",
        startHour: sched.start_hour ?? 0,
        startMinute: sched.start_minute ?? "ZERO",
        endHour: sched.end_hour ?? 0,
        endMinute: sched.end_minute ?? "ZERO",
        bidModifier: cc.bid_modifier ?? 1.0,
      };
    });

  return {
    id: String(c.id ?? campaignId),
    name: c.name ?? "",
    status: c.status ?? "UNKNOWN",
    startDate: c.start_date ?? null,
    endDate: c.end_date ?? null,
    biddingStrategy: c.bidding_strategy_type ?? "UNKNOWN",
    targetCpaMicros: c.target_cpa?.target_cpa_micros ?? c.maximize_conversions?.target_cpa_micros ?? null,
    targetRoas: c.target_roas?.target_roas ?? null,
    networks: {
      googleSearch: ns.target_google_search ?? false,
      searchPartners: ns.target_search_network ?? false,
      displayNetwork: ns.target_content_network ?? false,
    },
    locationTargeting: locations,
    proximityTargeting: proximityTargets.length > 0 ? proximityTargets : null,
    adSchedule: adSchedule.length > 0 ? adSchedule : null,
  };
}

export async function getRecommendations(
  auth: AuthContext,
  campaignId?: string,
) {
  if (isDemoAuth(auth)) return demoGetRecommendations(campaignId);
  const customer = getCachedCustomer(auth);
  const campaignFilter = campaignId
    ? `AND campaign.id = ${safeEntityId(campaignId)}`
    : "";

  try {
    const result = await customer.query(`
      SELECT
        recommendation.resource_name,
        recommendation.type,
        recommendation.dismissed,
        recommendation.campaign
      FROM recommendation
      WHERE recommendation.dismissed = FALSE
        ${campaignFilter}
      LIMIT 25
    `);

    const recommendations = (result as any[]).map((row) => {
      const rec = row.recommendation ?? {};
      // resource_name format: customers/{cid}/campaigns/{id} — extract last segment
      const campId = rec.campaign ? (rec.campaign.match(/\/campaigns\/(\d+)$/)?.[1] ?? null) : null;
      return {
        type: String(rec.type ?? "UNKNOWN"),
        campaignId: campId ?? null,
      };
    });
    return { recommendations };
  } catch (error) {
    // Recommendations API may not be available for all accounts
    return { recommendations: [], error: extractErrorMessage(error) };
  }
}

// ─── Safe GAQL Query ─────────────────────────────────────────────────

export const MAX_GAQL_LIMIT = 2000;
export const DEFAULT_GAQL_LIMIT = 200;
const GAQL_BYTE_BUDGET = 40 * 1024; // 40KB — keep responses agent-digestible.

const GAQL_LIMIT_RE = /\bLIMIT\s+(\d+)(?=\s*(?:PARAMETERS\b|$))/i;

/** Extract trailing `LIMIT N` from a GAQL query (LIMIT is always the last clause
 *  before optional PARAMETERS). Returns null when absent. */
export function extractGaqlLimit(query: string): number | null {
  const m = query.match(GAQL_LIMIT_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Rewrite (or append) `LIMIT N` in a GAQL query. Preserves a trailing
 *  PARAMETERS clause if present. */
export function rewriteGaqlLimit(query: string, newLimit: number): string {
  const trimmed = query.trim();
  if (GAQL_LIMIT_RE.test(trimmed)) {
    return trimmed.replace(GAQL_LIMIT_RE, `LIMIT ${newLimit}`);
  }
  const paramIdx = trimmed.search(/\bPARAMETERS\b/i);
  if (paramIdx !== -1) {
    return `${trimmed.slice(0, paramIdx).trimEnd()} LIMIT ${newLimit} ${trimmed.slice(paramIdx)}`;
  }
  return `${trimmed} LIMIT ${newLimit}`;
}

/** Parse `SELECT a, b, c FROM ...` into ["a", "b", "c"]. */
export function extractSelectFields(query: string): string[] {
  const m = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getNestedValue(row: any, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let v: any = row;
  for (const p of parts) {
    if (v == null) return null;
    v = v[p];
  }
  return v ?? null;
}

function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const COST_MICROS_RE = /metrics\.cost_micros$/i;

type GaqlSummary = {
  computedOverRowCount: number;
  sums: Record<string, number>;
  topByCost?: unknown[];
  bottomByCost?: unknown[];
};

const ORDER_BY_COST_RE = /\bORDER\s+BY\s+metrics\.cost_micros\b/i;

/** Aggregate numeric metric columns across the full fetched row set so callers
 *  can make decisions without reading every row.
 *  Skips top/bottom-by-cost when the query already orders by cost — in that
 *  case the rows slice IS the top and "bottom" would just mean "rank ≈ limit",
 *  not actual low-spenders in the population. */
export function buildGaqlSummary(
  rows: any[],
  selectFields: string[],
  query: string = "",
): GaqlSummary | null {
  if (rows.length === 0) return null;
  const metricFields = selectFields.filter((f) => /^metrics\./i.test(f));
  if (metricFields.length === 0) return null;

  const sums: Record<string, number> = {};
  for (const field of metricFields) {
    let sum = 0;
    let hasAny = false;
    for (const row of rows) {
      const n = toFiniteNumber(getNestedValue(row, field));
      if (n != null) {
        sum += n;
        hasAny = true;
      }
    }
    if (hasAny) sums[field] = sum;
  }

  const summary: GaqlSummary = { computedOverRowCount: rows.length, sums };

  const costField = metricFields.find((f) => COST_MICROS_RE.test(f));
  const alreadyOrderedByCost = ORDER_BY_COST_RE.test(query);
  if (costField && rows.length > 1 && !alreadyOrderedByCost) {
    const sorted = [...rows].sort((a, b) => {
      const av = toFiniteNumber(getNestedValue(a, costField)) ?? 0;
      const bv = toFiniteNumber(getNestedValue(b, costField)) ?? 0;
      return bv - av;
    });
    const sliceSize = Math.min(5, Math.floor(sorted.length / 2));
    if (sliceSize > 0) {
      summary.topByCost = sorted.slice(0, sliceSize);
      summary.bottomByCost = sorted.slice(-sliceSize).reverse();
    }
  }

  return summary;
}

/** Suggest follow-up actions when a query is truncated. Both flags can be true
 *  when byte-budget trimming kicks in on top of an already row-truncated set —
 *  the hint reflects both conditions so the agent sees the full picture. */
export function buildContinuationHint(
  query: string,
  returnedRowCount: number,
  effectiveLimit: number,
  flags: { rowTruncated: boolean; byteTruncated: boolean },
): string {
  const { rowTruncated, byteTruncated } = flags;
  const suggestions: string[] = [];
  if (!/\bsegments\.date\b/i.test(query)) {
    suggestions.push("add a date filter (e.g. `WHERE segments.date DURING LAST_7_DAYS`)");
  }
  if (!/\bcampaign\.id\s*(?:IN\s*\(|=)/i.test(query)) {
    suggestions.push("filter to specific campaigns (`WHERE campaign.id IN (...)`)");
  }
  if (rowTruncated && effectiveLimit < MAX_GAQL_LIMIT) {
    suggestions.push(`raise \`limit\` up to ${MAX_GAQL_LIMIT}`);
  }
  if (byteTruncated) {
    suggestions.push("select fewer columns to shrink row size");
  }
  const causes: string[] = [];
  if (rowTruncated) causes.push(`hit row limit of ${effectiveLimit}`);
  if (byteTruncated) causes.push(`exceeded byte budget (trimmed to ${returnedRowCount} rows)`);
  const cause = causes.length > 0
    ? `Truncated: ${causes.join(" and ")}.`
    : "Truncated.";
  const tail = suggestions.length > 0
    ? ` To see more: ${suggestions.join("; ")}.`
    : "";
  return `${cause}${tail}`;
}

export type GaqlReport = {
  rowCount: number;
  requestedLimit: number;
  fetchedRowCount: number;
  truncated: boolean;
  truncationReason: "row_limit" | "byte_budget" | null;
  summary?: GaqlSummary;
  continuationHint?: string;
  rows: unknown[];
};

export type RunSafeGaqlOptions = {
  /**
   * Most agent reads ask for current account state. GAQL does not implicitly
   * hide children of REMOVED campaigns/ad groups, so default to excluding them
   * when the queried resource has a campaign/ad group parent.
   */
  excludeRemovedParents?: boolean;
};

const DEFAULT_EXCLUDE_REMOVED_PARENTS = true;

const CAMPAIGN_SCOPED_RESOURCES = new Set([
  "campaign",
  "ad_group",
  "ad_group_ad",
  "keyword_view",
  "search_term_view",
  "landing_page_view",
  "campaign_criterion",
  "campaign_asset",
  "ad_group_criterion",
  "ad_group_asset",
  "asset_group",
  "asset_group_asset",
  "asset_group_product_group_view",
  "detail_placement_view",
  "display_keyword_view",
  "geographic_view",
  "group_placement_view",
  "location_view",
  "paid_organic_search_term_view",
  "shopping_performance_view",
  "user_location_view",
]);

const AD_GROUP_SCOPED_RESOURCES = new Set([
  "ad_group",
  "ad_group_ad",
  "keyword_view",
  "search_term_view",
  "ad_group_criterion",
  "ad_group_asset",
  "detail_placement_view",
  "display_keyword_view",
  "group_placement_view",
  "paid_organic_search_term_view",
]);

const SEGMENT_WHERE_SELECT_EXEMPTIONS = new Set([
  "segments.date",
  "segments.week",
  "segments.month",
  "segments.quarter",
  "segments.year",
]);

export async function runSafeGaqlReport(
  auth: AuthContext,
  rawQuery: string,
  limit: number = DEFAULT_GAQL_LIMIT,
  options: RunSafeGaqlOptions = {},
): Promise<GaqlReport> {
  let query = rawQuery.trim();
  let normalized = query.toUpperCase();

  if (!normalized.startsWith("SELECT ")) {
    throw new Error("Only read-only SELECT GAQL queries are allowed.");
  }
  if (query.includes(";")) {
    throw new Error("Semicolons are not allowed in GAQL queries.");
  }

  const forbidden = [" INSERT ", " UPDATE ", " DELETE ", " CREATE ", " ALTER ", " DROP ", " TRUNCATE "];
  if (forbidden.some((term) => ` ${normalized} `.includes(term))) {
    throw new Error("The query contains forbidden keywords.");
  }

  validateSegmentsInWhereAreSelected(query);

  if (options.excludeRemovedParents ?? DEFAULT_EXCLUDE_REMOVED_PARENTS) {
    query = applyRemovedParentFilters(query);
    normalized = query.toUpperCase();
  }

  // Resolve effective limit: an explicit GAQL `LIMIT N` wins over the param
  // (users who wrote it meant it), but both are capped at MAX_GAQL_LIMIT.
  const paramLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_GAQL_LIMIT);
  const gaqlLimit = extractGaqlLimit(query);
  const effectiveLimit = gaqlLimit != null
    ? Math.min(gaqlLimit, MAX_GAQL_LIMIT)
    : paramLimit;

  // Fetch one extra row so we can honestly detect `hasMore` without a second
  // round trip. Even when the user wrote an explicit `LIMIT N`, we probe with
  // N+1 — they still get N rows back, plus an honest `truncated` signal telling
  // them more exist. Bounded at MAX_GAQL_LIMIT + 1 regardless.
  const probeLimit = Math.min(effectiveLimit + 1, MAX_GAQL_LIMIT + 1);
  const queryToRun = rewriteGaqlLimit(query, probeLimit);

  let fetched: any[];
  try {
    const customer = getCachedCustomer(auth);
    fetched = (await customer.query(queryToRun)) as any[];
  } catch (error) {
    throw new Error(`GAQL query failed: ${extractErrorMessage(error)}`);
  }

  const rowTruncated = fetched.length > effectiveLimit;
  let rows: any[] = rowTruncated ? fetched.slice(0, effectiveLimit) : fetched;
  const selectFields = extractSelectFields(query);

  // Summary is stable across byte-budget iterations (computed over `fetched`,
  // which doesn't change). Lazy-cache so it's built at most once, regardless
  // of which truncation source fires.
  let cachedSummary: GaqlSummary | null | undefined;
  const getSummary = () => {
    if (cachedSummary === undefined) {
      cachedSummary = buildGaqlSummary(fetched, selectFields, query);
    }
    return cachedSummary;
  };

  const buildResponse = (rowsOut: any[], byteTruncated: boolean): GaqlReport => {
    const truncated = rowTruncated || byteTruncated;
    const reason: GaqlReport["truncationReason"] = byteTruncated
      ? "byte_budget"
      : rowTruncated
      ? "row_limit"
      : null;
    const summary = truncated ? getSummary() : null;
    const hint = truncated
      ? buildContinuationHint(query, rowsOut.length, effectiveLimit, {
          rowTruncated,
          byteTruncated,
        })
      : null;
    return {
      rowCount: rowsOut.length,
      requestedLimit: effectiveLimit,
      fetchedRowCount: fetched.length,
      truncated,
      truncationReason: reason,
      ...(summary ? { summary } : {}),
      ...(hint ? { continuationHint: hint } : {}),
      rows: rowsOut,
    };
  };

  let response = buildResponse(rows, false);
  let size = Buffer.byteLength(JSON.stringify(response));

  // Shrink rows geometrically until the response fits the byte budget. Summary
  // remains intact so callers keep decision-grade aggregates even when the raw
  // row set had to be trimmed.
  while (size > GAQL_BYTE_BUDGET && rows.length > 1) {
    rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)));
    response = buildResponse(rows, true);
    size = Buffer.byteLength(JSON.stringify(response));
  }

  return response;
}

function validateSegmentsInWhereAreSelected(query: string) {
  const selectMatch = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i);
  const whereMatch = query.match(/\sWHERE\s+([\s\S]*?)(?:\sORDER\s+BY\s|\sLIMIT\s|\sPARAMETERS\s|$)/i);
  if (!selectMatch || !whereMatch) return;

  const selected = new Set(
    selectMatch[1]
      .split(",")
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean),
  );
  const missing = new Set<string>();
  const segmentRegex = /\bsegments\.[a-z_]+\b/gi;
  for (const match of whereMatch[1].matchAll(segmentRegex)) {
    const field = match[0].toLowerCase();
    if (SEGMENT_WHERE_SELECT_EXEMPTIONS.has(field)) continue;
    if (!selected.has(field)) missing.add(field);
  }

  if (missing.size > 0) {
    const fields = [...missing].sort();
    throw new Error(
      `GAQL segment filter must also be selected: ${fields.join(", ")}. ` +
      `Add ${fields.join(", ")} to the SELECT clause or remove it from WHERE.`,
    );
  }
}

function applyRemovedParentFilters(query: string): string {
  const resource = extractFromResource(query);
  if (!resource) return query;

  const filters: string[] = [];
  if (
    CAMPAIGN_SCOPED_RESOURCES.has(resource) &&
    !/\bcampaign\.status\s*(?:=|!=|\bIN\b|\bNOT\s+IN\b)/i.test(query)
  ) {
    filters.push("campaign.status != 'REMOVED'");
  }
  if (
    AD_GROUP_SCOPED_RESOURCES.has(resource) &&
    !/\bad_group\.status\s*(?:=|!=|\bIN\b|\bNOT\s+IN\b)/i.test(query)
  ) {
    filters.push("ad_group.status != 'REMOVED'");
  }
  if (filters.length === 0) return query;

  const insertionPoint = findTrailingClauseIndex(query);
  const head = query.slice(0, insertionPoint).trimEnd();
  const tail = query.slice(insertionPoint);
  const connector = /\sWHERE\s/i.test(head) ? " AND " : " WHERE ";
  return `${head}${connector}${filters.join(" AND ")}${tail}`;
}

function extractFromResource(query: string): string | null {
  return query.match(/\sFROM\s+([a-z_]+)/i)?.[1]?.toLowerCase() ?? null;
}

function findTrailingClauseIndex(query: string): number {
  const matches = [...query.matchAll(/\s(?:ORDER\s+BY|LIMIT|PARAMETERS)\s/gi)];
  return matches.length > 0 ? matches[0].index ?? query.length : query.length;
}

// ─── Resource Metadata (Field Discovery) ────────────────────────────

/**
 * Discover selectable, filterable, and sortable fields for a GAQL resource.
 * Uses the GoogleAdsFieldService API — avoids hardcoded field lists.
 */
export async function getResourceMetadata(auth: AuthContext, resourceName: string) {
  const customer = getCustomer(auth) as any;
  const fieldService = customer.googleAdsFields as {
    searchGoogleAdsFields: (req: { query: string }) => Promise<[{ results?: any[] }]>;
  };
  const query = `SELECT name, selectable, filterable, sortable, data_type, is_repeated WHERE name LIKE '${resourceName}.%'`;

  try {
    // gRPC auto-pagination: response is the results array directly, not { results: [...] }
    const [results] = await fieldService.searchGoogleAdsFields({ query });
    const resultArray = Array.isArray(results) ? results : [];
    const fields = resultArray.map((f: any) => ({
      name: f.name,
      dataType: f.dataType ?? f.data_type,
      selectable: f.selectable ?? false,
      filterable: f.filterable ?? false,
      sortable: f.sortable ?? false,
      isRepeated: f.isRepeated ?? f.is_repeated ?? false,
    }));

    if (fields.length === 0) {
      // Fallback: try fetching the resource itself (for top-level resource info)
      const fallbackQuery = `SELECT name, selectable, filterable, sortable, data_type, is_repeated WHERE name = '${resourceName}'`;
      const [fallbackResults] = await fieldService.searchGoogleAdsFields({ query: fallbackQuery });
      const fallbackArray = Array.isArray(fallbackResults) ? fallbackResults : [];
      if (fallbackArray.length === 0) {
        throw new Error(`Resource '${resourceName}' not found. Use listQueryableResources to see available resources.`);
      }
      return {
        resource: resourceName,
        fields: [],
        note: `'${resourceName}' is a field, not a resource. Query its parent resource for fields.`,
      };
    }

    return {
      resource: resourceName,
      fieldCount: fields.length,
      fields,
    };
  } catch (error) {
    throw new Error(`Failed to get metadata for '${resourceName}': ${extractErrorMessage(error)}`);
  }
}

/**
 * List all queryable GAQL resources (e.g. campaign, ad_group, keyword_view).
 */
export async function listQueryableResources(auth: AuthContext) {
  const customer = getCustomer(auth) as any;
  const fieldService = customer.googleAdsFields as {
    searchGoogleAdsFields: (req: { query: string }) => Promise<[{ results?: any[] }]>;
  };
  const query = `SELECT name WHERE category = 'RESOURCE'`;

  try {
    // gRPC auto-pagination: response is the results array directly, not { results: [...] }
    const [results] = await fieldService.searchGoogleAdsFields({ query });
    const resultArray = Array.isArray(results) ? results : [];
    const resources = resultArray
      .map((f: any) => f.name as string)
      .filter((name: string) => !name.includes("."))
      .sort();
    return { count: resources.length, resources };
  } catch (error) {
    throw new Error(`Failed to list resources: ${extractErrorMessage(error)}`);
  }
}

// ─── Geo Target Search ─────────────────────────────────────────────

/**
 * Search for geo target constants by name (cities, counties, states, countries, etc.).
 * Uses the GeoTargetConstantService.SuggestGeoTargetConstants API for fuzzy matching.
 * Returns geo target constant IDs that can be used with updateCampaignSettings location targeting.
 */
const MAX_GEO_RESULTS = 10;

export async function searchGeoTargets(
  auth: AuthContext,
  query: string,
  countryCode?: string,
  locale?: string,
) {
  const customer = getCustomer(auth) as any;
  const geoService = customer.geoTargetConstants as {
    suggestGeoTargetConstants: (req: {
      locale?: string;
      country_code?: string;
      location_names?: { names: string[] };
    }) => Promise<any>;
  };

  try {
    const normalizedCountryCode = countryCode?.trim().toUpperCase();
    const response = await geoService.suggestGeoTargetConstants({
      locale: locale?.trim() || "en",
      ...(normalizedCountryCode && { country_code: normalizedCountryCode }),
      location_names: { names: [query.trim()] },
    });

    // Response structure: { geo_target_constant_suggestions: [...] } or array
    const suggestions = Array.isArray(response)
      ? response
      : response?.geo_target_constant_suggestions ?? response?.geoTargetConstantSuggestions ?? [];

    return {
      query,
      results: suggestions.slice(0, MAX_GEO_RESULTS).map((s: any) => {
        const gtc = s.geo_target_constant ?? s.geoTargetConstant ?? {};
        const resourceName = gtc.resource_name ?? gtc.resourceName ?? "";
        const id = resourceName.split("/").pop() ?? "";
        return {
          id,
          resourceName,
          name: gtc.name ?? null,
          canonicalName: gtc.canonical_name ?? gtc.canonicalName ?? null,
          targetType: gtc.target_type ?? gtc.targetType ?? null,
          countryCode: gtc.country_code ?? gtc.countryCode ?? null,
          reach: s.reach != null ? Number(s.reach) : null,
          searchTerm: s.search_term ?? s.searchTerm ?? null,
        };
      }).filter((r: { id: string }) => r.id !== ""),
    };
  } catch (error) {
    throw new Error(`Geo target search failed for "${query}": ${extractErrorMessage(error)}`);
  }
}

// ─── Keyword Ideas (KeywordPlanIdeaService) ───────────────────────

const COMPETITION_NAMES: Record<number, string> = {
  0: "UNSPECIFIED",
  1: "UNKNOWN",
  2: "LOW",
  3: "MEDIUM",
  4: "HIGH",
};

export async function getKeywordIdeas(
  auth: AuthContext,
  keywords: string[],
  url?: string,
  language?: string,
  geoTargetIds?: string[],
  pageSize?: number,
) {
  const customer = getCustomer(auth) as any;
  const service = customer.keywordPlanIdeas as {
    generateKeywordIdeas: (req: any) => Promise<any>;
  };

  // Build language resource name — accept bare ID or full resource name
  const langResource = language
    ? language.startsWith("languageConstants/") ? language : `languageConstants/${language}`
    : "languageConstants/1000"; // English

  // Build geo target resource names
  const geoConstants = geoTargetIds?.map((id) =>
    id.startsWith("geoTargetConstants/") ? id : `geoTargetConstants/${id}`,
  );

  // Build the seed — keyword_and_url_seed if both provided, else keyword_seed or url_seed
  const seed: Record<string, any> = {};
  if (keywords.length > 0 && url) {
    seed.keyword_and_url_seed = { keywords, url };
  } else if (keywords.length > 0) {
    seed.keyword_seed = { keywords };
  } else if (url) {
    seed.url_seed = { url };
  }

  const effectivePageSize = Math.min(pageSize ?? 20, 50);

  try {
    const response = await service.generateKeywordIdeas({
      customer_id: normalizeCustomerId(auth.customerId),
      language: langResource,
      ...(geoConstants && { geo_target_constants: geoConstants }),
      page_size: effectivePageSize,
      keyword_plan_network: 2, // GOOGLE_SEARCH
      ...seed,
    });

    const results = response?.results ?? [];

    return {
      keywords: results.map((r: any) => {
        const m = r.keyword_idea_metrics ?? r.keywordIdeaMetrics ?? {};
        return {
          keyword: r.text ?? null,
          avgMonthlySearches: m.avg_monthly_searches ?? m.avgMonthlySearches ?? null,
          competition: COMPETITION_NAMES[m.competition ?? 0] ?? "UNKNOWN",
          competitionIndex: m.competition_index ?? m.competitionIndex ?? null,
          averageCpc: micros(m.average_cpc_micros ?? m.averageCpcMicros),
          lowTopOfPageBid: micros(m.low_top_of_page_bid_micros ?? m.lowTopOfPageBidMicros),
          highTopOfPageBid: micros(m.high_top_of_page_bid_micros ?? m.highTopOfPageBidMicros),
        };
      }),
      totalSize: response?.total_size ?? response?.totalSize ?? results.length,
    };
  } catch (error) {
    throw new Error(`Keyword ideas failed: ${extractErrorMessage(error)}`);
  }
}
