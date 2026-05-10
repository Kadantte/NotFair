import { getCachedCustomer, getCustomer, MATCH_TYPE_NAME } from "../client";
import { extractErrorMessage, getDateRange, micros, normalizeCustomerId, safeEntityId } from "../helpers";
import type { AuthContext } from "../types";
import { isDemoAuth } from "@/lib/demo/constants";
import {
  demoGetKeywords,
  demoGetNegativeKeywords,
  demoGetSearchTermReport,
  demoListCampaigns,
} from "@/lib/demo/reads";

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

  // Query 1: keyword_view for metrics (quality_info sub-fields aren't available here).
  // Filter ad_group_criterion.negative = FALSE because keyword_view returns BOTH
  // positives and ad-group negatives; without this, the dashboard surfaces
  // negatives as if they were targeted keywords with zero impressions.
  const metricsResult = await customer.query(`
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.negative,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.average_cpc, metrics.conversions
    FROM keyword_view
    WHERE campaign.id = ${id}
      AND ad_group_criterion.negative = FALSE
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

// ─── Keyword Ideas (KeywordPlanIdeaService) ───────────────────────

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

    // google-ads-api unwraps the gax tuple to its first element — the
    // auto-paginated IGenerateKeywordIdeaResult[] itself, not a wrapper object.
    // Slice since gax merges all pages and ignores per-call page_size.
    const all: any[] = Array.isArray(response) ? response : (response?.results ?? []);
    const results = all.slice(0, effectivePageSize);

    return {
      keywords: results.map((r: any) => {
        const m = r.keyword_idea_metrics ?? r.keywordIdeaMetrics ?? {};
        const comp = m.competition ?? "UNSPECIFIED";
        return {
          keyword: r.text ?? null,
          avgMonthlySearches: m.avg_monthly_searches ?? m.avgMonthlySearches ?? null,
          competition: typeof comp === "string" ? comp : "UNKNOWN",
          competitionIndex: m.competition_index ?? m.competitionIndex ?? null,
          averageCpc: micros(m.average_cpc_micros ?? m.averageCpcMicros),
          lowTopOfPageBid: micros(m.low_top_of_page_bid_micros ?? m.lowTopOfPageBidMicros),
          highTopOfPageBid: micros(m.high_top_of_page_bid_micros ?? m.highTopOfPageBidMicros),
        };
      }),
      totalSize: all.length,
    };
  } catch (error) {
    throw new Error(`Keyword ideas failed: ${extractErrorMessage(error)}`);
  }
}
