import { getCachedCustomer } from "../client";
import { formatDate, getDateRange, micros, safeEntityId } from "../helpers";
import type { AuthContext } from "../types";
import { isDemoAuth } from "@/lib/demo/constants";
import {
  demoGetCampaignPerformance,
  demoGetCampaignSettings,
  demoGetImpressionShare,
  demoListCampaigns,
} from "@/lib/demo/reads";

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
      customer.currency_code,
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
    currencyCode: row.customer?.currency_code ?? null,
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
  const gts = c.geo_target_type_setting ?? {};
  // API v22 numeric → string for positive and negative geo target types
  const POSITIVE_GEO_REVERSE: Record<number, string> = { 5: "PRESENCE_OR_INTEREST", 7: "PRESENCE" };
  const NEGATIVE_GEO_REVERSE: Record<number, string> = { 4: "PRESENCE_OR_INTEREST", 5: "PRESENCE" };

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
    positiveGeoTargetType: gts.positive_geo_target_type != null ? (POSITIVE_GEO_REVERSE[gts.positive_geo_target_type] ?? null) : null,
    negativeGeoTargetType: gts.negative_geo_target_type != null ? (NEGATIVE_GEO_REVERSE[gts.negative_geo_target_type] ?? null) : null,
    locationTargeting: locations,
    proximityTargeting: proximityTargets.length > 0 ? proximityTargets : null,
    adSchedule: adSchedule.length > 0 ? adSchedule : null,
  };
}
