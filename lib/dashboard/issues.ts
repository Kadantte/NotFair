/**
 * Issue Detection Engine
 *
 * Analyzes Google Ads data to surface active problems ranked by daily $ impact.
 * Issue types:
 *   - Wasted search terms: spend > $1/day with 0 conversions (30 days)
 *   - Low quality keywords: QS < 5 with significant spend
 *   - Declining campaigns: CPA increased >20% week-over-week
 */

export type Issue = {
  id: string;
  type: "wasted_search_terms" | "low_quality_keyword" | "declining_campaign";
  title: string;
  description: string;
  dailyImpact: number; // estimated daily $ cost of this issue
  severity: "high" | "medium" | "low";
  action: IssueAction;
};

export type IssueAction =
  | {
      type: "add_negatives";
      campaignId: string;
      terms: string[];
    }
  | {
      type: "pause_keyword";
      campaignId: string;
      adGroupId: string;
      criterionId: string;
      keywordText: string;
    }
  | {
      type: "review_campaign";
      campaignId: string;
      campaignName: string;
    };

export type SearchTermData = {
  searchTerm: string;
  campaignName: string;
  cost: number;
  conversions: number;
  clicks: number;
  impressions: number;
};

export type KeywordData = {
  criterionId: string;
  adGroupId: string;
  adGroupName: string;
  text: string;
  qualityScore: number | null;
  cost: number;
  conversions: number;
  impressions: number;
};

export type CampaignPerfData = {
  campaignId: string;
  campaignName: string;
  currentWeekCpa: number | null;
  previousWeekCpa: number | null;
  currentWeekCost: number;
};

export function detectIssues(data: {
  searchTermsByCampaign: Array<{ campaignId: string; campaignName: string; terms: SearchTermData[] }>;
  keywordsByCampaign: Array<{ campaignId: string; keywords: KeywordData[] }>;
  campaignPerf: CampaignPerfData[];
  days: number;
}): Issue[] {
  const issues: Issue[] = [];

  // 1. Wasted search terms (grouped by campaign)
  for (const { campaignId, campaignName, terms } of data.searchTermsByCampaign) {
    const wastedTerms = terms.filter(
      (t) => t.conversions === 0 && t.cost > 0,
    );

    if (wastedTerms.length === 0) continue;

    const totalWaste = wastedTerms.reduce((s, t) => s + t.cost, 0);
    const dailyWaste = totalWaste / Math.max(data.days, 1);

    if (dailyWaste < 1) continue; // below $1/day threshold

    const topTerms = wastedTerms
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    issues.push({
      id: `wasted-${campaignId}`,
      type: "wasted_search_terms",
      title: `${wastedTerms.length} irrelevant search terms`,
      description: `Spending $${dailyWaste.toFixed(0)}/day on search terms with zero conversions in ${campaignName}`,
      dailyImpact: dailyWaste,
      severity: dailyWaste >= 20 ? "high" : dailyWaste >= 5 ? "medium" : "low",
      action: {
        type: "add_negatives",
        campaignId,
        terms: topTerms.map((t) => t.searchTerm),
      },
    });
  }

  // 2. Low quality keywords
  for (const { campaignId, keywords } of data.keywordsByCampaign) {
    const lowQuality = keywords.filter(
      (k) => k.qualityScore !== null && k.qualityScore > 0 && k.qualityScore < 5 && k.cost > 0 && k.conversions === 0,
    );

    for (const kw of lowQuality) {
      const dailyCost = kw.cost / Math.max(data.days, 1);
      if (dailyCost < 1) continue;

      issues.push({
        id: `lowqs-${kw.criterionId}`,
        type: "low_quality_keyword",
        title: `Low quality keyword "${kw.text}"`,
        description: `Quality score ${kw.qualityScore}/10, costing $${dailyCost.toFixed(0)}/day with ${kw.conversions} conversions`,
        dailyImpact: dailyCost,
        severity: dailyCost >= 10 ? "high" : dailyCost >= 3 ? "medium" : "low",
        action: {
          type: "pause_keyword",
          campaignId,
          adGroupId: kw.adGroupId,
          criterionId: kw.criterionId,
          keywordText: kw.text,
        },
      });
    }
  }

  // 3. Declining campaigns (CPA spike >20% week-over-week)
  for (const camp of data.campaignPerf) {
    if (
      camp.currentWeekCpa === null ||
      camp.previousWeekCpa === null ||
      camp.previousWeekCpa === 0
    )
      continue;

    const cpaChange =
      (camp.currentWeekCpa - camp.previousWeekCpa) / camp.previousWeekCpa;
    if (cpaChange <= 0.2) continue;

    const dailyCostIncrease =
      (camp.currentWeekCpa - camp.previousWeekCpa) *
      (camp.currentWeekCost / Math.max(camp.currentWeekCpa, 0.01)) /
      7;

    issues.push({
      id: `declining-${camp.campaignId}`,
      type: "declining_campaign",
      title: `${camp.campaignName} CPA spiked ${Math.round(cpaChange * 100)}%`,
      description: `CPA went from $${camp.previousWeekCpa.toFixed(2)} to $${camp.currentWeekCpa.toFixed(2)} this week`,
      dailyImpact: Math.abs(dailyCostIncrease),
      severity: cpaChange >= 0.5 ? "high" : "medium",
      action: {
        type: "review_campaign",
        campaignId: camp.campaignId,
        campaignName: camp.campaignName,
      },
    });
  }

  // Sort by daily impact descending
  return issues.sort((a, b) => b.dailyImpact - a.dailyImpact);
}
