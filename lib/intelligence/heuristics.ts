/**
 * Heuristics Engine — Phase 1 Intelligence API
 *
 * 8 rule-based heuristics that analyze Google Ads account data
 * and produce ranked recommendations with estimated impact.
 *
 * Each rule:
 *   INPUT:  campaign/keyword/search term data + user goals
 *   OUTPUT: Recommendation[] (or empty if rule doesn't trigger)
 *
 * Thresholds are configurable via goals. Defaults are calibrated
 * for a $100K/year local service business.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type Recommendation = {
  action: string;
  target: {
    type: "keyword" | "search_term" | "campaign";
    id: string;
    name: string;
    campaignName?: string;
    adGroupName?: string;
  };
  reasoning: string;
  estimatedMonthlySavings: number;
  confidence: "high" | "medium" | "low";
  priority: number;
  ruleId: number;
};

export type KeywordData = {
  criterionId: string;
  text: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  status: string;
  qualityScore: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;        // in dollars, 30-day
  averageCpc: number;  // in dollars
  conversions: number;
};

export type SearchTermData = {
  searchTerm: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  occurrences: number; // how many times this term appeared
};

export type CampaignData = {
  id: string;
  name: string;
  status: string;
  biddingStrategy: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  dailyBudget: number; // in dollars
  isHittingBudget: boolean;
};

export type Goals = {
  targetCpa?: number;      // in dollars
  monthlyCap?: number;
  minImpressions?: number; // minimum impressions to consider data reliable
};

export const DEFAULT_GOALS: Goals = {
  targetCpa: undefined,
  minImpressions: 100,
};

// ─── Heuristic Rules ─────────────────────────────────────────────────

/** Rule 1: Wasteful keyword — high spend, zero conversions */
export function findWastefulKeywords(
  keywords: KeywordData[],
  spendThreshold = 50,
): Recommendation[] {
  return keywords
    .filter(
      (k) =>
        k.status === "ENABLED" &&
        k.cost > spendThreshold &&
        k.conversions === 0 &&
        k.impressions >= 100,
    )
    .map((k) => ({
      action: "pause_keyword",
      target: {
        type: "keyword" as const,
        id: k.criterionId,
        name: k.text,
        campaignName: k.campaignName,
        adGroupName: k.adGroupName,
      },
      reasoning: `Spent $${k.cost.toFixed(2)} in 30 days with 0 conversions (${k.clicks} clicks, ${k.impressions} impressions)`,
      estimatedMonthlySavings: k.cost,
      confidence: "high" as const,
      priority: 1,
      ruleId: 1,
    }))
    .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
}

/** Rule 2: Irrelevant search term — clicks but no conversions, appears 3+ times */
export function findIrrelevantSearchTerms(
  searchTerms: SearchTermData[],
  minOccurrences = 3,
): Recommendation[] {
  return searchTerms
    .filter(
      (st) =>
        st.conversions === 0 &&
        st.clicks > 0 &&
        st.occurrences >= minOccurrences,
    )
    .map((st) => ({
      action: "add_negative_keyword",
      target: {
        type: "search_term" as const,
        id: st.searchTerm,
        name: st.searchTerm,
        campaignName: st.campaignName,
        adGroupName: st.adGroupName,
      },
      reasoning: `Search term "${st.searchTerm}" triggered ${st.clicks} clicks with 0 conversions, costing $${st.cost.toFixed(2)} (appeared ${st.occurrences} times)`,
      estimatedMonthlySavings: st.cost,
      confidence: "high" as const,
      priority: 2,
      ruleId: 2,
    }))
    .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
}

/** Rule 3: CPA above target — campaign CPA > 1.5x target for 7+ days */
export function findHighCpaCampaigns(
  campaigns: CampaignData[],
  targetCpa?: number,
): Recommendation[] {
  if (!targetCpa) return [];

  return campaigns
    .filter((c) => {
      if (c.conversions === 0) return false;
      const cpa = c.cost / c.conversions;
      return cpa > targetCpa * 1.5;
    })
    .map((c) => {
      const cpa = c.cost / c.conversions;
      const excess = (cpa - targetCpa) * c.conversions;
      return {
        action: "review_campaign",
        target: {
          type: "campaign" as const,
          id: c.id,
          name: c.name,
        },
        reasoning: `CPA is $${cpa.toFixed(2)}, which is ${((cpa / targetCpa - 1) * 100).toFixed(0)}% above target CPA of $${targetCpa.toFixed(2)}. Consider reducing budget or reviewing keywords.`,
        estimatedMonthlySavings: excess,
        confidence: "medium" as const,
        priority: 3,
        ruleId: 3,
      };
    })
    .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
}

/** Rule 4: Low quality score — QS <= 3 and spending money */
export function findLowQualityKeywords(
  keywords: KeywordData[],
  maxQualityScore = 3,
  minSpend = 20,
): Recommendation[] {
  return keywords
    .filter(
      (k) =>
        k.status === "ENABLED" &&
        k.qualityScore !== null &&
        k.qualityScore <= maxQualityScore &&
        k.cost > minSpend,
    )
    .map((k) => ({
      action: "review_keyword",
      target: {
        type: "keyword" as const,
        id: k.criterionId,
        name: k.text,
        campaignName: k.campaignName,
        adGroupName: k.adGroupName,
      },
      reasoning: `Quality score is ${k.qualityScore}/10 with $${k.cost.toFixed(2)} spend. Low QS means higher CPC and worse ad positions. Consider improving ad relevance or pausing.`,
      estimatedMonthlySavings: k.cost * 0.3, // estimate 30% savings from QS improvement
      confidence: "medium" as const,
      priority: 4,
      ruleId: 4,
    }))
    .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
}

/** Rule 5: Budget-limited winner — hitting daily budget with CPA below target */
export function findBudgetLimitedWinners(
  campaigns: CampaignData[],
  targetCpa?: number,
): Recommendation[] {
  if (!targetCpa) return [];

  return campaigns
    .filter((c) => {
      if (c.conversions === 0) return false;
      const cpa = c.cost / c.conversions;
      return c.isHittingBudget && cpa < targetCpa;
    })
    .map((c) => {
      const cpa = c.cost / c.conversions;
      const headroom = targetCpa - cpa;
      const projectedExtraConversions = (c.dailyBudget * 0.2) / cpa; // 20% budget increase
      return {
        action: "increase_budget",
        target: {
          type: "campaign" as const,
          id: c.id,
          name: c.name,
        },
        reasoning: `Campaign is hitting daily budget ($${c.dailyBudget.toFixed(2)}/day) with CPA of $${cpa.toFixed(2)} (below target of $${targetCpa.toFixed(2)}). Increasing budget could capture ~${projectedExtraConversions.toFixed(0)} more conversions/month.`,
        estimatedMonthlySavings: -(projectedExtraConversions * cpa), // negative = investment
        confidence: "medium" as const,
        priority: 5,
        ruleId: 5,
      };
    });
}

/** Rule 6: Declining CTR — keyword CTR dropped > 30% vs prior period */
export function findDecliningCtr(
  keywords: KeywordData[],
  priorKeywords: KeywordData[],
  declineThreshold = 0.30,
): Recommendation[] {
  const priorMap = new Map(priorKeywords.map((k) => [k.criterionId, k]));

  return keywords
    .filter((k) => {
      const prior = priorMap.get(k.criterionId);
      if (!prior || prior.ctr === 0 || k.impressions < 100) return false;
      const decline = (prior.ctr - k.ctr) / prior.ctr;
      return decline > declineThreshold;
    })
    .map((k) => {
      const prior = priorMap.get(k.criterionId)!;
      const decline = ((prior.ctr - k.ctr) / prior.ctr) * 100;
      return {
        action: "review_ad_copy",
        target: {
          type: "keyword" as const,
          id: k.criterionId,
          name: k.text,
          campaignName: k.campaignName,
          adGroupName: k.adGroupName,
        },
        reasoning: `CTR dropped ${decline.toFixed(0)}% (from ${(prior.ctr * 100).toFixed(2)}% to ${(k.ctr * 100).toFixed(2)}%). Ad copy may need refreshing.`,
        estimatedMonthlySavings: k.cost * 0.1,
        confidence: "low" as const,
        priority: 6,
        ruleId: 6,
      };
    });
}

/** Rule 7: Zero-impression keyword — enabled but getting no traffic */
export function findZeroImpressionKeywords(
  keywords: KeywordData[],
): Recommendation[] {
  return keywords
    .filter((k) => k.status === "ENABLED" && k.impressions === 0)
    .map((k) => ({
      action: "review_keyword",
      target: {
        type: "keyword" as const,
        id: k.criterionId,
        name: k.text,
        campaignName: k.campaignName,
        adGroupName: k.adGroupName,
      },
      reasoning: `Keyword "${k.text}" has 0 impressions in 30 days despite being enabled. May need different match type, higher bid, or removal.`,
      estimatedMonthlySavings: 0,
      confidence: "low" as const,
      priority: 7,
      ruleId: 7,
    }));
}

/** Rule 8: High CPC outlier — CPC > 2x campaign average with below-avg conversion rate */
export function findHighCpcOutliers(
  keywords: KeywordData[],
  campaignAvgCpc: number,
): Recommendation[] {
  if (campaignAvgCpc === 0) return [];

  const campaignAvgConvRate =
    keywords.reduce((sum, k) => sum + k.conversions, 0) /
    Math.max(keywords.reduce((sum, k) => sum + k.clicks, 0), 1);

  return keywords
    .filter((k) => {
      if (k.clicks === 0 || k.impressions < 100) return false;
      const convRate = k.conversions / k.clicks;
      return k.averageCpc > campaignAvgCpc * 2 && convRate < campaignAvgConvRate;
    })
    .map((k) => {
      const savings = (k.averageCpc - campaignAvgCpc) * k.clicks;
      return {
        action: "reduce_bid",
        target: {
          type: "keyword" as const,
          id: k.criterionId,
          name: k.text,
          campaignName: k.campaignName,
          adGroupName: k.adGroupName,
        },
        reasoning: `CPC of $${k.averageCpc.toFixed(2)} is ${(k.averageCpc / campaignAvgCpc).toFixed(1)}x the campaign average ($${campaignAvgCpc.toFixed(2)}) with below-average conversion rate. Consider reducing bid.`,
        estimatedMonthlySavings: savings,
        confidence: "medium" as const,
        priority: 8,
        ruleId: 8,
      };
    })
    .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
}

// ─── Engine ──────────────────────────────────────────────────────────

export type AccountData = {
  keywords: KeywordData[];
  priorKeywords?: KeywordData[]; // prior period for trend comparison
  searchTerms: SearchTermData[];
  campaigns: CampaignData[];
  campaignAvgCpc: number;
};

export function getRecommendations(
  data: AccountData,
  goals: Goals = DEFAULT_GOALS,
): Recommendation[] {
  const all: Recommendation[] = [
    ...findWastefulKeywords(data.keywords),
    ...findIrrelevantSearchTerms(data.searchTerms),
    ...findHighCpaCampaigns(data.campaigns, goals.targetCpa),
    ...findLowQualityKeywords(data.keywords),
    ...findBudgetLimitedWinners(data.campaigns, goals.targetCpa),
    ...findDecliningCtr(data.keywords, data.priorKeywords ?? []),
    ...findZeroImpressionKeywords(data.keywords),
    ...findHighCpcOutliers(data.keywords, data.campaignAvgCpc),
  ];

  // Sort by priority (lower = higher priority), then by savings
  return all.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.estimatedMonthlySavings - a.estimatedMonthlySavings;
  });
}
