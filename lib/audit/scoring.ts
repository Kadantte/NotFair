/**
 * Google Ads Account Audit — Scoring Engine
 *
 * 7 dimensions scored 0-5, weighted to a 0-100 overall score.
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
  }>;
  keywords: Array<{
    criterionId: string;
    adGroupId?: string;
    text: string;
    qualityScore: number | null;
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
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    adGroupId: string;
    adGroupName: string;
    status: number | string;
  }>;
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
};

export type ImpressionShareDiagnosis = {
  avgIS: number | null;
  budgetLost: number | null;
  rankLost: number | null;
  diagnosis: string;
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
  wastedSearchTerms: Array<{
    searchTerm: string;
    cost: number;
    clicks: number;
    campaignName: string;
    campaignId: string;
    adGroupName: string;
  }>;
  zeroCvCampaigns: Array<{
    id: string;
    name: string;
    cost: number;
    clicks: number;
  }>;
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

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: avgQS !== null
      ? `Avg QS ${avgQS.toFixed(1)}, ${zombies.length} zombie keywords, ${(zombiePct * 100).toFixed(0)}% zero-impression`
      : `${enabled.length} keywords, ${zombies.length} with zero impressions — QS data not yet available`,
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
  }

  const s = clamp05(score);
  return {
    score: s,
    status: scoreToStatus(s),
    finding: rsas.length > 0
      ? `${rsas.length} RSA(s), ${allHeadlines.size} unique headlines, ${rsaPerAg.toFixed(1)} RSAs per ad group`
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

  // Wasted search term spend (0 conversions)
  const wastedST = searchTerms.filter((t) => t.conversions === 0 && t.clicks > 0);
  const wastedSTSpend = wastedST.reduce((s, t) => s + t.cost, 0);

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
  const totalSpend = input.campaigns.reduce((s, c) => s + c.cost, 0);

  // Non-converting keywords with >10 clicks
  const wastedKw = input.keywords.filter((k) => k.conversions === 0 && k.clicks > 10);
  const kwAmount = wastedKw.reduce((s, k) => s + k.cost, 0);
  const kwItems = wastedKw
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map((k) => `"${k.text}": $${k.cost.toFixed(2)} (${k.clicks} clicks, 0 conv)`);

  // Irrelevant search terms
  const wastedST = input.searchTerms.filter((t) => t.conversions === 0 && t.clicks > 0);
  const stAmount = wastedST.reduce((s, t) => s + t.cost, 0);
  const stItems = wastedST
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map((t) => `"${t.searchTerm}": $${t.cost.toFixed(2)} (${t.clicks} clicks)`);

  const total = kwAmount + stAmount;

  return {
    total,
    pct: totalSpend > 0 ? total / totalSpend : 0,
    annualized: total * 12,
    categories: [
      { label: "Non-converting keywords", amount: kwAmount, items: kwItems },
      { label: "Irrelevant search terms", amount: stAmount, items: stItems },
    ].filter((c) => c.amount > 0),
  };
}

// ─── Impression Share Diagnosis ─────────────────────────────────────

function computeISDiagnosis(input: AuditInput): ImpressionShareDiagnosis {
  const withData = input.impressionShare.filter((is) => is.impressionShare !== null);
  if (withData.length === 0) {
    return { avgIS: null, budgetLost: null, rankLost: null, diagnosis: "No impression share data available." };
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

  return { avgIS, budgetLost, rankLost, diagnosis };
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

// ─── Main Entry ─────────────────────────────────────────────────────

const DIMENSIONS: Array<{ key: string; label: string; weight: number; scorer: (input: AuditInput) => Omit<DimensionScore, "key" | "label" | "weight"> }> = [
  { key: "conversion_tracking", label: "Conversion Tracking", weight: 0.20, scorer: scoreConversionTracking },
  { key: "campaign_structure", label: "Campaign Structure", weight: 0.15, scorer: scoreCampaignStructure },
  { key: "keyword_health", label: "Keyword Health", weight: 0.20, scorer: scoreKeywordHealth },
  { key: "search_term_quality", label: "Search Term Quality", weight: 0.15, scorer: scoreSearchTermQuality },
  { key: "ad_copy", label: "Ad Copy", weight: 0.10, scorer: scoreAdCopy },
  { key: "impression_share", label: "Impression Share", weight: 0.10, scorer: scoreImpressionShare },
  { key: "spend_efficiency", label: "Spend Efficiency", weight: 0.10, scorer: scoreSpendEfficiency },
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

  const wastedSearchTerms = input.searchTerms
    .filter((t) => t.conversions === 0 && t.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10)
    .map((t) => ({
      searchTerm: t.searchTerm,
      cost: t.cost,
      clicks: t.clicks,
      campaignName: t.campaignName,
      campaignId: t.campaignId,
      adGroupName: t.adGroupName,
    }));

  const zeroCvCampaigns = input.campaigns
    .filter((c) => isEnabled(c.status) && c.cost > 20 && c.clicks > 20 && c.conversions === 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name, cost: c.cost, clicks: c.clicks }));

  return {
    overallScore: clampedScore,
    category: overallCategory(clampedScore),
    dimensions,
    wastedSpend,
    impressionShareDiagnosis: computeISDiagnosis(input),
    topActions: computeTopActions(input),
    keyNumbers: {
      totalSpend,
      conversions: totalConversions,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
      topCampaign: topCampaign?.name ?? null,
      wastedSpend: wastedSpend.total,
    },
    wastedSearchTerms,
    zeroCvCampaigns,
  };
}
