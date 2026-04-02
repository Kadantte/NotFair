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

export type WastedTerm = {
  searchTerm: string;
  cost: number;
  clicks: number;
  impressions: number;
  insight: string;
  /** Whether this term should be pre-selected for blocking. False for terms
   *  the system identifies as likely relevant (high CTR, local intent). */
  suggestBlock: boolean;
};

export type IssueAction =
  | {
      type: "add_negatives";
      campaignId: string;
      campaignName: string;
      terms: string[];
      termDetails: WastedTerm[];
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

const HIGH_CTR = 0.03;
const LOW_CTR = 0.01;
const EXPENSIVE_CPC = 5;
const MIN_CLICKS_FOR_INSIGHT = 10;
const LOW_INTENT_RE = /free|cheap|diy|how to|what is|reddit|review/;
const LOCAL_INTENT_RE = /near me|nearby|close to/;

function analyzeTermInsight(term: SearchTermData, days: number): { insight: string; suggestBlock: boolean } {
  const ctr = term.impressions > 0 ? term.clicks / term.impressions : 0;
  const cpc = term.clicks > 0 ? term.cost / term.clicks : 0;
  const dailySpend = term.cost / Math.max(days, 1);

  const isHighCtr = ctr >= HIGH_CTR;
  const isLowCtr = ctr < LOW_CTR;
  const isExpensiveCpc = cpc >= EXPENSIVE_CPC;
  const isLowClicks = term.clicks < MIN_CLICKS_FOR_INSIGHT;
  const termLower = term.searchTerm.toLowerCase();
  const hasLocalIntent = LOCAL_INTENT_RE.test(termLower);
  const hasLowIntent = LOW_INTENT_RE.test(termLower);

  // Low intent terms: safe to block
  if (hasLowIntent) {
    return {
      insight: `Low purchase intent — "${term.searchTerm}" suggests research, not buying. Likely attracting visitors who aren't ready to convert.`,
      suggestBlock: true,
    };
  }

  // High CTR terms: likely relevant, do NOT pre-select for blocking
  if (isHighCtr && !isLowClicks) {
    if (hasLocalIntent) {
      return {
        insight: `High-intent local search with ${(ctr * 100).toFixed(1)}% CTR — visitors are clicking but not converting. Check that your landing page shows location, hours, and a clear booking CTA.`,
        suggestBlock: false,
      };
    }
    return {
      insight: `Strong ad relevance (${(ctr * 100).toFixed(1)}% CTR) but no conversions — this is likely a landing page or conversion tracking issue, not a bad keyword.`,
      suggestBlock: false,
    };
  }

  // Low CTR: likely irrelevant, safe to block
  if (isLowCtr) {
    return {
      insight: `Low CTR (${(ctr * 100).toFixed(1)}%) suggests weak ad-to-search relevance. Broad match may be showing your ad to less relevant audiences.`,
      suggestBlock: true,
    };
  }

  if (isExpensiveCpc) {
    return {
      insight: `High CPC ($${cpc.toFixed(2)}) with no return — competitive keyword costing $${dailySpend.toFixed(0)}/day without converting. Consider if the bid is justified.`,
      suggestBlock: true,
    };
  }

  // Low clicks: not enough data, don't pre-select
  if (isLowClicks) {
    return {
      insight: `Only ${term.clicks} clicks — limited data to judge. May need more time or a landing page test before blocking.`,
      suggestBlock: false,
    };
  }

  return {
    insight: `${term.clicks} clicks over ${days} days with no conversions. Review landing page experience and ensure conversion tracking is firing correctly.`,
    suggestBlock: true,
  };
}

function generateCampaignInsight(terms: SearchTermData[]): string {
  const avgCtr = terms.reduce((s, t) => s + (t.impressions > 0 ? t.clicks / t.impressions : 0), 0) / Math.max(terms.length, 1);
  const highCtrCount = terms.filter((t) => t.impressions > 0 && t.clicks / t.impressions >= HIGH_CTR).length;
  const lowIntentCount = terms.filter((t) => LOW_INTENT_RE.test(t.searchTerm.toLowerCase())).length;

  if (lowIntentCount > terms.length / 2) {
    return `Most non-converting terms have low purchase intent — consider tightening match types or adding negatives for informational queries.`;
  }

  if (highCtrCount > terms.length / 2) {
    return `Most terms have good CTR, meaning your ads are relevant — the conversion gap likely points to a landing page issue or conversion tracking problem, not bad keywords.`;
  }

  if (avgCtr < LOW_CTR) {
    return `Low overall CTR suggests broad match is pulling in loosely related traffic. Review match types and consider switching high-spend terms to phrase or exact match.`;
  }

  return `Mixed signals across terms — review each individually. Some may need landing page work, others may be genuinely irrelevant.`;
}

export function detectIssues(data: {
  searchTermsByCampaign: Array<{ campaignId: string; campaignName: string; terms: SearchTermData[] }>;
  keywordsByCampaign: Array<{ campaignId: string; keywords: KeywordData[] }>;
  campaignPerf: CampaignPerfData[];
  days: number;
}): Issue[] {
  const issues: Issue[] = [];

  // 1. Non-converting search terms (grouped by campaign)
  // Only flag terms that have had enough clicks to judge — low-click terms
  // may just need more time. Threshold: >= 5 clicks with 0 conversions over the period.
  for (const { campaignId, campaignName, terms } of data.searchTermsByCampaign) {
    const nonConverting = terms.filter(
      (t) => t.conversions === 0 && t.cost > 0 && t.clicks >= 5,
    );

    if (nonConverting.length === 0) continue;

    const totalWaste = nonConverting.reduce((s, t) => s + t.cost, 0);
    const dailyWaste = totalWaste / Math.max(data.days, 1);

    if (dailyWaste < 1) continue; // below $1/day threshold

    const topTerms = nonConverting
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const campaignInsight = generateCampaignInsight(nonConverting);

    issues.push({
      id: `wasted-${campaignId}`,
      type: "wasted_search_terms",
      title: `${nonConverting.length} search terms not converting`,
      description: `$${dailyWaste.toFixed(0)}/day on terms with 5+ clicks but zero conversions in ${data.days} days. ${campaignInsight}`,
      dailyImpact: dailyWaste,
      severity: dailyWaste >= 20 ? "high" : dailyWaste >= 5 ? "medium" : "low",
      action: {
        type: "add_negatives",
        campaignId,
        campaignName,
        terms: topTerms.map((t) => t.searchTerm),
        termDetails: topTerms.map((t) => {
          const analysis = analyzeTermInsight(t, data.days);
          return {
            searchTerm: t.searchTerm,
            cost: t.cost,
            clicks: t.clicks,
            impressions: t.impressions,
            insight: analysis.insight,
            suggestBlock: analysis.suggestBlock,
          };
        }),
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
