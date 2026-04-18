import { getCachedCustomer, MATCH_TYPE_NAME } from "./client";
import { getDateRange, micros } from "./helpers";
import type { AuthContext } from "./types";

// ─── Types ───────────────────────────────────────────────────────────

type ISMatrix = "healthy" | "relevance_problem" | "capital_problem" | "structural_problem";

interface DeviceMetrics {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  cpa: number | null;
  ctr: number;
  conversionRate: number;
}

interface AuditCampaign {
  id: string;
  name: string;
  type: string;
  status: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  allConversions: number;
  clicks: number;
  impressions: number;
  cpa: number | null;
  ctr: number;
  conversionRate: number;
  roas: number | null;
  dailyBudget: number | null;
  impressionShare: number | null;
  budgetLostIS: number | null;
  rankLostIS: number | null;
  isMatrix: ISMatrix;
  biddingStrategy: number;
  targetCpa: number | null;
  searchPartners: boolean;
  displayNetwork: boolean;
  geoTargetType: number | null;
  weightedQS: number | null;
  lowQSSpendPct: number;
  negativeKeywordCount: number;
  adGroups: { id: string; name: string; spend: number; conversions: number }[];
  topAds: {
    adGroupName: string;
    headlineCount: number;
    descriptionCount: number;
    adStrength: number | null;
    finalUrl: string | null;
    spend: number;
    conversions: number;
  }[];
  topKeywords: {
    text: string;
    matchType: string;
    qualityScore: number | null;
    spend: number;
    conversions: number;
    clicks: number;
    cpa: number | null;
  }[];
  deviceBreakdown: Record<string, DeviceMetrics>;
  searchPartnersMetrics: { spend: number; clicks: number; conversions: number } | null;
}

interface WastedItem {
  text: string;
  matchType?: string;
  campaignName: string;
  adGroupName?: string;
  spend: number;
  clicks: number;
  qualityScore?: number | null;
}

interface SearchTermItem {
  term: string;
  campaignName: string;
  adGroupName?: string;
  spend: number;
  clicks: number;
  conversions: number;
}

interface BrandLeakage {
  detected: boolean;
  businessName: string;
  variants: string[];
  totalSpend: number;
  terms: FindingList<SearchTermItem>;
}

/** Self-describing envelope for a finding list. `total` is the underlying
 *  population size (before `shown` was sliced out); `totalSpend` is the sum of
 *  the spend-impact metric across the *full* population so callers can act on
 *  totals even when only a preview is returned. For full drill-down, use
 *  `runGaqlQuery` with a focused filter. */
export interface FindingList<T> {
  shown: number;
  total: number;
  totalSpend: number;
  items: T[];
}

/** Per-list preview limits. Audit always returns a compact summary; callers
 *  that need the full population should use `runGaqlQuery` with filters. */
const PREVIEW_LIMITS = {
  wastedKeywords: 10,
  wastedSearchTerms: 10,
  brandTerms: 10,
  miningOpportunities: 10,
  negativeConflicts: 10,
  landingPages: 15,
  budgetConstrainedWinners: 5,
} as const;

export function toFindingList<T>(
  all: T[],
  limit: number,
  getSpend: (item: T) => number,
): FindingList<T> {
  let totalSpend = 0;
  for (const item of all) totalSpend += getSpend(item) || 0;
  const items = limit >= all.length ? all : all.slice(0, limit);
  return { shown: items.length, total: all.length, totalSpend, items };
}

interface ConversionActionSummary {
  name: string;
  type: number;
  countingType: number;
  includeInConversions: boolean;
  primaryForGoal: boolean;
  defaultValue: number | null;
}

interface LandingPage {
  url: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  conversionRate: number;
}

interface NegativeConflict {
  negativeText: string;
  negativeMatchType: string;
  campaignName: string;
  blockedTerm: string;
  blockedTermConversions: number;
  blockedTermSpend: number;
}

interface MatchTypeBreakdown {
  matchType: string;
  spend: number;
  clicks: number;
  conversions: number;
  keywordCount: number;
}

interface AssetCoverage {
  campaignName: string;
  sitelinks: number;
  callouts: number;
  structuredSnippets: number;
  images: number;
  total: number;
}

export interface AuditResult {
  account: {
    name: string;
    currency: string;
    timezone: string;
    autoTagging: boolean;
    trackingTemplate: string | null;
  };
  dateRange: { start: string; end: string; days: number };
  summary: {
    totalSpend: number;
    totalConversions: number;
    totalConversionValue: number;
    totalClicks: number;
    totalImpressions: number;
    cpa: number | null;
    ctr: number;
    conversionRate: number;
    roas: number | null;
    activeCampaigns: number;
  };
  pulse: {
    wasteRate: number;
    wasteUsd: number;
    demandCaptured: number;
    cpa: number | null;
  };
  campaigns: AuditCampaign[];
  findings: {
    wastedKeywords: FindingList<WastedItem>;
    wastedSearchTerms: FindingList<SearchTermItem>;
    brandLeakage: BrandLeakage;
    miningOpportunities: FindingList<SearchTermItem>;
    budgetConstrainedWinners: FindingList<{
      campaignName: string;
      budgetLostIS: number;
      cpa: number;
      dailyBudget: number | null;
      spend: number;
    }>;
    negativeConflicts: FindingList<NegativeConflict>;
    hasAudienceSegments: boolean;
    conversionActions: ConversionActionSummary[];
    matchTypeDistribution: MatchTypeBreakdown[];
    assetCoverage: AssetCoverage[];
    landingPages: FindingList<LandingPage>;
  };
  errors?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

function classifyIS(budgetLost: number | null, rankLost: number | null): ISMatrix {
  const bl = budgetLost ?? 0;
  const rl = rankLost ?? 0;
  if (bl < 0.15 && rl < 0.20) return "healthy";
  if (bl < 0.15 && rl >= 0.20) return "relevance_problem";
  if (bl >= 0.15 && rl < 0.20) return "capital_problem";
  return "structural_problem";
}

function generateBrandVariants(businessName: string): string[] {
  const name = businessName.toLowerCase().trim();
  if (!name) return [];

  const variants = new Set<string>();
  variants.add(name);

  // Remove common suffixes
  for (const suffix of [" llc", " inc", " ltd", " corp"]) {
    if (name.endsWith(suffix)) variants.add(name.slice(0, -suffix.length).trim());
  }

  // Split camelCase: "PawsVIP" → "paws vip"
  const camelSplit = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  if (camelSplit !== name) variants.add(camelSplit);

  // Remove spaces: "paws vip" → "pawsvip"
  const noSpaces = name.replace(/\s+/g, "");
  if (noSpaces !== name) variants.add(noSpaces);

  const camelNoSpaces = camelSplit.replace(/\s+/g, "");
  if (camelNoSpaces !== name) variants.add(camelNoSpaces);

  // Filter out short variants (< 4 chars) to avoid false positives
  return Array.from(variants).filter((v) => v.length >= 4);
}

function isBrandTerm(term: string, variants: string[]): boolean {
  const lower = term.toLowerCase();
  return variants.some((v) => lower.includes(v));
}

/** Check if a search term would be blocked by a negative keyword */
function negativeBlocks(termLower: string, negText: string, negMatchType: number): boolean {
  const neg = negText.toLowerCase();
  // Exact match (2): blocks only that exact query
  if (negMatchType === 2) return termLower === neg;
  // Phrase match (3): blocks queries containing the exact phrase
  if (negMatchType === 3) return termLower.includes(neg);
  // Broad match (4): blocks queries containing all words (any order)
  const negWords = neg.split(/\s+/);
  return negWords.every((w) => termLower.includes(w));
}

// Device enum → human name
const DEVICE_NAME: Record<number, string> = {
  2: "MOBILE",
  3: "TABLET",
  4: "DESKTOP",
  6: "CONNECTED_TV",
};

// Asset field type → category
const ASSET_CATEGORY: Record<number, string> = {
  2: "sitelinks",    // HEADLINE → used for sitelinks
  3: "sitelinks",    // SITELINK
  7: "callouts",     // CALLOUT
  8: "structuredSnippets", // STRUCTURED_SNIPPET
  20: "images",      // IMAGE (various sub-types)
};

// ─── Main Audit Function ────────────────────────────────────────────

export async function runAudit(
  auth: AuthContext,
  days = 30,
): Promise<AuditResult> {
  const customer = getCachedCustomer(auth);
  const boundedDays = Math.min(Math.max(days, 1), 90); // IS capped at 90
  const { start, end } = getDateRange(boundedDays);
  const errors: string[] = [];

  // ── All queries in parallel ────────────────────────────────────────
  const results = await Promise.allSettled([
    // 0. Account info + settings
    customer.query(`
      SELECT
        customer.id, customer.descriptive_name, customer.currency_code,
        customer.time_zone, customer.auto_tagging_enabled,
        customer.tracking_url_template
      FROM customer LIMIT 1
    `),

    // 1. All campaigns with IS, budget, network settings, bid strategy, values
    customer.query(`
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type, campaign.bidding_strategy_type,
        campaign.target_cpa.target_cpa_micros,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_content_network,
        campaign.geo_target_type_setting.positive_geo_target_type,
        campaign_budget.amount_micros,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value, metrics.all_conversions,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
    `),

    // 2. Geo targeting criteria
    customer.query(`
      SELECT
        campaign.id, campaign.name,
        campaign_criterion.type, campaign_criterion.negative,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.proximity.radius,
        campaign_criterion.proximity.radius_units
      FROM campaign_criterion
      WHERE campaign.status = 'ENABLED'
        AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY')
    `),

    // 3. Top keywords by spend (with metrics)
    customer.query(`
      SELECT
        campaign.id, campaign.name,
        ad_group.id, ad_group.name,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        metrics.impressions, metrics.clicks, metrics.ctr,
        metrics.cost_micros, metrics.average_cpc, metrics.conversions
      FROM keyword_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 2000
    `),

    // 4. Quality scores for all active keywords (lookup table)
    customer.query(`
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score,
        ad_group_criterion.quality_info.search_predicted_ctr
      FROM ad_group_criterion
      WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.status != 'REMOVED'
    `),

    // 5. Top search terms by spend
    customer.query(`
      SELECT
        campaign.id, campaign.name, ad_group.name,
        search_term_view.search_term, search_term_view.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM search_term_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 2000
    `),

    // 6. Converting search terms (mining)
    customer.query(`
      SELECT
        campaign.name, ad_group.name,
        search_term_view.search_term,
        metrics.conversions, metrics.cost_micros, metrics.clicks
      FROM search_term_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
        AND metrics.conversions > 0
      ORDER BY metrics.conversions DESC
      LIMIT 500
    `),

    // 7. Zero-conversion keywords (waste)
    customer.query(`
      SELECT
        campaign.name, ad_group.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.criterion_id,
        metrics.clicks, metrics.cost_micros
      FROM keyword_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
        AND metrics.conversions = 0
      ORDER BY metrics.cost_micros DESC
      LIMIT 500
    `),

    // 8. Ad copy + strength
    customer.query(`
      SELECT
        campaign.id, ad_group.name,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad_strength, ad_group_ad.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE campaign.status = 'ENABLED'
        AND ad_group_ad.status != 'REMOVED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 1000
    `),

    // 9. Ad groups
    customer.query(`
      SELECT
        campaign.id,
        ad_group.id, ad_group.name, ad_group.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM ad_group
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 1000
    `),

    // 10. Conversion actions
    customer.query(`
      SELECT
        conversion_action.name, conversion_action.type,
        conversion_action.status, conversion_action.counting_type,
        conversion_action.include_in_conversions_metric,
        conversion_action.primary_for_goal,
        conversion_action.value_settings.default_value
      FROM conversion_action
      WHERE conversion_action.status != 'REMOVED'
      ORDER BY conversion_action.name ASC
    `),

    // 11. Audience segments (existence check)
    customer.query(`
      SELECT campaign.id, ad_group.id, ad_group_criterion.type
      FROM ad_group_criterion
      WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.type IN ('USER_LIST', 'CUSTOM_AUDIENCE', 'COMBINED_AUDIENCE')
      LIMIT 1
    `),

    // 12. Device performance segmentation
    customer.query(`
      SELECT
        campaign.id, segments.device,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
    `),

    // 13. Negative keywords per campaign
    customer.query(`
      SELECT
        campaign.id, campaign.name,
        campaign_criterion.keyword.text,
        campaign_criterion.keyword.match_type
      FROM campaign_criterion
      WHERE campaign.status = 'ENABLED'
        AND campaign_criterion.type = 'KEYWORD'
        AND campaign_criterion.negative = TRUE
    `),

    // 14. Network type segmentation (Search vs Search Partners)
    customer.query(`
      SELECT
        campaign.id, segments.ad_network_type,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date BETWEEN '${start}' AND '${end}'
    `),

    // 15. Campaign assets / extensions
    customer.query(`
      SELECT
        campaign.id, campaign.name,
        campaign_asset.field_type
      FROM campaign_asset
      WHERE campaign.status = 'ENABLED'
    `),

    // 16. Landing page performance
    customer.query(`
      SELECT
        landing_page_view.unexpanded_final_url,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM landing_page_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 200
    `),
  ]);

  // ── Extract results with graceful degradation ─────────────────────

  function unwrap(result: PromiseSettledResult<unknown>, label: string): any[] | null {
    if (result.status === "fulfilled") return result.value as any[];
    errors.push(`${label}: ${(result.reason as any)?.message ?? result.reason ?? "Unknown error"}`);
    return null;
  }

  const accountRows = unwrap(results[0], "account");
  const campaignRows = unwrap(results[1], "campaigns");
  const _geoRows = unwrap(results[2], "geo_targeting"); // consumed by campaign settings
  const keywordRows = unwrap(results[3], "keywords");
  const qsRows = unwrap(results[4], "quality_scores");
  const searchTermRows = unwrap(results[5], "search_terms");
  const convertingRows = unwrap(results[6], "converting_terms");
  const zeroConvRows = unwrap(results[7], "zero_conv_keywords");
  const adRows = unwrap(results[8], "ads");
  const adGroupRows = unwrap(results[9], "ad_groups");
  const conversionRows = unwrap(results[10], "conversions");
  const audienceRows = unwrap(results[11], "audiences");
  const deviceRows = unwrap(results[12], "device_performance");
  const negativeRows = unwrap(results[13], "negative_keywords");
  const networkRows = unwrap(results[14], "network_segmentation");
  const assetRows = unwrap(results[15], "campaign_assets");
  const landingPageRows = unwrap(results[16], "landing_pages");

  // ── Account info ──────────────────────────────────────────────────

  const acct = (accountRows ?? [])[0]?.customer ?? {};
  const businessName = acct.descriptive_name ?? "Unknown";
  const brandVariants = generateBrandVariants(businessName);

  // ── Build QS lookup ───────────────────────────────────────────────

  const qsMap = new Map<string, {
    qualityScore: number | null;
    creativeQuality: number | null;
    postClickQuality: number | null;
    predictedCtr: number | null;
  }>();
  for (const row of qsRows ?? []) {
    const qi = row.ad_group_criterion?.quality_info;
    qsMap.set(String(row.ad_group_criterion?.criterion_id), {
      qualityScore: qi?.quality_score ?? null,
      creativeQuality: qi?.creative_quality_score ?? null,
      postClickQuality: qi?.post_click_quality_score ?? null,
      predictedCtr: qi?.search_predicted_ctr ?? null,
    });
  }

  // ── Build negative keyword lookup per campaign ────────────────────

  const negativesByCampaign = new Map<string, { text: string; matchType: number }[]>();
  for (const row of negativeRows ?? []) {
    const campId = String(row.campaign?.id);
    if (!negativesByCampaign.has(campId)) negativesByCampaign.set(campId, []);
    negativesByCampaign.get(campId)!.push({
      text: row.campaign_criterion?.keyword?.text ?? "",
      matchType: row.campaign_criterion?.keyword?.match_type ?? 4,
    });
  }

  // ── Build campaign-level data ─────────────────────────────────────

  const campaignMap = new Map<string, AuditCampaign>();
  let totalSpend = 0;
  let totalConversions = 0;
  let totalConversionValue = 0;
  let totalClicks = 0;
  let totalImpressions = 0;

  for (const row of campaignRows ?? []) {
    const c = row.campaign ?? {};
    const m = row.metrics ?? {};
    const id = String(c.id);
    const spend = micros(m.cost_micros);
    const conv = m.conversions ?? 0;
    const convValue = m.conversions_value ?? 0;
    const allConv = m.all_conversions ?? 0;
    const clicks = m.clicks ?? 0;
    const impr = m.impressions ?? 0;

    totalSpend += spend;
    totalConversions += conv;
    totalConversionValue += convValue;
    totalClicks += clicks;
    totalImpressions += impr;

    const budgetLost = m.search_budget_lost_impression_share ?? null;
    const rankLost = m.search_rank_lost_impression_share ?? null;
    const negs = negativesByCampaign.get(id) ?? [];

    campaignMap.set(id, {
      id,
      name: c.name ?? "Untitled",
      type: c.advertising_channel_type ?? "UNKNOWN",
      status: c.status ?? 0,
      spend,
      conversions: conv,
      conversionValue: convValue,
      allConversions: allConv,
      clicks,
      impressions: impr,
      cpa: conv > 0 ? spend / conv : null,
      ctr: impr > 0 ? clicks / impr : 0,
      conversionRate: clicks > 0 ? conv / clicks : 0,
      roas: spend > 0 && convValue > 0 ? convValue / spend : null,
      dailyBudget: row.campaign_budget?.amount_micros
        ? micros(row.campaign_budget.amount_micros)
        : null,
      impressionShare: m.search_impression_share ?? null,
      budgetLostIS: budgetLost,
      rankLostIS: rankLost,
      isMatrix: classifyIS(budgetLost, rankLost),
      biddingStrategy: c.bidding_strategy_type ?? 0,
      targetCpa: c.target_cpa?.target_cpa_micros
        ? micros(c.target_cpa.target_cpa_micros)
        : null,
      searchPartners: c.network_settings?.target_search_network ?? false,
      displayNetwork: c.network_settings?.target_content_network ?? false,
      geoTargetType: c.geo_target_type_setting?.positive_geo_target_type ?? null,
      weightedQS: null,
      lowQSSpendPct: 0,
      negativeKeywordCount: negs.length,
      adGroups: [],
      topAds: [],
      topKeywords: [],
      deviceBreakdown: {},
      searchPartnersMetrics: null,
    });
  }

  // ── Attach ad groups ──────────────────────────────────────────────

  for (const row of adGroupRows ?? []) {
    const camp = campaignMap.get(String(row.campaign?.id));
    if (!camp) continue;
    camp.adGroups.push({
      id: String(row.ad_group?.id ?? ""),
      name: row.ad_group?.name ?? "Untitled",
      spend: micros(row.metrics?.cost_micros),
      conversions: row.metrics?.conversions ?? 0,
    });
  }

  // ── Attach ads ────────────────────────────────────────────────────

  for (const row of adRows ?? []) {
    const camp = campaignMap.get(String(row.campaign?.id));
    if (!camp) continue;
    const rsa = row.ad_group_ad?.ad?.responsive_search_ad ?? {};
    camp.topAds.push({
      adGroupName: row.ad_group?.name ?? "",
      headlineCount: (rsa.headlines ?? []).length,
      descriptionCount: (rsa.descriptions ?? []).length,
      adStrength: row.ad_group_ad?.ad_strength ?? null,
      finalUrl: (row.ad_group_ad?.ad?.final_urls ?? [])[0] ?? null,
      spend: micros(row.metrics?.cost_micros),
      conversions: row.metrics?.conversions ?? 0,
    });
  }

  // ── Device breakdown per campaign ─────────────────────────────────

  for (const row of deviceRows ?? []) {
    const camp = campaignMap.get(String(row.campaign?.id));
    if (!camp) continue;
    const device = DEVICE_NAME[row.segments?.device] ?? "OTHER";
    const spend = micros(row.metrics?.cost_micros);
    const clicks = row.metrics?.clicks ?? 0;
    const impr = row.metrics?.impressions ?? 0;
    const conv = row.metrics?.conversions ?? 0;
    camp.deviceBreakdown[device] = {
      spend,
      clicks,
      impressions: impr,
      conversions: conv,
      cpa: conv > 0 ? spend / conv : null,
      ctr: impr > 0 ? clicks / impr : 0,
      conversionRate: clicks > 0 ? conv / clicks : 0,
    };
  }

  // ── Search Partners performance per campaign ──────────────────────

  // ad_network_type: 2 = SEARCH, 3 = SEARCH_PARTNERS, 6 = YOUTUBE, 10 = DISPLAY
  for (const row of networkRows ?? []) {
    const camp = campaignMap.get(String(row.campaign?.id));
    if (!camp) continue;
    if (row.segments?.ad_network_type === 3) {
      camp.searchPartnersMetrics = {
        spend: micros(row.metrics?.cost_micros),
        clicks: row.metrics?.clicks ?? 0,
        conversions: row.metrics?.conversions ?? 0,
      };
    }
  }

  // ── Compute per-campaign QS + top keywords ────────────────────────

  const kwByCampaign = new Map<string, {
    text: string; matchType: number; spend: number; clicks: number;
    conversions: number; criterionId: string;
  }[]>();

  for (const row of keywordRows ?? []) {
    const campId = String(row.campaign?.id);
    if (!kwByCampaign.has(campId)) kwByCampaign.set(campId, []);
    kwByCampaign.get(campId)!.push({
      text: row.ad_group_criterion?.keyword?.text ?? "",
      matchType: row.ad_group_criterion?.keyword?.match_type ?? 0,
      spend: micros(row.metrics?.cost_micros),
      clicks: row.metrics?.clicks ?? 0,
      conversions: row.metrics?.conversions ?? 0,
      criterionId: String(row.ad_group_criterion?.criterion_id),
    });
  }

  for (const [campId, kws] of Array.from(kwByCampaign.entries())) {
    const camp = campaignMap.get(campId);
    if (!camp) continue;

    // QS computation
    const withQS = kws
      .map((k) => ({ ...k, qs: qsMap.get(k.criterionId)?.qualityScore ?? null }))
      .filter((k) => k.qs != null && k.qs > 0);

    if (withQS.length > 0) {
      const totalQSSpend = withQS.reduce((s, k) => s + k.spend, 0);
      camp.weightedQS = totalQSSpend > 0
        ? withQS.reduce((s, k) => s + k.qs! * k.spend, 0) / totalQSSpend
        : null;
      const lowQSSpend = withQS.filter((k) => k.qs! < 5).reduce((s, k) => s + k.spend, 0);
      const totalKWSpend = kws.reduce((s, k) => s + k.spend, 0);
      camp.lowQSSpendPct = totalKWSpend > 0 ? (lowQSSpend / totalKWSpend) * 100 : 0;
    }

    // Top 10 keywords per campaign
    camp.topKeywords = kws
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)
      .map((k) => ({
        text: k.text,
        matchType: (typeof k.matchType === "number" ? MATCH_TYPE_NAME[k.matchType] : k.matchType) ?? "UNKNOWN",
        qualityScore: qsMap.get(k.criterionId)?.qualityScore ?? null,
        spend: k.spend,
        conversions: k.conversions,
        clicks: k.clicks,
        cpa: k.conversions > 0 ? k.spend / k.conversions : null,
      }));
  }

  // ── Match type distribution ───────────────────────────────────────

  const matchTypeMap = new Map<string, { spend: number; clicks: number; conversions: number; count: number }>();
  for (const row of keywordRows ?? []) {
    const rawMT = row.ad_group_criterion?.keyword?.match_type;
    const mt = (typeof rawMT === "number" ? MATCH_TYPE_NAME[rawMT] : rawMT) ?? "UNKNOWN";
    const existing = matchTypeMap.get(mt) ?? { spend: 0, clicks: 0, conversions: 0, count: 0 };
    existing.spend += micros(row.metrics?.cost_micros);
    existing.clicks += row.metrics?.clicks ?? 0;
    existing.conversions += row.metrics?.conversions ?? 0;
    existing.count++;
    matchTypeMap.set(mt, existing);
  }
  const matchTypeDistribution: MatchTypeBreakdown[] = Array.from(matchTypeMap.entries())
    .map(([mt, data]) => ({
      matchType: mt,
      spend: data.spend,
      clicks: data.clicks,
      conversions: data.conversions,
      keywordCount: data.count,
    }))
    .sort((a, b) => b.spend - a.spend);

  // ── Asset / extension coverage ────────────────────────────────────

  const assetsByCampaign = new Map<string, { sitelinks: number; callouts: number; structuredSnippets: number; images: number }>();
  for (const row of assetRows ?? []) {
    const campId = String(row.campaign?.id);
    if (!assetsByCampaign.has(campId)) {
      assetsByCampaign.set(campId, { sitelinks: 0, callouts: 0, structuredSnippets: 0, images: 0 });
    }
    const a = assetsByCampaign.get(campId)!;
    const fieldType = row.campaign_asset?.field_type;
    // field_type: 2=HEADLINE, 3=DESCRIPTION, 5=SITELINK, 7=CALLOUT,
    // 8=STRUCTURED_SNIPPET, 16=LOGO, 20=LANDSCAPE_LOGO, 19=SQUARE_MARKETING_IMAGE
    if (fieldType === 5) a.sitelinks++;
    else if (fieldType === 7) a.callouts++;
    else if (fieldType === 8) a.structuredSnippets++;
    else if (fieldType >= 16 && fieldType <= 25) a.images++; // Various image types
  }

  const assetCoverage: AssetCoverage[] = [];
  for (const [campId, assets] of Array.from(assetsByCampaign.entries())) {
    const camp = campaignMap.get(campId);
    if (!camp) continue;
    assetCoverage.push({
      campaignName: camp.name,
      ...assets,
      total: assets.sitelinks + assets.callouts + assets.structuredSnippets + assets.images,
    });
  }

  // ── Landing pages ─────────────────────────────────────────────────

  const landingPages: LandingPage[] = (landingPageRows ?? []).map((row: any) => {
    const spend = micros(row.metrics?.cost_micros);
    const clicks = row.metrics?.clicks ?? 0;
    const conv = row.metrics?.conversions ?? 0;
    return {
      url: row.landing_page_view?.unexpanded_final_url ?? "",
      spend,
      clicks,
      conversions: conv,
      cpa: conv > 0 ? spend / conv : null,
      conversionRate: clicks > 0 ? conv / clicks : 0,
    };
  });

  // ── Compute waste ─────────────────────────────────────────────────

  const accountCPA = totalConversions > 0 ? totalSpend / totalConversions : null;
  const wasteThreshold = accountCPA != null ? accountCPA * 2 : Infinity;

  const wastedKeywords: WastedItem[] = [];
  for (const row of zeroConvRows ?? []) {
    const spend = micros(row.metrics?.cost_micros);
    if (spend <= wasteThreshold) continue;
    const criterionId = String(row.ad_group_criterion?.criterion_id);
    const rawMatchType = row.ad_group_criterion?.keyword?.match_type;
    wastedKeywords.push({
      text: row.ad_group_criterion?.keyword?.text ?? "",
      matchType: (typeof rawMatchType === "number" ? MATCH_TYPE_NAME[rawMatchType] : rawMatchType) ?? "UNKNOWN",
      campaignName: row.campaign?.name ?? "",
      adGroupName: row.ad_group?.name ?? "",
      spend,
      clicks: row.metrics?.clicks ?? 0,
      qualityScore: qsMap.get(criterionId)?.qualityScore ?? null,
    });
  }
  wastedKeywords.sort((a, b) => b.spend - a.spend);
  const keywordWaste = wastedKeywords.reduce((s, k) => s + k.spend, 0);

  const wastedSearchTerms: SearchTermItem[] = [];
  let searchTermWaste = 0;
  for (const row of searchTermRows ?? []) {
    const conv = row.metrics?.conversions ?? 0;
    const clicks = row.metrics?.clicks ?? 0;
    if (conv > 0 || clicks < 10) continue;
    const spend = micros(row.metrics?.cost_micros);
    searchTermWaste += spend;
    wastedSearchTerms.push({
      term: row.search_term_view?.search_term ?? "",
      campaignName: row.campaign?.name ?? "",
      adGroupName: row.ad_group?.name ?? "",
      spend,
      clicks,
      conversions: 0,
    });
  }
  wastedSearchTerms.sort((a, b) => b.spend - a.spend);

  const totalWaste = keywordWaste + searchTermWaste;
  const wasteRate = totalSpend > 0 ? (totalWaste / totalSpend) * 100 : 0;

  // ── Brand leakage ─────────────────────────────────────────────────

  const hasBrandCampaign = Array.from(campaignMap.values()).some(
    (c) => c.name.toLowerCase().includes("brand"),
  );

  const brandTerms: SearchTermItem[] = [];
  let brandTotalSpend = 0;
  if (brandVariants.length > 0) {
    for (const row of searchTermRows ?? []) {
      const term = row.search_term_view?.search_term ?? "";
      if (!isBrandTerm(term, brandVariants)) continue;
      const campName = row.campaign?.name ?? "";
      if (campName.toLowerCase().includes("brand")) continue;
      const spend = micros(row.metrics?.cost_micros);
      brandTotalSpend += spend;
      brandTerms.push({
        term,
        campaignName: campName,
        adGroupName: row.ad_group?.name ?? "",
        spend,
        clicks: row.metrics?.clicks ?? 0,
        conversions: row.metrics?.conversions ?? 0,
      });
    }
  }
  brandTerms.sort((a, b) => b.spend - a.spend);

  // ── Mining opportunities ──────────────────────────────────────────

  const miningOpportunities: SearchTermItem[] = [];
  for (const row of convertingRows ?? []) {
    const conv = row.metrics?.conversions ?? 0;
    if (conv < 2) continue;
    miningOpportunities.push({
      term: row.search_term_view?.search_term ?? "",
      campaignName: row.campaign?.name ?? "",
      adGroupName: row.ad_group?.name ?? "",
      spend: micros(row.metrics?.cost_micros),
      clicks: row.metrics?.clicks ?? 0,
      conversions: conv,
    });
  }

  // ── Negative keyword conflicts ────────────────────────────────────
  // Cross-reference converting search terms against negative keywords

  const negativeConflicts: NegativeConflict[] = [];
  for (const row of convertingRows ?? []) {
    const term = row.search_term_view?.search_term ?? "";
    const termLower = term.toLowerCase();
    const conv = row.metrics?.conversions ?? 0;
    if (conv < 1) continue;

    // Check all campaigns' negatives (not just the campaign the term appeared in)
    for (const [campId, negs] of Array.from(negativesByCampaign.entries())) {
      const camp = campaignMap.get(campId);
      if (!camp) continue;
      for (const neg of negs) {
        if (negativeBlocks(termLower, neg.text, neg.matchType)) {
          negativeConflicts.push({
            negativeText: neg.text,
            negativeMatchType: (typeof neg.matchType === "number" ? MATCH_TYPE_NAME[neg.matchType] : String(neg.matchType)) ?? "UNKNOWN",
            campaignName: camp.name,
            blockedTerm: term,
            blockedTermConversions: conv,
            blockedTermSpend: micros(row.metrics?.cost_micros),
          });
        }
      }
    }
  }
  negativeConflicts.sort((a, b) => b.blockedTermConversions - a.blockedTermConversions);

  // ── Budget-constrained winners ────────────────────────────────────

  const enabledCampaigns = Array.from(campaignMap.values()).filter((c) => c.status === 2);
  const budgetConstrainedWinnersAll = enabledCampaigns
    .filter((c) =>
      (c.budgetLostIS ?? 0) > 0.15 &&
      c.cpa != null &&
      (accountCPA == null || c.cpa <= accountCPA * 1.5),
    )
    .sort((a, b) => (b.budgetLostIS ?? 0) - (a.budgetLostIS ?? 0))
    .map((c) => ({
      campaignName: c.name,
      budgetLostIS: c.budgetLostIS!,
      cpa: c.cpa!,
      dailyBudget: c.dailyBudget,
      spend: c.spend,
    }));

  // ── Demand captured ───────────────────────────────────────────────

  const profitableCampaigns = enabledCampaigns.filter((c) => c.conversions > 0 && c.impressionShare != null);
  const profitableSpend = profitableCampaigns.reduce((s, c) => s + c.spend, 0);
  const demandCaptured = profitableSpend > 0
    ? profitableCampaigns.reduce((s, c) => s + (c.impressionShare ?? 0) * c.spend, 0) / profitableSpend
    : 0;

  // ── Conversion actions ────────────────────────────────────────────

  const conversionActions: ConversionActionSummary[] = (conversionRows ?? []).map((row: any) => {
    const ca = row.conversion_action ?? {};
    return {
      name: ca.name ?? "Untitled",
      type: ca.type ?? 0,
      countingType: ca.counting_type ?? 0,
      includeInConversions: ca.include_in_conversions_metric ?? true,
      primaryForGoal: ca.primary_for_goal ?? true,
      defaultValue: ca.value_settings?.default_value ?? null,
    };
  });

  // ── Assemble result ───────────────────────────────────────────────

  const campaigns = Array.from(campaignMap.values()).sort((a, b) => b.spend - a.spend);

  const result: AuditResult = {
    account: {
      name: businessName,
      currency: acct.currency_code ?? "USD",
      timezone: acct.time_zone ?? "UTC",
      autoTagging: acct.auto_tagging_enabled ?? false,
      trackingTemplate: acct.tracking_url_template ?? null,
    },
    dateRange: { start, end, days: boundedDays },
    summary: {
      totalSpend,
      totalConversions,
      totalConversionValue,
      totalClicks,
      totalImpressions,
      cpa: accountCPA,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      conversionRate: totalClicks > 0 ? totalConversions / totalClicks : 0,
      roas: totalSpend > 0 && totalConversionValue > 0 ? totalConversionValue / totalSpend : null,
      activeCampaigns: enabledCampaigns.length,
    },
    pulse: {
      wasteRate,
      wasteUsd: totalWaste,
      demandCaptured: demandCaptured * 100,
      cpa: accountCPA,
    },
    campaigns,
    findings: {
      wastedKeywords: toFindingList(
        wastedKeywords,
        PREVIEW_LIMITS.wastedKeywords,
        (k) => k.spend,
      ),
      wastedSearchTerms: toFindingList(
        wastedSearchTerms,
        PREVIEW_LIMITS.wastedSearchTerms,
        (t) => t.spend,
      ),
      brandLeakage: {
        detected: brandTerms.length > 0 || hasBrandCampaign,
        businessName,
        variants: brandVariants,
        totalSpend: brandTotalSpend,
        terms: toFindingList(
          brandTerms,
          PREVIEW_LIMITS.brandTerms,
          (t) => t.spend,
        ),
      },
      miningOpportunities: toFindingList(
        miningOpportunities,
        PREVIEW_LIMITS.miningOpportunities,
        (t) => t.spend,
      ),
      budgetConstrainedWinners: toFindingList(
        budgetConstrainedWinnersAll,
        PREVIEW_LIMITS.budgetConstrainedWinners,
        (w) => w.spend,
      ),
      negativeConflicts: toFindingList(
        negativeConflicts,
        PREVIEW_LIMITS.negativeConflicts,
        (c) => c.blockedTermSpend,
      ),
      hasAudienceSegments: (audienceRows ?? []).length > 0,
      conversionActions,
      matchTypeDistribution,
      assetCoverage,
      landingPages: toFindingList(
        landingPages,
        PREVIEW_LIMITS.landingPages,
        (p) => p.spend,
      ),
    },
  };

  if (errors.length > 0) result.errors = errors;
  return result;
}
