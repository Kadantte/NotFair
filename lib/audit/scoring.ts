/**
 * Google Ads Account Audit — Scoring Engine
 *
 * Scoring engine with 3 pulse metrics (waste rate, demand captured, CPA)
 * and 3-pass action classification (Stop Wasting, Capture More, Fix Fundamentals).
 * Internal dimension scoring (0-5) is retained for pass classification logic.
 * Pure functions, no API calls — fully testable in isolation.
 *
 * Reuses heuristic rules from lib/intelligence/heuristics.ts
 * for waste detection and top action generation.
 */

import {
  findWastefulKeywords,
  findIrrelevantSearchTerms,
  findLowQualityKeywords,
  findZeroImpressionKeywords,
  findHighCpcOutliers,
  type KeywordData,
  type SearchTermData,
  type Recommendation,
} from "@/lib/intelligence/heuristics";
import { analyzeSearchTermWaste, type SearchTermWasteAnalysis } from "@/lib/audit/search-term-waste";
import type { LandingPageAnalysis } from "@/lib/audit/landing-page";

// ─── Types ───────────────────────────────────────────────────────────

export type AuditInput = {
  accountSettings: {
    autoTaggingEnabled: boolean;
    conversionTrackingId: string | null;
    trackingUrlTemplate: string | null;
  };
  conversionActions: Array<{
    id: string;
    name: string;
    type: number | string;
    status: number | string;
    category: number | string;
    includeInConversions: boolean;
    countingType: number | string;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: number | string;
    cost: number;
    conversions: number;
    clicks: number;
    impressions: number;
    biddingStrategy?: string | number;
  }>;
  keywords: Array<{
    criterionId: string;
    adGroupId?: string;
    text: string;
    qualityScore: number | null;
    creativeQuality: number | string | null;
    postClickQuality: number | string | null;
    searchPredictedCtr: number | string | null;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    status: number | string;
    matchType: string;
    campaignName: string;
    campaignId: string;
    adGroupName: string;
    averageCpc: number;
    ctr: number;
  }>;
  searchTerms: Array<{
    searchTerm: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    campaignName: string;
    campaignId: string;
    adGroupName: string;
  }>;
  ads: Array<{
    adId: string;
    type: number | string;
    headlines: string[];
    descriptions: string[];
    finalUrls: string[];
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    adGroupId: string;
    adGroupName: string;
    status: number | string;
    adStrength?: string | number | null;
  }>;
  landingPages: LandingPageAnalysis[];
  impressionShare: Array<{
    campaignName: string;
    impressionShare: number | null;
    budgetLostIS: number | null;
    rankLostIS: number | null;
    totalImpressions: number;
    totalCost: number;
  }>;
  negativeKeywords: Array<{
    text: string;
    campaignId: string;
  }>;
  adGroupCount: number;
};

export type DimensionScore = {
  key: string;
  label: string;
  score: number; // 0-5
  weight: number;
  status: "critical" | "poor" | "needs_work" | "acceptable" | "good" | "excellent";
  finding: string;
  details: string[];
};

export type WastedSpendBreakdown = {
  total: number;
  pct: number;
  annualized: number;
  categories: Array<{ label: string; amount: number; items: string[] }>;
  // Separate bucket for relevant-but-not-converting spend (fix funnel, don't add negatives)
  qualityIssues: {
    total: number;
    pct: number;
    categories: Array<{ label: string; amount: number; description: string; items: string[] }>;
  };
};

export type QsSubLabel = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNSPECIFIED" | "UNKNOWN";

function normalizeQsLabel(val: number | string | null): QsSubLabel {
  if (val === null || val === undefined) return "UNKNOWN";
  const QS_ENUM: Record<number, QsSubLabel> = { 0: "UNSPECIFIED", 1: "UNKNOWN", 2: "BELOW_AVERAGE", 3: "AVERAGE", 4: "ABOVE_AVERAGE" };
  if (typeof val === "number") return QS_ENUM[val] ?? "UNKNOWN";
  const s = String(val).toUpperCase();
  if (s === "ABOVE_AVERAGE" || s === "AVERAGE" || s === "BELOW_AVERAGE") return s;
  return "UNKNOWN";
}

export type CampaignISBreakdown = {
  campaignName: string;
  impressionShare: number | null;
  budgetLostIS: number | null;
  rankLostIS: number | null;
  totalImpressions: number;
  totalCost: number;
  diagnosis: "budget" | "rank" | "structural" | "healthy";
  topKeywords: Array<{
    text: string;
    matchType: string;
    qualityScore: number | null;
    creativeQuality: QsSubLabel;
    postClickQuality: QsSubLabel;
    searchPredictedCtr: QsSubLabel;
    impressions: number;
    clicks: number;
    cost: number;
    ctr: number;
  }>;
};

export type ImpressionShareDiagnosis = {
  avgIS: number | null;
  budgetLost: number | null;
  rankLost: number | null;
  diagnosis: string;
  campaignBreakdown: CampaignISBreakdown[];
};

export type TopAction = {
  action: string;
  impact: string;
  category: string;
  actionType?: "pause_campaign" | "add_negative" | "pause_keyword";
  targetId?: string;
  campaignId?: string;
  adGroupId?: string;
};

// ─── Pulse Metrics & 3-Pass Types (matches /ads-audit skill) ────────

export type PulseMetrics = {
  wasteRate: number;           // percentage (0-100)
  demandCaptured: number | null; // percentage (0-100), null if no IS data
  cpa: number | null;          // dollars
};

export type PassItem = {
  action: string;
  impact: string;
  actionType?: "pause_campaign" | "add_negative" | "pause_keyword";
  targetId?: string;
  campaignId?: string;
  adGroupId?: string;
};

export type AuditPasses = {
  stopWasting: PassItem[];     // max 3
  captureMore: PassItem[];     // max 3
  fixFundamentals: PassItem[]; // max 3
};

export type AuditResult = {
  overallScore: number;
  category: "Critical" | "Needs Work" | "OK" | "Strong" | "Excellent";
  dimensions: DimensionScore[];
  wastedSpend: WastedSpendBreakdown;
  impressionShareDiagnosis: ImpressionShareDiagnosis;
  topActions: TopAction[];
  keyNumbers: {
    totalSpend: number;
    conversions: number;
    cpa: number | null;
    topCampaign: string | null;
    wastedSpend: number;
  };
  wastedSearchTerms: Array<SearchTermWasteAnalysis>;
  zeroCvCampaigns: Array<{
    id: string;
    name: string;
    cost: number;
    clicks: number;
  }>;
  // New: 3-pass structure matching /ads-audit skill
  pulseMetrics: PulseMetrics;
  passes: AuditPasses;
  verdict: string;
};

// ─── Status helpers ──────────────────────────────────────────────────

const STATUS_MAP: Record<number, string> = {
  0: "critical",
  1: "poor",
  2: "needs_work",
  3: "acceptable",
  4: "good",
  5: "excellent",
};

function scoreToStatus(score: number): DimensionScore["status"] {
  return (STATUS_MAP[Math.min(Math.max(Math.round(score), 0), 5)] ?? "critical") as DimensionScore["status"];
}

function clamp05(n: number): number {
  return Math.min(5, Math.max(0, Math.round(n)));
}

function isEnabled(status: number | string): boolean {
  return status === 2 || status === "ENABLED";
}

// ─── Dimension 1: Conversion Tracking (weight 20%) ──────────────────

export function scoreConversionTracking(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { conversionActions, accountSettings } = input;
  const details: string[] = [];

  if (conversionActions.length === 0) {
    return { score: 0, status: "critical", finding: "No conversion actions set up — spending blind", details: ["No conversion tracking installed. Every dollar spent has no measurable outcome."] };
  }

  const included = conversionActions.filter((a) => a.includeInConversions);
  if (included.length === 0) {
    details.push("Conversion actions exist but none are included in conversions metric");
    return { score: 1, status: "poor", finding: "Conversion actions exist but not included in reporting", details };
  }

  let score = 2; // Actions exist and included

  if (accountSettings.autoTaggingEnabled) {
    score += 1;
    details.push("Auto-tagging enabled");
  } else {
    details.push("Auto-tagging disabled — Google Analytics integration may break");
  }

  if (accountSettings.conversionTrackingId) {
    score += 1;
    details.push("Conversion tracking ID configured");
  }

  // Check for potential duplicate counting
  const leadActions = conversionActions.filter(
    (a) => a.category === 13 || a.category === "LEAD",
  );
  const manyCountLeads = leadActions.filter(
    (a) => a.countingType === 3 || a.countingType === "MANY_PER_CLICK",
  );
  if (manyCountLeads.length > 0) {
    details.push(`${manyCountLeads.length} lead action(s) using MANY counting — may double-count leads`);
    score = Math.min(score, 3);
  }

  if (included.length >= 2 && accountSettings.autoTaggingEnabled && manyCountLeads.length === 0) {
    score = 5;
    details.push("Multiple conversion actions properly configured");
  }

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: s >= 4
      ? "Conversion tracking properly configured"
      : s >= 2
        ? "Basic tracking in place — room for improvement"
        : "Conversion tracking needs work",
    details,
  };
}

// ─── Dimension 2: Campaign Structure (weight 15%) ───────────────────

export function scoreCampaignStructure(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { campaigns, keywords, adGroupCount } = input;
  const details: string[] = [];
  const enabledCampaigns = campaigns.filter((c) => isEnabled(c.status));

  if (enabledCampaigns.length === 0) {
    return { score: 0, status: "critical", finding: "No enabled campaigns", details: ["Account has no active campaigns."] };
  }

  let score = 2; // Base: campaigns exist

  // Single campaign with single ad group = minimal structure
  if (enabledCampaigns.length === 1 && adGroupCount <= 1) {
    score = 1;
    details.push("Single campaign with 1 ad group — limited structure");
  } else if (enabledCampaigns.length >= 2) {
    score = 3;
    details.push(`${enabledCampaigns.length} campaigns provide service/product separation`);
  }

  // Check keywords per ad group ratio
  const enabledKeywords = keywords.filter((k) => isEnabled(k.status));
  if (adGroupCount > 0) {
    const kwPerAg = enabledKeywords.length / adGroupCount;
    if (kwPerAg > 30) {
      score = Math.min(score, 2);
      details.push(`${Math.round(kwPerAg)} keywords per ad group — too broad, should be 5-15`);
    } else if (kwPerAg <= 15) {
      score = Math.min(score + 1, 5);
      details.push(`${Math.round(kwPerAg)} keywords per ad group — well themed`);
    }
  }

  // Check for brand/non-brand separation (heuristic: look for "brand" in campaign names)
  const hasBrandCampaign = enabledCampaigns.some(
    (c) => c.name.toLowerCase().includes("brand"),
  );
  if (hasBrandCampaign && enabledCampaigns.length >= 2) {
    score = Math.min(score + 1, 5);
    details.push("Brand campaign separated from non-brand");
  }

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: s >= 4
      ? "Well-structured account with proper segmentation"
      : s >= 2
        ? `${enabledCampaigns.length} campaign(s), ${adGroupCount} ad group(s) — basic structure`
        : "Campaign structure needs work",
    details,
  };
}

// ─── Dimension 3: Keyword Health (weight 20%) ───────────────────────

export function scoreKeywordHealth(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { keywords } = input;
  const details: string[] = [];
  const enabled = keywords.filter((k) => isEnabled(k.status));

  if (enabled.length === 0) {
    return { score: 0, status: "critical", finding: "No enabled keywords", details: ["Account has no active keywords."] };
  }

  // Weighted avg QS
  const withQS = enabled.filter((k) => k.qualityScore !== null && k.qualityScore > 0);
  let avgQS: number | null = null;
  if (withQS.length > 0) {
    const totalWeight = withQS.reduce((s, k) => s + k.cost, 0);
    if (totalWeight > 0) {
      avgQS = withQS.reduce((s, k) => s + (k.qualityScore ?? 0) * k.cost, 0) / totalWeight;
    } else {
      avgQS = withQS.reduce((s, k) => s + (k.qualityScore ?? 0), 0) / withQS.length;
    }
    details.push(`Weighted avg QS: ${avgQS.toFixed(1)}/10`);
  } else {
    details.push("No quality score data available yet");
  }

  // Zero-impression keywords
  const zombies = enabled.filter((k) => k.impressions === 0);
  const zombiePct = zombies.length / enabled.length;
  if (zombies.length > 0) {
    details.push(`${zombies.length} keywords with 0 impressions (${(zombiePct * 100).toFixed(0)}%)`);
  }

  // Non-converting keywords with significant spend
  const totalSpend = enabled.reduce((s, k) => s + k.cost, 0);
  const wastedKw = enabled.filter((k) => k.conversions === 0 && k.clicks > 10);
  const wastedSpend = wastedKw.reduce((s, k) => s + k.cost, 0);
  if (totalSpend > 0 && wastedSpend > 0) {
    details.push(`$${wastedSpend.toFixed(2)} spent on non-converting keywords (${(wastedSpend / totalSpend * 100).toFixed(0)}%)`);
  }

  // Match type distribution
  const exactCount = enabled.filter((k) => k.matchType === "EXACT").length;
  const phraseCount = enabled.filter((k) => k.matchType === "PHRASE").length;
  const broadCount = enabled.filter((k) => k.matchType === "BROAD" || k.matchType === "BROAD_MATCH").length;
  if (enabled.length > 0) {
    details.push(`Match types: ${exactCount} Exact, ${phraseCount} Phrase, ${broadCount} Broad`);
  }

  // Scoring
  let score = 2; // baseline
  if (avgQS !== null) {
    if (avgQS >= 7) score = 4;
    else if (avgQS >= 5) score = 3;
    else if (avgQS >= 3) score = 2;
    else score = 1;
  }

  // Penalize for zombies
  if (zombiePct > 0.5) score = Math.min(score, 1);
  else if (zombiePct > 0.3) score = Math.min(score, 2);

  // Penalize for waste
  if (totalSpend > 0) {
    const wastePct = wastedSpend / totalSpend;
    if (wastePct > 0.3) score = Math.min(score, 1);
    else if (wastePct > 0.2) score = Math.min(score, 2);
  }

  // Penalize for over-reliance on broad match (risk of waste without negatives)
  if (enabled.length >= 5) {
    const broadPct = broadCount / enabled.length;
    if (broadPct > 0.7) {
      score = Math.min(score, 2);
      details.push("Over 70% broad match keywords — high irrelevant traffic risk without extensive negatives");
    } else if (exactCount === 0 && enabled.length > 3) {
      details.push("No exact match keywords — consider adding exact match for core terms");
    }
  }

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: avgQS !== null
      ? `Avg QS ${avgQS.toFixed(1)}, ${zombies.length} zombie keywords, ${exactCount}E/${phraseCount}P/${broadCount}B match split`
      : `${enabled.length} keywords (${exactCount}E/${phraseCount}P/${broadCount}B), ${zombies.length} with zero impressions`,
    details,
  };
}

// ─── Dimension 4: Search Term Quality (weight 15%) ──────────────────

export function scoreSearchTermQuality(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { searchTerms, negativeKeywords, keywords } = input;
  const details: string[] = [];

  if (searchTerms.length === 0) {
    return { score: 2, status: "needs_work", finding: "No search term data available", details: ["No search terms to analyze — account may be too new."] };
  }

  const totalSpend = searchTerms.reduce((s, t) => s + t.cost, 0);
  const irrelevantSpend = searchTerms
    .filter((t) => t.conversions === 0 && t.clicks > 0)
    .reduce((s, t) => s + t.cost, 0);
  const irrelevantPct = totalSpend > 0 ? irrelevantSpend / totalSpend : 0;

  details.push(`$${irrelevantSpend.toFixed(2)} spent on non-converting search terms (${(irrelevantPct * 100).toFixed(0)}% of search term spend)`);

  // Negative keyword coverage
  const enabledKw = keywords.filter((k) => isEnabled(k.status));
  const negativeRatio = enabledKw.length > 0 ? negativeKeywords.length / enabledKw.length : 0;
  details.push(`${negativeKeywords.length} negative keywords (${(negativeRatio * 100).toFixed(0)}% of active keyword count)`);

  // Scoring
  let score: number;
  if (irrelevantPct > 0.4) score = 0;
  else if (irrelevantPct > 0.3) score = 1;
  else if (irrelevantPct > 0.2) score = 2;
  else if (irrelevantPct > 0.1) score = 3;
  else if (irrelevantPct > 0.05) score = 4;
  else score = 5;

  // Bonus/penalty for negative coverage
  if (negativeKeywords.length === 0 && searchTerms.length > 0) {
    score = Math.min(score, 2);
    details.push("No negative keywords — search term quality uncontrolled");
  } else if (negativeRatio > 0.3) {
    score = Math.min(score + 1, 5);
  }

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: `${(irrelevantPct * 100).toFixed(0)}% of search term spend on non-converting queries, ${negativeKeywords.length} negatives`,
    details,
  };
}

// ─── Dimension 5: Ad Copy (weight 10%) ──────────────────────────────

export function scoreAdCopy(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { ads, adGroupCount } = input;
  const details: string[] = [];

  if (ads.length === 0) {
    return { score: 0, status: "critical", finding: "No active ads found", details: ["No ads to analyze."] };
  }

  // RSAs (type 15 = RSA)
  const rsas = ads.filter((a) => a.type === 15 || a.type === "RESPONSIVE_SEARCH_AD");
  details.push(`${rsas.length} RSA(s) across ${adGroupCount} ad group(s)`);

  // RSAs per ad group
  const rsaPerAg = adGroupCount > 0 ? rsas.length / adGroupCount : 0;

  // Headline variety
  const allHeadlines = new Set(rsas.flatMap((a) => a.headlines));
  const allDescriptions = new Set(rsas.flatMap((a) => a.descriptions));
  details.push(`${allHeadlines.size} unique headlines, ${allDescriptions.size} unique descriptions`);

  // Ad strength distribution for RSAs
  const rsaWithStrength = rsas.filter((a) => a.adStrength && a.adStrength !== "UNSPECIFIED" && a.adStrength !== 0);
  let excellentCount = 0;
  let goodCount = 0;
  let poorCount = 0;
  if (rsaWithStrength.length > 0) {
    excellentCount = rsaWithStrength.filter((a) => a.adStrength === "EXCELLENT" || a.adStrength === 6).length;
    goodCount = rsaWithStrength.filter((a) => a.adStrength === "GOOD" || a.adStrength === 5).length;
    poorCount = rsaWithStrength.filter((a) => a.adStrength === "POOR" || a.adStrength === 3 || a.adStrength === "NO_ADS" || a.adStrength === 2).length;
    details.push(`Ad strength: ${excellentCount} Excellent, ${goodCount} Good, ${rsaWithStrength.length - excellentCount - goodCount} Average/Poor`);
  }

  // Scoring
  let score = 1; // ads exist

  if (rsas.length === 0) {
    score = 0;
    details.push("No RSAs — only legacy ad formats");
  } else {
    if (rsaPerAg >= 2) score = 4;
    else if (rsaPerAg >= 1) score = 3;
    else score = 2;

    // Headline variety bonus
    if (allHeadlines.size >= 10) score = Math.min(score + 1, 5);
    else if (allHeadlines.size < 5) score = Math.max(score - 1, 0);

    // Ad strength adjustment
    if (rsaWithStrength.length > 0) {
      if (poorCount > rsaWithStrength.length * 0.5) {
        score = Math.min(score, 2);
        details.push("Most RSAs have poor ad strength — diversify headlines and descriptions");
      } else if (excellentCount > 0) {
        score = Math.min(score + 1, 5);
      }
    }
  }

  const strengthSummary = rsaWithStrength.length > 0
    ? `, ${excellentCount} Excellent/${goodCount} Good strength`
    : "";
  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: rsas.length > 0
      ? `${rsas.length} RSA(s), ${allHeadlines.size} unique headlines, ${rsaPerAg.toFixed(1)} RSAs/ad group${strengthSummary}`
      : "No RSAs found — ad copy needs attention",
    details,
  };
}

// ─── Dimension 6: Impression Share (weight 10%) ─────────────────────

export function scoreImpressionShare(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { impressionShare } = input;
  const details: string[] = [];

  const withData = impressionShare.filter((is) => is.impressionShare !== null);
  if (withData.length === 0) {
    return { score: 2, status: "needs_work", finding: "No impression share data available", details: ["Impression share data not yet available."] };
  }

  // Weighted average IS
  const totalImpressions = withData.reduce((s, r) => s + r.totalImpressions, 0);
  const avgIS = totalImpressions > 0
    ? withData.reduce((s, r) => s + (r.impressionShare ?? 0) * r.totalImpressions, 0) / totalImpressions
    : null;

  const avgBudgetLost = totalImpressions > 0
    ? withData.reduce((s, r) => s + (r.budgetLostIS ?? 0) * r.totalImpressions, 0) / totalImpressions
    : null;

  const avgRankLost = totalImpressions > 0
    ? withData.reduce((s, r) => s + (r.rankLostIS ?? 0) * r.totalImpressions, 0) / totalImpressions
    : null;

  if (avgIS !== null) details.push(`Search IS: ${(avgIS * 100).toFixed(0)}%`);
  if (avgBudgetLost !== null) details.push(`Budget-lost IS: ${(avgBudgetLost * 100).toFixed(0)}%`);
  if (avgRankLost !== null) details.push(`Rank-lost IS: ${(avgRankLost * 100).toFixed(0)}%`);

  // Score based on IS level
  let score: number;
  const is = avgIS ?? 0;
  if (is >= 0.8) score = 5;
  else if (is >= 0.65) score = 4;
  else if (is >= 0.5) score = 3;
  else if (is >= 0.35) score = 2;
  else if (is >= 0.2) score = 1;
  else score = 0;

  // 2x2 matrix diagnosis
  const budgetHigh = (avgBudgetLost ?? 0) > 0.15;
  const rankHigh = (avgRankLost ?? 0) > 0.20;

  let diagnosis: string;
  if (!budgetHigh && !rankHigh) {
    diagnosis = "Healthy — optimizing at the margins. Focus on bid strategy and keyword expansion.";
  } else if (!budgetHigh && rankHigh) {
    diagnosis = "QS/Bid problem — ads not competitive. Improve ad relevance, landing pages, or increase bids.";
  } else if (budgetHigh && !rankHigh) {
    diagnosis = "Budget problem — ads competitive when shown. Increase budget or narrow targeting.";
  } else {
    diagnosis = "Structural problem — wrong keywords or audience too broad. Consider restructuring targeting.";
    score = Math.min(score, 1);
  }
  details.push(`Diagnosis: ${diagnosis}`);

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: avgIS !== null
      ? `${(avgIS * 100).toFixed(0)}% search IS — ${budgetHigh ? "budget-limited" : ""} ${rankHigh ? "rank-limited" : ""} ${!budgetHigh && !rankHigh ? "healthy" : ""}`.trim()
      : "Impression share data unavailable",
    details,
  };
}

// ─── Dimension 8: Landing Page Quality (weight 10%) ────────────────

export function scoreLandingPageQuality(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { landingPages, ads } = input;
  const details: string[] = [];

  // No final URLs available at all
  const allUrls = ads.flatMap((a) => a.finalUrls).filter(Boolean);
  if (allUrls.length === 0) {
    return { score: 2, status: "needs_work", finding: "No landing page URLs found in ads", details: ["Ads have no final URLs to analyze."] };
  }

  // Landing page fetch wasn't run (e.g. skipped or pre-enrichment data)
  if (landingPages.length === 0) {
    return { score: 2, status: "needs_work", finding: "Landing page analysis not available", details: ["Landing page data was not collected."] };
  }

  const total = landingPages.length;
  const loaded = landingPages.filter((p) => p.ok);
  const failed = landingPages.filter((p) => !p.ok);
  const https = landingPages.filter((p) => p.https);
  const withTitle = loaded.filter((p) => p.title);
  const withMeta = loaded.filter((p) => p.metaDescription);
  const withForm = loaded.filter((p) => p.hasForm);
  const withMobile = loaded.filter((p) => p.hasMobileViewport);

  details.push(`${total} unique landing page(s) analyzed`);

  // ── Load success ────────────────────────────────────────
  if (failed.length > 0) {
    details.push(`${failed.length} page(s) failed to load: ${failed.map((p) => p.errorReason ?? "unknown").join("; ")}`);
  }

  // ── HTTPS ───────────────────────────────────────────────
  if (https.length < total) {
    details.push(`${total - https.length} page(s) not using HTTPS — hurts trust and Ad Rank`);
  } else {
    details.push("All pages use HTTPS");
  }

  // ── Mobile viewport ─────────────────────────────────────
  if (loaded.length > 0 && withMobile.length < loaded.length) {
    details.push(`${loaded.length - withMobile.length} page(s) missing mobile viewport meta — poor mobile experience`);
  } else if (loaded.length > 0) {
    details.push("All pages have mobile viewport configured");
  }

  // ── Title relevance ─────────────────────────────────────
  if (withTitle.length > 0) {
    // Check if page titles share any words with ad headlines (basic relevance)
    const adHeadlineWords = new Set(
      ads.flatMap((a) => a.headlines).flatMap((h) => h.toLowerCase().split(/\s+/)).filter((w) => w.length > 3),
    );
    const titlesWithOverlap = loaded.filter((p) => {
      if (!p.title) return false;
      const titleWords = p.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      return titleWords.some((w) => adHeadlineWords.has(w));
    });
    if (adHeadlineWords.size > 0 && loaded.length > 0) {
      const pct = titlesWithOverlap.length / loaded.length;
      if (pct >= 0.5) {
        details.push("Page titles align with ad headlines — good relevance signal");
      } else {
        details.push(`${loaded.length - titlesWithOverlap.length} page(s) have titles misaligned with ad copy — may hurt Quality Score`);
      }
    }
  }

  // ── Forms / CTAs ────────────────────────────────────────
  if (withForm.length > 0) {
    details.push(`${withForm.length} page(s) have forms/CTAs — good for conversions`);
  } else if (loaded.length > 0) {
    details.push("No forms detected on landing pages — may lack clear call-to-action");
  }

  // ── Meta descriptions ───────────────────────────────────
  if (loaded.length > 0 && withMeta.length < loaded.length) {
    details.push(`${loaded.length - withMeta.length} page(s) missing meta description`);
  }

  // ── Load time ───────────────────────────────────────────
  const loadTimes = loaded.filter((p) => p.loadTimeMs !== null).map((p) => p.loadTimeMs!);
  const avgLoadTimeMs = loadTimes.length > 0
    ? loadTimes.reduce((s, t) => s + t, 0) / loadTimes.length
    : null;
  if (avgLoadTimeMs !== null) {
    details.push(`Avg server response: ${Math.round(avgLoadTimeMs)}ms`);
    if (avgLoadTimeMs > 3000) {
      details.push("Slow server response — may hurt bounce rate and Quality Score");
    }
  }

  // ── Scoring ─────────────────────────────────────────────
  // Start with bonuses, then apply hard caps for critical issues
  let score = 3; // baseline: pages exist and we can analyze

  // Bonuses
  if (loaded.length > 0 && withForm.length > 0) score += 1;
  if (failed.length === 0 && https.length === total && withMobile.length === loaded.length && withForm.length > 0) {
    score = Math.max(score, 4);
    if (withTitle.length === loaded.length && withMeta.length === loaded.length) score = 5;
  }

  // Hard caps for critical issues (applied last so they can't be overridden)
  const failPct = total > 0 ? failed.length / total : 0;
  if (failPct >= 0.5) score = 0;
  else if (failPct > 0) score = Math.min(score, 2);
  if (https.length < total) score = Math.min(score, 2);
  if (loaded.length > 0 && withMobile.length < loaded.length) score = Math.min(score, 2);
  if (avgLoadTimeMs !== null) {
    if (avgLoadTimeMs > 5000) score = Math.min(score, 1);
    else if (avgLoadTimeMs > 3000) score = Math.min(score, 2);
  }

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: loaded.length > 0
      ? `${loaded.length}/${total} pages loaded — ${https.length === total ? "HTTPS" : "mixed HTTP"}, ${withForm.length} with forms, ${withMobile.length} mobile-ready`
      : `${failed.length} page(s) failed to load`,
    details,
  };
}

// ─── Dimension 9: Bidding Strategy (weight 10%) ─────────────────────

const SMART_BIDDING_TYPES = new Set<string | number>([
  6, 8, 11, 12,
  "TARGET_CPA", "TARGET_ROAS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE",
]);
const DEPRECATED_BIDDING_TYPES = new Set<string | number>([5, "ENHANCED_CPC"]);

export function scoreBiddingStrategy(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { campaigns } = input;
  const details: string[] = [];

  const enabled = campaigns.filter((c) => isEnabled(c.status) && c.cost > 0);

  if (enabled.length === 0) {
    return { score: 2, status: "needs_work", finding: "No active campaigns with spend to analyze", details: ["No active campaigns with spend in the analysis period."] };
  }

  const hasBiddingData = enabled.some((c) => c.biddingStrategy && c.biddingStrategy !== "UNKNOWN" && c.biddingStrategy !== "UNSPECIFIED");
  if (!hasBiddingData) {
    return { score: 2, status: "needs_work", finding: "Bidding strategy data unavailable", details: ["Bidding strategy data could not be retrieved."] };
  }

  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const smartCount = enabled.filter((c) => c.biddingStrategy && SMART_BIDDING_TYPES.has(c.biddingStrategy)).length;
  const deprecatedCount = enabled.filter((c) => c.biddingStrategy && DEPRECATED_BIDDING_TYPES.has(c.biddingStrategy)).length;
  // unknownCount: campaigns where strategy data is missing or unspecified — don't treat as "manual"
  const unknownCount = enabled.filter((c) => !c.biddingStrategy || c.biddingStrategy === 0 || c.biddingStrategy === 1 || c.biddingStrategy === "UNKNOWN" || c.biddingStrategy === "UNSPECIFIED").length;
  const manualCount = enabled.length - smartCount - deprecatedCount - unknownCount;
  // Base smartPct on campaigns with known strategy only (don't penalize for missing API data)
  const knownCount = enabled.length - unknownCount;
  const smartPct = knownCount > 0 ? smartCount / knownCount : 0;

  details.push(`${smartCount}/${knownCount > 0 ? knownCount : enabled.length} campaigns use Smart Bidding (Target CPA/ROAS or Maximize Conversions)`);
  if (unknownCount > 0) {
    details.push(`${unknownCount} campaign(s) have no bidding strategy data — check account access`);
  }
  if (deprecatedCount > 0) {
    details.push(`${deprecatedCount} campaign(s) use deprecated Enhanced CPC — migrate to Smart Bidding`);
  }
  if (manualCount > 0 && totalConversions > 30) {
    details.push(`${manualCount} campaign(s) on manual bidding despite sufficient conversion history — Smart Bidding could improve efficiency`);
  } else if (manualCount > 0 && totalConversions === 0) {
    details.push(`${manualCount} campaign(s) on manual CPC — appropriate while building conversion history`);
  }

  let score: number;

  if (deprecatedCount > 0) {
    score = 2; // deprecated strategies cap at poor
  } else if (smartPct >= 0.8) {
    score = 5;
  } else if (smartPct >= 0.6) {
    score = 4;
  } else if (smartPct >= 0.4) {
    score = 3;
  } else if (totalConversions < 30 && manualCount === knownCount) {
    score = 3; // manual is acceptable for new accounts without conversion history
  } else {
    score = 2;
  }

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: `${smartCount}/${enabled.length} campaigns on Smart Bidding${deprecatedCount > 0 ? `, ${deprecatedCount} on deprecated Enhanced CPC` : ""}`,
    details,
  };
}

// ─── Shared account metrics ─────────────────────────────────────────

const MIN_NOISE_SPEND_USD = 10;

function computeAccountMetrics(input: AuditInput) {
  const totalSpend = input.campaigns.reduce((s, c) => s + c.cost, 0);
  const totalClicks = input.campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = input.campaigns.reduce((s, c) => s + c.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const activeKeywordTexts = input.keywords.filter(k => isEnabled(k.status)).map(k => k.text);
  return { totalSpend, totalClicks, totalImpressions, avgCtr, avgCpc, activeKeywordTexts };
}

// ─── Dimension 7: Spend Efficiency (weight 10%) ─────────────────────

export function scoreSpendEfficiency(input: AuditInput): Omit<DimensionScore, "key" | "label" | "weight"> {
  const { keywords, searchTerms, campaigns } = input;
  const details: string[] = [];

  const totalSpend = campaigns.reduce((s, c) => s + c.cost, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);

  if (totalSpend === 0) {
    return { score: 2, status: "needs_work", finding: "No spend data to analyze", details: ["Account has $0 spend in the analysis period."] };
  }

  // Wasted keyword spend (>10 clicks, 0 conversions)
  const wastedKw = keywords.filter((k) => k.conversions === 0 && k.clicks > 10);
  const wastedKwSpend = wastedKw.reduce((s, k) => s + k.cost, 0);

  const { avgCtr, avgCpc, activeKeywordTexts } = computeAccountMetrics(input);

  const semanticWastedSTs = searchTerms
    .filter(t => t.conversions === 0 && t.cost > 0)
    .map(t => analyzeSearchTermWaste(t, activeKeywordTexts, avgCtr, avgCpc))
    .filter(r => r.classification === "confirmed_waste" || r.classification === "likely_waste");
  const wastedSTSpend = semanticWastedSTs.reduce((s, r) => s + r.cost, 0);

  const totalWaste = wastedKwSpend + wastedSTSpend;
  const wastePct = totalWaste / totalSpend;

  details.push(`Total wasted spend: $${totalWaste.toFixed(2)} (${(wastePct * 100).toFixed(0)}% of total)`);
  if (wastedKwSpend > 0) details.push(`Non-converting keywords: $${wastedKwSpend.toFixed(2)}`);
  if (wastedSTSpend > 0) details.push(`Irrelevant search terms: $${wastedSTSpend.toFixed(2)}`);

  if (totalConversions > 0) {
    const cpa = totalSpend / totalConversions;
    details.push(`Account CPA: $${cpa.toFixed(2)}`);
  } else {
    details.push("0 conversions — cannot calculate CPA");
  }

  // Scoring
  let score: number;
  if (totalConversions === 0) {
    score = 0; // no conversion data
  } else if (wastePct > 0.3) score = 1;
  else if (wastePct > 0.2) score = 2;
  else if (wastePct > 0.1) score = 3;
  else if (wastePct > 0.05) score = 4;
  else score = 5;

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: totalConversions > 0
      ? `${(wastePct * 100).toFixed(0)}% wasted spend, CPA $${(totalSpend / totalConversions).toFixed(2)}`
      : `0 conversions, $${totalWaste.toFixed(2)} potential waste (${(wastePct * 100).toFixed(0)}%)`,
    details,
  };
}

// ─── Wasted Spend Breakdown ─────────────────────────────────────────

function computeWastedSpend(input: AuditInput): WastedSpendBreakdown {
  const { totalSpend, avgCtr: accountAvgCtr, avgCpc: accountAvgCpc, activeKeywordTexts } = computeAccountMetrics(input);

  // ── Semantic analysis on all non-converting search terms ─────────
  const nonConvertingSTs = input.searchTerms.filter(t => t.conversions === 0 && t.cost > 0);
  const stAnalyses = nonConvertingSTs.map(t =>
    analyzeSearchTermWaste(t, activeKeywordTexts, accountAvgCtr, accountAvgCpc)
  );

  // TRUE WASTE: irrelevant traffic — add negatives or tighten match type
  const wastedSTs = stAnalyses.filter(r =>
    r.classification === "confirmed_waste" || r.classification === "likely_waste"
  );

  // QUALITY ISSUE: relevant traffic not converting — fix landing page/offer/ad copy
  // Only flag when there's meaningful spend ($10+) to avoid noise
  const qualityIssueSTs = stAnalyses.filter(r =>
    (r.classification === "likely_relevant" || r.classification === "possible_waste") && r.cost >= MIN_NOISE_SPEND_USD
  );

  const stWasteAmount = wastedSTs.reduce((s, r) => s + r.cost, 0);
  const stQualityAmount = qualityIssueSTs.reduce((s, r) => s + r.cost, 0);

  // ── Broad match structural waste ─────────────────────────────────
  // Broad match keywords with no conversions whose campaigns aren't covered
  // by our search term data sample (avoids double-counting)
  const campaignsWithSTData = new Set(input.searchTerms.map(t => t.campaignId));
  const enabledKws = input.keywords.filter(k => isEnabled(k.status));

  const broadLeakageKws = enabledKws.filter(k =>
    (k.matchType === "BROAD" || k.matchType === "2") &&
    k.conversions === 0 &&
    k.clicks > 20 &&
    !campaignsWithSTData.has(k.campaignId)
  );
  const broadLeakageAmount = broadLeakageKws.reduce((s, k) => s + k.cost, 0);

  // ── Low Quality Score spend (quality issue) ───────────────────────
  // QS < 4 means Google is charging a CPC premium (est. 50-200% above market rate)
  // This is a quality issue: improve ad relevance + landing page to fix
  const lowQsKws = enabledKws.filter(k =>
    k.qualityScore !== null && k.qualityScore > 0 && k.qualityScore < 4 && k.cost >= 10
  );
  const lowQsAmount = lowQsKws.reduce((s, k) => s + k.cost, 0);

  // ── Build waste categories ────────────────────────────────────────
  const wasteCategories: Array<{ label: string; amount: number; items: string[] }> = [];

  if (stWasteAmount > 0) {
    wasteCategories.push({
      label: "Irrelevant search terms",
      amount: stWasteAmount,
      items: [...wastedSTs]
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5)
        .map(r => `"${r.searchTerm}": $${r.cost.toFixed(2)} — ${r.reason}`),
    });
  }

  if (broadLeakageAmount > 0) {
    wasteCategories.push({
      label: "Broad match leakage",
      amount: broadLeakageAmount,
      items: [...broadLeakageKws]
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 3)
        .map(k => `"${k.text}" [Broad]: $${k.cost.toFixed(2)}, ${k.clicks} clicks, 0 conv`),
    });
  }

  // ── Build quality issue categories ───────────────────────────────
  const qualityCategories: Array<{ label: string; amount: number; description: string; items: string[] }> = [];

  if (stQualityAmount > 0) {
    qualityCategories.push({
      label: "Relevant queries not converting",
      amount: stQualityAmount,
      description: "Queries matching your keywords but not buying. Likely a landing page, offer, or ad copy issue — don't add as negatives.",
      items: [...qualityIssueSTs]
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5)
        .map(r => `"${r.searchTerm}": $${r.cost.toFixed(2)} — ${r.reason}`),
    });
  }

  if (lowQsAmount > 0) {
    qualityCategories.push({
      label: "Low Quality Score spend (CPC premium)",
      amount: lowQsAmount,
      description: "Keywords with QS < 4 paying an estimated 50–200% CPC premium. Fix: improve ad/keyword relevance and landing page experience.",
      items: [...lowQsKws]
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 4)
        .map(k => `"${k.text}": QS ${k.qualityScore}/10, $${k.cost.toFixed(2)} spent`),
    });
  }

  const total = stWasteAmount + broadLeakageAmount;

  return {
    total,
    pct: totalSpend > 0 ? total / totalSpend : 0,
    annualized: total * 12,
    categories: wasteCategories,
    qualityIssues: {
      total: stQualityAmount + lowQsAmount,
      pct: totalSpend > 0 ? (stQualityAmount + lowQsAmount) / totalSpend : 0,
      categories: qualityCategories,
    },
  };
}

// ─── Impression Share Diagnosis ─────────────────────────────────────

function computeISDiagnosis(input: AuditInput): ImpressionShareDiagnosis {
  const withData = input.impressionShare.filter((is) => is.impressionShare !== null);
  if (withData.length === 0) {
    return { avgIS: null, budgetLost: null, rankLost: null, diagnosis: "No impression share data available.", campaignBreakdown: [] };
  }

  const totalImpressions = withData.reduce((s, r) => s + r.totalImpressions, 0);
  const avgIS = totalImpressions > 0
    ? withData.reduce((s, r) => s + (r.impressionShare ?? 0) * r.totalImpressions, 0) / totalImpressions
    : null;
  const budgetLost = totalImpressions > 0
    ? withData.reduce((s, r) => s + (r.budgetLostIS ?? 0) * r.totalImpressions, 0) / totalImpressions
    : null;
  const rankLost = totalImpressions > 0
    ? withData.reduce((s, r) => s + (r.rankLostIS ?? 0) * r.totalImpressions, 0) / totalImpressions
    : null;

  const bHigh = (budgetLost ?? 0) > 0.15;
  const rHigh = (rankLost ?? 0) > 0.20;

  let diagnosis: string;
  if (!bHigh && !rHigh) {
    diagnosis = "Healthy position — focus on bid strategy refinement and keyword expansion.";
  } else if (!bHigh && rHigh) {
    diagnosis = `Rank-limited (${((rankLost ?? 0) * 100).toFixed(0)}% lost to rank). Improve ad relevance, landing pages, or increase bids on high-QS keywords.`;
  } else if (bHigh && !rHigh) {
    diagnosis = `Budget-limited (${((budgetLost ?? 0) * 100).toFixed(0)}% lost to budget). Ads are competitive when shown. Increase budget or narrow targeting to stretch it.`;
  } else {
    diagnosis = `Structural problem — losing ${((budgetLost ?? 0) * 100).toFixed(0)}% to budget and ${((rankLost ?? 0) * 100).toFixed(0)}% to rank. Consider restructuring keywords and targeting.`;
  }

  // Per-campaign breakdown with top keywords
  const campaignBreakdown: CampaignISBreakdown[] = input.impressionShare
    .filter((is) => is.impressionShare !== null)
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .map((is) => {
      const cb = (is.budgetLostIS ?? 0) > 0.15;
      const cr = (is.rankLostIS ?? 0) > 0.20;
      const campDiagnosis: CampaignISBreakdown["diagnosis"] =
        cb && cr ? "structural" : cb ? "budget" : cr ? "rank" : "healthy";

      // Find top keywords for this campaign by spend (include paused — they may have recent spend/impressions)
      const campKeywords = input.keywords
        .filter((k) => k.campaignName === is.campaignName && (k.cost > 0 || k.impressions > 0))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5)
        .map((k) => ({
          text: k.text,
          matchType: k.matchType,
          qualityScore: k.qualityScore,
          creativeQuality: normalizeQsLabel(k.creativeQuality),
          postClickQuality: normalizeQsLabel(k.postClickQuality),
          searchPredictedCtr: normalizeQsLabel(k.searchPredictedCtr),
          impressions: k.impressions,
          clicks: k.clicks,
          cost: k.cost,
          ctr: k.ctr,
        }));

      return {
        campaignName: is.campaignName,
        impressionShare: is.impressionShare,
        budgetLostIS: is.budgetLostIS,
        rankLostIS: is.rankLostIS,
        totalImpressions: is.totalImpressions,
        totalCost: is.totalCost,
        diagnosis: campDiagnosis,
        topKeywords: campKeywords,
      };
    });

  return { avgIS, budgetLost, rankLost, diagnosis, campaignBreakdown };
}

// ─── Top Actions ────────────────────────────────────────────────────

const ACTION_VERBS: Record<string, string> = {
  pause_keyword: "Pause",
  add_negative_keyword: "Add negative",
  review_keyword: "Review",
  reduce_bid: "Reduce bid on",
};

function computeTopActions(input: AuditInput): TopAction[] {
  // Build lookup maps for action wiring
  const kwById = new Map(input.keywords.map((k) => [k.criterionId, k]));
  const stCampaignId = new Map(input.searchTerms.map((t) => [t.searchTerm, t.campaignId]));

  const heuristicKeywords: KeywordData[] = input.keywords.map((k) => ({
    criterionId: k.criterionId,
    text: k.text,
    adGroupName: k.adGroupName,
    campaignId: k.campaignId,
    campaignName: k.campaignName,
    status: isEnabled(k.status) ? "ENABLED" : "PAUSED",
    qualityScore: k.qualityScore,
    impressions: k.impressions,
    clicks: k.clicks,
    ctr: k.ctr,
    cost: k.cost,
    averageCpc: k.averageCpc,
    conversions: k.conversions,
  }));

  const heuristicSearchTerms: SearchTermData[] = input.searchTerms.map((t) => ({
    searchTerm: t.searchTerm,
    campaignId: t.campaignId,
    campaignName: t.campaignName,
    adGroupName: t.adGroupName,
    impressions: t.impressions,
    clicks: t.clicks,
    cost: t.cost,
    conversions: t.conversions,
    occurrences: 1,
  }));

  const all: Recommendation[] = [
    ...findWastefulKeywords(heuristicKeywords, 10),
    ...findIrrelevantSearchTerms(heuristicSearchTerms, 1),
    ...findLowQualityKeywords(heuristicKeywords, 3, 5),
    ...findZeroImpressionKeywords(heuristicKeywords),
    ...findHighCpcOutliers(
      heuristicKeywords,
      heuristicKeywords.reduce((s, k) => s + k.averageCpc * k.clicks, 0) /
        Math.max(heuristicKeywords.reduce((s, k) => s + k.clicks, 0), 1),
    ),
  ];

  const sorted = all.sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);

  return sorted.slice(0, 5).map((r) => {
    let actionType: TopAction["actionType"];
    let targetId: string | undefined;
    let campaignId: string | undefined;
    let adGroupId: string | undefined;

    if (r.action === "pause_keyword") {
      actionType = "pause_keyword";
      targetId = r.target.id;
      const kw = kwById.get(r.target.id);
      campaignId = kw?.campaignId;
      adGroupId = kw?.adGroupId;
    } else if (r.action === "add_negative_keyword") {
      actionType = "add_negative";
      targetId = r.target.id;
      campaignId = stCampaignId.get(r.target.id);
    }

    const verb = ACTION_VERBS[r.action] ?? "Review";

    return {
      action: `${verb} "${r.target.name}"${r.target.campaignName ? ` in ${r.target.campaignName}` : ""}`,
      impact: r.estimatedMonthlySavings > 0
        ? `Save ~$${r.estimatedMonthlySavings.toFixed(2)}/month`
        : "Improve account health",
      category: r.action,
      actionType,
      targetId,
      campaignId,
      adGroupId,
    };
  });
}

// ─── Pulse Metrics ──────────────────────────────────────────────────

function computePulseMetrics(
  input: AuditInput,
  wastedSpend: WastedSpendBreakdown,
  totalSpend: number,
  totalConversions: number,
): PulseMetrics {
  const wasteRate = wastedSpend.pct * 100;

  const campaignsByName = new Map(input.campaigns.map((c) => [c.name, c]));
  const profitableIS = input.impressionShare.filter((is) => {
    const camp = campaignsByName.get(is.campaignName);
    return camp && camp.conversions > 0 && is.impressionShare !== null;
  });

  let demandCaptured: number | null = null;
  if (profitableIS.length > 0) {
    const totalCost = profitableIS.reduce((s, is) => s + is.totalCost, 0);
    if (totalCost > 0) {
      demandCaptured =
        (profitableIS.reduce((s, is) => s + (is.impressionShare ?? 0) * is.totalCost, 0) / totalCost) * 100;
    }
  }

  const cpa = totalConversions > 0 ? totalSpend / totalConversions : null;

  return { wasteRate, demandCaptured, cpa };
}

const MAX_ITEMS_PER_PASS = 3;

// ─── 3-Pass Classification ─────────────────────────────────────────

function computePasses(
  input: AuditInput,
  topActions: TopAction[],
  isDiagnosis: ImpressionShareDiagnosis,
  dimensions: DimensionScore[],
): AuditPasses {
  const stopWasting: PassItem[] = [];
  const captureMore: PassItem[] = [];
  const fixFundamentals: PassItem[] = [];
  const campaignsByName = new Map(input.campaigns.map((c) => [c.name, c]));

  // Pass 1: Zero-CV campaigns first (highest dollar waste, most actionable)
  const zeroCvCampaigns = input.campaigns
    .filter((c) => isEnabled(c.status) && c.cost > 20 && c.clicks > 20 && c.conversions === 0)
    .sort((a, b) => b.cost - a.cost);

  for (const camp of zeroCvCampaigns) {
    if (stopWasting.length >= MAX_ITEMS_PER_PASS) break;
    stopWasting.push({
      action: `Pause "${camp.name}" — $${camp.cost.toFixed(2)} spent, ${camp.clicks} clicks, 0 conversions`,
      impact: `Save ~$${camp.cost.toFixed(2)}/month`,
      actionType: "pause_campaign",
      targetId: camp.id,
    });
  }

  // Pass 1: Waste-related actions from topActions (pause keywords, add negatives)
  for (const action of topActions) {
    if (stopWasting.length >= MAX_ITEMS_PER_PASS) break;
    if (action.category === "pause_keyword" || action.category === "add_negative_keyword") {
      stopWasting.push({
        action: action.action,
        impact: action.impact,
        actionType: action.actionType,
        targetId: action.targetId,
        campaignId: action.campaignId,
        adGroupId: action.adGroupId,
      });
    }
  }

  // Pass 2: Budget-constrained profitable campaigns
  for (const camp of isDiagnosis.campaignBreakdown) {
    if (captureMore.length >= MAX_ITEMS_PER_PASS) break;
    if (camp.diagnosis === "budget" && (camp.budgetLostIS ?? 0) > 0.15) {
      const campaign = campaignsByName.get(camp.campaignName);
      if (campaign && campaign.conversions > 0) {
        const cpa = campaign.cost / campaign.conversions;
        const lostPct = ((camp.budgetLostIS ?? 0) * 100).toFixed(0);
        const estExtra = Math.round(campaign.conversions * (camp.budgetLostIS ?? 0));
        captureMore.push({
          action: `Increase budget on "${camp.campaignName}" — ${lostPct}% budget-lost IS at $${cpa.toFixed(2)} CPA`,
          impact: estExtra > 0 ? `Est. +${estExtra} conv/month` : "Capture more demand",
        });
      }
    }
  }

  // Pass 2: Converting search terms not yet added as keywords
  const kwTexts = new Set(input.keywords.map((k) => k.text.toLowerCase()));
  const convertingSTs = input.searchTerms
    .filter((t) => t.conversions >= 2 && !kwTexts.has(t.searchTerm.toLowerCase()))
    .sort((a, b) => b.conversions - a.conversions);

  for (const st of convertingSTs) {
    if (captureMore.length >= MAX_ITEMS_PER_PASS) break;
    const stCpa = st.conversions > 0 ? st.cost / st.conversions : 0;
    captureMore.push({
      action: `Add "${st.searchTerm}" as exact match keyword — ${st.conversions} conversions in 30 days`,
      impact: `At $${stCpa.toFixed(2)} CPA`,
    });
  }

  // Pass 3: From low-scoring dimensions (structural/foundational issues)
  const dimActions: Array<{ action: string; impact: string; priority: number }> = [];

  for (const dim of dimensions) {
    if (dim.score > 2) continue;
    switch (dim.key) {
      case "conversion_tracking":
        dimActions.push({
          action: `Fix conversion tracking — ${dim.finding}`,
          impact: dim.score === 0 ? "Critical — fix before spending another dollar" : "Improve data accuracy",
          priority: dim.score === 0 ? 0 : 1,
        });
        break;
      case "campaign_structure":
        dimActions.push({ action: `Restructure campaigns — ${dim.finding}`, impact: "Better relevance and QS", priority: 2 });
        break;
      case "ad_copy":
        dimActions.push({ action: `Improve ad copy — ${dim.finding}`, impact: "Higher CTR and Ad Rank", priority: 3 });
        break;
      case "bidding_strategy":
        dimActions.push({ action: `Update bidding strategy — ${dim.finding}`, impact: "Better bid optimization", priority: 3 });
        break;
      case "landing_page_quality":
        dimActions.push({ action: `Fix landing pages — ${dim.finding}`, impact: "Better QS and conversion rate", priority: 2 });
        break;
    }
  }

  // Also add QS/review actions from topActions that didn't go to Pass 1
  for (const action of topActions) {
    if (fixFundamentals.length >= MAX_ITEMS_PER_PASS) break;
    if (action.category !== "pause_keyword" && action.category !== "add_negative_keyword") {
      fixFundamentals.push({
        action: action.action,
        impact: action.impact,
        actionType: action.actionType,
        targetId: action.targetId,
        campaignId: action.campaignId,
        adGroupId: action.adGroupId,
      });
    }
  }

  // Fill remaining Pass 3 slots from dimension issues
  dimActions.sort((a, b) => a.priority - b.priority);
  for (const da of dimActions) {
    if (fixFundamentals.length >= MAX_ITEMS_PER_PASS) break;
    fixFundamentals.push({ action: da.action, impact: da.impact });
  }

  return { stopWasting, captureMore, fixFundamentals };
}

// ─── Verdict ────────────────────────────────────────────────────────

function computeVerdict(pulseMetrics: PulseMetrics, passes: AuditPasses, wastedSpend: WastedSpendBreakdown): string {
  const parts: string[] = [];

  // Waste assessment
  if (pulseMetrics.wasteRate > 20) {
    parts.push(`${pulseMetrics.wasteRate.toFixed(0)}% of spend is going to waste — this is the top priority.`);
  } else if (pulseMetrics.wasteRate > 10) {
    parts.push(`${pulseMetrics.wasteRate.toFixed(0)}% waste rate — meaningful savings available by cutting non-converting keywords and search terms.`);
  } else if (pulseMetrics.wasteRate > 5) {
    parts.push(`Waste rate is a manageable ${pulseMetrics.wasteRate.toFixed(0)}%.`);
  } else {
    parts.push(`Spend is efficient with only ${pulseMetrics.wasteRate.toFixed(0)}% waste.`);
  }

  // Demand captured
  if (pulseMetrics.demandCaptured !== null) {
    if (pulseMetrics.demandCaptured < 40) {
      parts.push(`Only capturing ${pulseMetrics.demandCaptured.toFixed(0)}% of available demand — significant room to scale.`);
    } else if (pulseMetrics.demandCaptured < 60) {
      parts.push(`Capturing ${pulseMetrics.demandCaptured.toFixed(0)}% of demand — room to grow with more budget or better Ad Rank.`);
    } else {
      parts.push(`Strong market coverage at ${pulseMetrics.demandCaptured.toFixed(0)}% demand captured.`);
    }
  }

  // Biggest opportunity — pick from first non-empty pass
  const biggestItem = passes.stopWasting[0] ?? passes.captureMore[0] ?? passes.fixFundamentals[0];
  if (biggestItem && wastedSpend.total > 0) {
    parts.push(`Biggest opportunity: ~$${wastedSpend.annualized.toFixed(0)}/year in recoverable spend.`);
  }

  return parts.join(" ");
}

// ─── Main Entry ─────────────────────────────────────────────────────

const DIMENSIONS: Array<{ key: string; label: string; weight: number; scorer: (input: AuditInput) => Omit<DimensionScore, "key" | "label" | "weight"> }> = [
  { key: "conversion_tracking", label: "Conversion Tracking", weight: 0.16, scorer: scoreConversionTracking },
  { key: "campaign_structure", label: "Campaign Structure", weight: 0.10, scorer: scoreCampaignStructure },
  { key: "keyword_health", label: "Keyword Health", weight: 0.16, scorer: scoreKeywordHealth },
  { key: "search_term_quality", label: "Search Term Quality", weight: 0.12, scorer: scoreSearchTermQuality },
  { key: "ad_copy", label: "Ad Copy", weight: 0.08, scorer: scoreAdCopy },
  { key: "bidding_strategy", label: "Bidding Strategy", weight: 0.10, scorer: scoreBiddingStrategy },
  { key: "impression_share", label: "Impression Share", weight: 0.10, scorer: scoreImpressionShare },
  { key: "spend_efficiency", label: "Spend Efficiency", weight: 0.10, scorer: scoreSpendEfficiency },
  { key: "landing_page_quality", label: "Landing Page Quality", weight: 0.08, scorer: scoreLandingPageQuality },
];

function overallCategory(score: number): AuditResult["category"] {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 50) return "OK";
  if (score >= 30) return "Needs Work";
  return "Critical";
}

export function computeAuditScore(input: AuditInput): AuditResult {
  const dimensions = DIMENSIONS.map((d) => {
    const result = d.scorer(input);
    return { key: d.key, label: d.label, weight: d.weight, ...result };
  });

  // Weighted sum: each dimension 0-5, weights sum to 1.0
  const weightedSum = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
  const overallScore = Math.round((weightedSum / 5) * 100);
  const clampedScore = Math.max(0, Math.min(100, overallScore));

  const totalSpend = input.campaigns.reduce((s, c) => s + c.cost, 0);
  const totalConversions = input.campaigns.reduce((s, c) => s + c.conversions, 0);
  const topCampaign = input.campaigns.length > 0
    ? [...input.campaigns].sort((a, b) => b.cost - a.cost)[0]
    : null;

  const wastedSpend = computeWastedSpend(input);

  const { avgCtr: accountAvgCtr, avgCpc: accountAvgCpc, activeKeywordTexts } = computeAccountMetrics(input);

  const wastedSearchTerms = input.searchTerms
    .filter((t) => t.conversions === 0 && t.cost > 0)
    .map((t) => analyzeSearchTermWaste(t, activeKeywordTexts, accountAvgCtr, accountAvgCpc))
    .filter((r) => r.classification === "confirmed_waste" || r.classification === "likely_waste")
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const zeroCvCampaigns = input.campaigns
    .filter((c) => isEnabled(c.status) && c.cost > 20 && c.clicks > 20 && c.conversions === 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name, cost: c.cost, clicks: c.clicks }));

  const impressionShareDiagnosis = computeISDiagnosis(input);
  const topActions = computeTopActions(input);
  const pulseMetrics = computePulseMetrics(input, wastedSpend, totalSpend, totalConversions);
  const passes = computePasses(input, topActions, impressionShareDiagnosis, dimensions);
  const verdict = computeVerdict(pulseMetrics, passes, wastedSpend);

  return {
    overallScore: clampedScore,
    category: overallCategory(clampedScore),
    dimensions,
    wastedSpend,
    impressionShareDiagnosis,
    topActions,
    keyNumbers: {
      totalSpend,
      conversions: totalConversions,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
      topCampaign: topCampaign?.name ?? null,
      wastedSpend: wastedSpend.total,
    },
    wastedSearchTerms,
    zeroCvCampaigns,
    pulseMetrics,
    passes,
    verdict,
  };
}
