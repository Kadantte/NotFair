import { getCachedCustomer, MATCH_TYPE_NAME } from "./client";
import { getDateRange, micros, normalizeCustomerId } from "./helpers";
import type { AuthContext } from "./types";

// ─── Types ───────────────────────────────────────────────────────────

type ISMatrix = "healthy" | "relevance_problem" | "capital_problem" | "structural_problem";

interface AuditCampaign {
  id: string;
  name: string;
  type: string;
  status: number;
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
  cpa: number | null;
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
  terms: SearchTermItem[];
}

interface ConversionActionSummary {
  name: string;
  type: number;
  countingType: number;
  includeInConversions: boolean;
  primaryForGoal: boolean;
  defaultValue: number | null;
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
    totalClicks: number;
    cpa: number | null;
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
    wastedKeywords: WastedItem[];
    wastedSearchTerms: SearchTermItem[];
    brandLeakage: BrandLeakage;
    miningOpportunities: SearchTermItem[];
    budgetConstrainedWinners: {
      campaignName: string;
      budgetLostIS: number;
      cpa: number;
      dailyBudget: number | null;
    }[];
    hasAudienceSegments: boolean;
    conversionActions: ConversionActionSummary[];
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

  // Split camelCase: "PawsVIP" → ["paws", "vip"] → "paws vip"
  const camelSplit = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  if (camelSplit !== name) variants.add(camelSplit);

  // Remove spaces: "paws vip" → "pawsvip"
  const noSpaces = name.replace(/\s+/g, "");
  if (noSpaces !== name) variants.add(noSpaces);

  // Also add spaceless version of camelSplit
  const camelNoSpaces = camelSplit.replace(/\s+/g, "");
  if (camelNoSpaces !== name) variants.add(camelNoSpaces);

  // Filter out short variants (< 4 chars) to avoid false positives
  return Array.from(variants).filter((v) => v.length >= 4);
}

function isBrandTerm(term: string, variants: string[]): boolean {
  const lower = term.toLowerCase();
  return variants.some((v) => lower.includes(v));
}

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
  const [
    accountResult,
    campaignResult,
    geoResult,
    keywordMetricsResult,
    keywordQSResult,
    searchTermResult,
    convertingTermsResult,
    zeroConvKeywordsResult,
    adResult,
    adGroupResult,
    conversionResult,
    audienceResult,
  ] = await Promise.allSettled([
    // 1. Account info + settings
    customer.query(`
      SELECT
        customer.id, customer.descriptive_name, customer.currency_code,
        customer.time_zone, customer.auto_tagging_enabled,
        customer.tracking_url_template
      FROM customer LIMIT 1
    `),

    // 2. All campaigns with IS, budget, network settings, bid strategy
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
        metrics.conversions,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
    `),

    // 3. Geo targeting criteria
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

    // 4. Top keywords by spend (with metrics)
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
      LIMIT 200
    `),

    // 5. Quality scores for all active keywords (lookup table, no metrics)
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

    // 6. Top search terms by spend
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
      LIMIT 200
    `),

    // 7. Converting search terms (for mining opportunities)
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
      LIMIT 50
    `),

    // 8. Zero-conversion keywords by spend (waste detection)
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
      LIMIT 50
    `),

    // 9. Ad copy + strength
    customer.query(`
      SELECT
        campaign.id,
        ad_group.name,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad_strength,
        ad_group_ad.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE campaign.status = 'ENABLED'
        AND ad_group_ad.status != 'REMOVED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 100
    `),

    // 10. Ad groups
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
      LIMIT 100
    `),

    // 11. Conversion actions
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

    // 12. Audience segments
    customer.query(`
      SELECT
        campaign.id, ad_group.id,
        ad_group_criterion.type
      FROM ad_group_criterion
      WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.type IN ('USER_LIST', 'CUSTOM_AUDIENCE', 'COMBINED_AUDIENCE')
      LIMIT 1
    `),
  ]);

  // ── Extract results with graceful degradation ─────────────────────

  function unwrap<T>(result: PromiseSettledResult<T>, label: string): T | null {
    if (result.status === "fulfilled") return result.value;
    errors.push(`${label}: ${result.reason?.message ?? result.reason ?? "Unknown error"}`);
    return null;
  }

  const accountRows = unwrap(accountResult, "account") as any[] | null;
  const campaignRows = unwrap(campaignResult, "campaigns") as any[] | null;
  const geoRows = unwrap(geoResult, "geo_targeting") as any[] | null;
  const keywordRows = unwrap(keywordMetricsResult, "keywords") as any[] | null;
  const qsRows = unwrap(keywordQSResult, "quality_scores") as any[] | null;
  const searchTermRows = unwrap(searchTermResult, "search_terms") as any[] | null;
  const convertingRows = unwrap(convertingTermsResult, "converting_terms") as any[] | null;
  const zeroConvRows = unwrap(zeroConvKeywordsResult, "zero_conv_keywords") as any[] | null;
  const adRows = unwrap(adResult, "ads") as any[] | null;
  const adGroupRows = unwrap(adGroupResult, "ad_groups") as any[] | null;
  const conversionRows = unwrap(conversionResult, "conversions") as any[] | null;
  const audienceRows = unwrap(audienceResult, "audiences") as any[] | null;

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

  // ── Build campaign-level data ─────────────────────────────────────

  const campaignMap = new Map<string, AuditCampaign>();
  let totalSpend = 0;
  let totalConversions = 0;
  let totalClicks = 0;
  let totalImpressions = 0;

  for (const row of campaignRows ?? []) {
    const c = row.campaign ?? {};
    const m = row.metrics ?? {};
    const id = String(c.id);
    const spend = micros(m.cost_micros);
    const conv = m.conversions ?? 0;
    const clicks = m.clicks ?? 0;
    const impr = m.impressions ?? 0;

    totalSpend += spend;
    totalConversions += conv;
    totalClicks += clicks;
    totalImpressions += impr;

    const budgetLost = m.search_budget_lost_impression_share ?? null;
    const rankLost = m.search_rank_lost_impression_share ?? null;

    campaignMap.set(id, {
      id,
      name: c.name ?? "Untitled",
      type: c.advertising_channel_type ?? "UNKNOWN",
      status: c.status ?? 0,
      spend,
      conversions: conv,
      clicks,
      impressions: impr,
      cpa: conv > 0 ? spend / conv : null,
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
      weightedQS: null, // computed below
      lowQSSpendPct: 0, // computed below
      adGroups: [],
      topAds: [],
    });
  }

  // ── Attach ad groups ──────────────────────────────────────────────

  for (const row of adGroupRows ?? []) {
    const campId = String(row.campaign?.id);
    const camp = campaignMap.get(campId);
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
    const campId = String(row.campaign?.id);
    const camp = campaignMap.get(campId);
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

  // ── Compute per-campaign QS ───────────────────────────────────────

  // Group keywords by campaign, compute spend-weighted QS
  const kwByCampaign = new Map<string, { spend: number; qs: number | null }[]>();
  for (const row of keywordRows ?? []) {
    const campId = String(row.campaign?.id);
    const criterionId = String(row.ad_group_criterion?.criterion_id);
    const qs = qsMap.get(criterionId)?.qualityScore ?? null;
    const spend = micros(row.metrics?.cost_micros);
    if (!kwByCampaign.has(campId)) kwByCampaign.set(campId, []);
    kwByCampaign.get(campId)!.push({ spend, qs });
  }

  for (const [campId, kws] of Array.from(kwByCampaign.entries())) {
    const camp = campaignMap.get(campId);
    if (!camp) continue;

    const withQS = kws.filter((k) => k.qs != null && k.qs > 0);
    if (withQS.length > 0) {
      const totalQSSpend = withQS.reduce((s, k) => s + k.spend, 0);
      camp.weightedQS = totalQSSpend > 0
        ? withQS.reduce((s, k) => s + k.qs! * k.spend, 0) / totalQSSpend
        : null;

      const lowQSSpend = withQS.filter((k) => k.qs! < 5).reduce((s, k) => s + k.spend, 0);
      const totalKWSpend = kws.reduce((s, k) => s + k.spend, 0);
      camp.lowQSSpendPct = totalKWSpend > 0 ? (lowQSSpend / totalKWSpend) * 100 : 0;
    }
  }

  // ── Compute waste ─────────────────────────────────────────────────

  const accountCPA = totalConversions > 0 ? totalSpend / totalConversions : null;
  const wasteThreshold = accountCPA != null ? accountCPA * 2 : Infinity;

  // Wasted keywords: 0 conversions AND spend > 2x CPA
  const wastedKeywords: WastedItem[] = [];
  const wastedKWCriterionIds = new Set<string>();
  for (const row of zeroConvRows ?? []) {
    const spend = micros(row.metrics?.cost_micros);
    if (spend <= wasteThreshold) continue;
    const criterionId = String(row.ad_group_criterion?.criterion_id);
    const rawMatchType = row.ad_group_criterion?.keyword?.match_type;
    wastedKWCriterionIds.add(criterionId);
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

  // Wasted search terms: 10+ clicks AND 0 conversions
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

  // ── Brand leakage detection ───────────────────────────────────────

  // Also check if any campaign has "brand" in the name (confirms brand awareness)
  const hasBrandCampaign = Array.from(campaignMap.values()).some(
    (c) => c.name.toLowerCase().includes("brand"),
  );

  const brandTerms: SearchTermItem[] = [];
  let brandTotalSpend = 0;
  if (brandVariants.length > 0) {
    for (const row of searchTermRows ?? []) {
      const term = row.search_term_view?.search_term ?? "";
      if (!isBrandTerm(term, brandVariants)) continue;
      // Only flag brand terms in non-brand campaigns
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

  // Converting search terms that could be added as keywords
  const miningOpportunities: SearchTermItem[] = [];
  for (const row of convertingRows ?? []) {
    const conv = row.metrics?.conversions ?? 0;
    if (conv < 2) continue; // Only flag terms with 2+ conversions
    miningOpportunities.push({
      term: row.search_term_view?.search_term ?? "",
      campaignName: row.campaign?.name ?? "",
      adGroupName: row.ad_group?.name ?? "",
      spend: micros(row.metrics?.cost_micros),
      clicks: row.metrics?.clicks ?? 0,
      conversions: conv,
    });
  }

  // ── Budget-constrained winners ────────────────────────────────────

  const enabledCampaigns = Array.from(campaignMap.values()).filter((c) => c.status === 2);
  const budgetConstrainedWinners = enabledCampaigns
    .filter((c) =>
      (c.budgetLostIS ?? 0) > 0.15 &&
      c.cpa != null &&
      (accountCPA == null || c.cpa <= accountCPA * 1.5),
    )
    .sort((a, b) => (b.budgetLostIS ?? 0) - (a.budgetLostIS ?? 0))
    .slice(0, 5)
    .map((c) => ({
      campaignName: c.name,
      budgetLostIS: c.budgetLostIS!,
      cpa: c.cpa!,
      dailyBudget: c.dailyBudget,
    }));

  // ── Demand captured ───────────────────────────────────────────────

  // Weighted average IS across campaigns with conversions, weighted by spend
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

  // Cap arrays for compact response
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
      totalClicks,
      cpa: accountCPA,
      activeCampaigns: enabledCampaigns.length,
    },
    pulse: {
      wasteRate,
      wasteUsd: totalWaste,
      demandCaptured: demandCaptured * 100, // as percentage
      cpa: accountCPA,
    },
    campaigns,
    findings: {
      wastedKeywords: wastedKeywords.slice(0, 10),
      wastedSearchTerms: wastedSearchTerms.slice(0, 10),
      brandLeakage: {
        detected: brandTerms.length > 0 || hasBrandCampaign,
        businessName,
        variants: brandVariants,
        totalSpend: brandTotalSpend,
        terms: brandTerms.slice(0, 10),
      },
      miningOpportunities: miningOpportunities.slice(0, 10),
      budgetConstrainedWinners,
      hasAudienceSegments: (audienceRows ?? []).length > 0,
      conversionActions,
    },
  };

  if (errors.length > 0) result.errors = errors;
  return result;
}
