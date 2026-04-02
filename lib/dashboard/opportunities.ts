/**
 * Opportunity Detection Engine
 *
 * Surfaces growth potential ranked by estimated impact.
 * Opportunity types:
 *   - Impression share headroom (losing IS to budget or rank)
 *   - High-performing keywords that could get more budget
 *   - Filtered Google recommendations
 */

export type Opportunity = {
  id: string;
  type: "impression_share" | "budget_headroom" | "recommendation";
  title: string;
  description: string;
  estimatedImpact: string; // human-readable, e.g. "+200 impressions/day"
  action: OpportunityAction | null;
};

export type OpportunityAction =
  | {
      type: "increase_budget";
      campaignId: string;
      currentBudget: number;
      suggestedBudget: number;
    }
  | {
      type: "view_recommendation";
      campaignId: string;
      recommendationType: string;
    };

export type ImpressionShareData = {
  campaignId: string;
  campaignName: string;
  impressionShare: number | null;
  budgetLostIS: number | null;
  rankLostIS: number | null;
  totalImpressions: number;
  totalCost: number;
};

export type RecommendationData = {
  type: string;
  campaignId: string | null;
};

export function detectOpportunities(data: {
  impressionShare: ImpressionShareData[];
  recommendations: RecommendationData[];
}): Opportunity[] {
  const opps: Opportunity[] = [];

  // 1. Impression share headroom
  for (const is of data.impressionShare) {
    if (is.budgetLostIS !== null && is.budgetLostIS > 0.1) {
      const lostPct = Math.round(is.budgetLostIS * 100);
      const potentialImpressions = Math.round(
        is.totalImpressions * (is.budgetLostIS / Math.max(is.impressionShare ?? 0.5, 0.01)),
      );

      opps.push({
        id: `is-budget-${is.campaignId}`,
        type: "impression_share",
        title: `Missing ${lostPct}% of searches in ${is.campaignName}`,
        description: `Budget runs out before all searches are served. Increasing budget could capture ~${potentialImpressions.toLocaleString()} more impressions.`,
        estimatedImpact: `+${potentialImpressions.toLocaleString()} impressions`,
        action: {
          type: "increase_budget",
          campaignId: is.campaignId,
          currentBudget: is.totalCost / 30, // rough daily budget estimate
          suggestedBudget: (is.totalCost / 30) * 1.15, // 15% increase
        },
      });
    }

    if (is.rankLostIS !== null && is.rankLostIS > 0.2) {
      const lostPct = Math.round(is.rankLostIS * 100);
      opps.push({
        id: `is-rank-${is.campaignId}`,
        type: "impression_share",
        title: `Losing ${lostPct}% of searches to ad rank in ${is.campaignName}`,
        description: `Competitors are outbidding or have better quality scores. Improving quality scores or adjusting bids may help.`,
        estimatedImpact: `${lostPct}% impression share recovery potential`,
        action: null, // rank issues need investigation, not a simple button
      });
    }
  }

  // 2. Google recommendations (filtered and reframed)
  for (const rec of data.recommendations) {
    opps.push({
      id: `rec-${rec.type}-${rec.campaignId ?? "all"}`,
      type: "recommendation",
      title: formatRecommendationType(rec.type),
      description: `Google suggests this could improve performance. Review carefully — Google's incentives may not align with yours.`,
      estimatedImpact: "Review recommended",
      action: rec.campaignId
        ? {
            type: "view_recommendation",
            campaignId: rec.campaignId,
            recommendationType: rec.type,
          }
        : null,
    });
  }

  return opps;
}

function formatRecommendationType(type: string | number): string {
  return String(type)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
