import { getCachedCustomer, getClient, getCustomer, MATCH_TYPE_NAME } from "./client";
import { extractErrorMessage, formatDate, getDateRange, micros, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

// ─── Read Functions ──────────────────────────────────────────────────

export async function getAccountInfo(auth: AuthContext) {
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
      metrics.conversions
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
  }));
}

type PerfTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
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
      conversionValue: acc.conversionValue + row.conversionValue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
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
      metrics.conversions, metrics.conversions_value,
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

  // Query 2: ad_group_criterion for full quality_info (no date range needed)
  const qualityResult = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr
    FROM ad_group_criterion
    WHERE campaign.id = ${id}
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
  `);

  // Index quality data by criterion ID for fast lookup
  const qualityMap = new Map<string, any>();
  for (const row of qualityResult as any[]) {
    qualityMap.set(String(row.ad_group_criterion.criterion_id), row.ad_group_criterion.quality_info);
  }

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    keywords: (metricsResult as any[]).map((row) => {
      const rawMatchType = row.ad_group_criterion?.keyword?.match_type;
      const criterionId = String(row.ad_group_criterion.criterion_id);
      const quality = qualityMap.get(criterionId);
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

export async function getSearchTermReport(
  auth: AuthContext,
  campaignId: string,
  days = 30,
  limit = 50,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
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
    searchTerms: (result as any[]).map((row) => ({
      searchTerm: row.search_term_view.search_term ?? "",
      status: row.search_term_view.status ?? "UNKNOWN",
      campaignName: row.campaign?.name ?? "Unknown",
      adGroupName: row.ad_group?.name ?? "Unknown",
      impressions: row.metrics.impressions ?? 0,
      clicks: row.metrics.clicks ?? 0,
      ctr: row.metrics.ctr ?? 0,
      cost: micros(row.metrics.cost_micros),
      conversions: row.metrics.conversions ?? 0,
    })),
  };
}

export async function getNegativeKeywords(
  auth: AuthContext,
  campaignId: string,
  limit = 100,
) {
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

export async function runSafeGaqlReport(auth: AuthContext, rawQuery: string) {
  const query = rawQuery.trim();
  const normalized = query.toUpperCase();

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

  try {
    const customer = getCachedCustomer(auth);
    const rows = await customer.query(query);
    return { rowCount: rows.length, rows: rows.slice(0, 50) };
  } catch (error) {
    throw new Error(`GAQL query failed: ${extractErrorMessage(error)}`);
  }
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
