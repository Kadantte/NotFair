import { enums } from "google-ads-api";
import { getCachedCustomer } from "../client";
import { extractErrorMessage, getDateRange, micros, safeEntityId } from "../helpers";
import type { AuthContext } from "../types";
import { isDemoAuth } from "@/lib/demo/constants";
import { demoGetRecommendations } from "@/lib/demo/reads";

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
      // GAQL returns enum as numeric code; map to its name via the lib's enum.
      const typeName = typeof rec.type === "number"
        ? (enums.RecommendationType[rec.type] ?? "UNKNOWN")
        : (typeof rec.type === "string" ? rec.type : "UNKNOWN");
      return {
        type: typeName,
        campaignId: campId ?? null,
      };
    });
    return { recommendations };
  } catch (error) {
    // Recommendations API may not be available for all accounts
    return { recommendations: [], error: extractErrorMessage(error) };
  }
}
