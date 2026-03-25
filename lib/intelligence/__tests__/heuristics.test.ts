import { describe, it, expect } from "vitest";
import {
  findWastefulKeywords,
  findIrrelevantSearchTerms,
  findHighCpaCampaigns,
  findLowQualityKeywords,
  findBudgetLimitedWinners,
  findDecliningCtr,
  findZeroImpressionKeywords,
  findHighCpcOutliers,
  getRecommendations,
  type KeywordData,
  type SearchTermData,
  type CampaignData,
} from "../heuristics";

// ─── Test Fixtures ───────────────────────────────────────────────────

function makeKeyword(overrides: Partial<KeywordData> = {}): KeywordData {
  return {
    criterionId: "1001",
    text: "pet hotel near me",
    adGroupName: "Pet Hotel",
    campaignId: "100",
    campaignName: "Pet Hotel Campaign",
    status: "ENABLED",
    qualityScore: 7,
    impressions: 500,
    clicks: 20,
    ctr: 0.04,
    cost: 40,
    averageCpc: 2.0,
    conversions: 3,
    ...overrides,
  };
}

function makeSearchTerm(overrides: Partial<SearchTermData> = {}): SearchTermData {
  return {
    searchTerm: "free pet sitting",
    campaignId: "100",
    campaignName: "Pet Hotel Campaign",
    adGroupName: "Pet Hotel",
    impressions: 100,
    clicks: 5,
    cost: 10,
    conversions: 0,
    occurrences: 5,
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<CampaignData> = {}): CampaignData {
  return {
    id: "100",
    name: "Pet Hotel Campaign",
    status: "ENABLED",
    biddingStrategy: "MANUAL_CPC",
    impressions: 5000,
    clicks: 200,
    cost: 500,
    conversions: 10,
    dailyBudget: 20,
    isHittingBudget: false,
    ...overrides,
  };
}

// ─── Rule 1: Wasteful Keywords ───────────────────────────────────────

describe("Rule 1: findWastefulKeywords", () => {
  it("flags keyword with high spend and zero conversions", () => {
    const keywords = [makeKeyword({ cost: 80, conversions: 0 })];
    const results = findWastefulKeywords(keywords);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("pause_keyword");
    expect(results[0].estimatedMonthlySavings).toBe(80);
    expect(results[0].confidence).toBe("high");
  });

  it("does NOT flag keyword with conversions", () => {
    const keywords = [makeKeyword({ cost: 80, conversions: 2 })];
    expect(findWastefulKeywords(keywords)).toHaveLength(0);
  });

  it("does NOT flag keyword below spend threshold", () => {
    const keywords = [makeKeyword({ cost: 30, conversions: 0 })];
    expect(findWastefulKeywords(keywords)).toHaveLength(0);
  });

  it("does NOT flag keyword with low impressions (unreliable data)", () => {
    const keywords = [makeKeyword({ cost: 80, conversions: 0, impressions: 50 })];
    expect(findWastefulKeywords(keywords)).toHaveLength(0);
  });

  it("does NOT flag paused keywords", () => {
    const keywords = [makeKeyword({ cost: 80, conversions: 0, status: "PAUSED" })];
    expect(findWastefulKeywords(keywords)).toHaveLength(0);
  });

  it("sorts by savings descending", () => {
    const keywords = [
      makeKeyword({ criterionId: "a", cost: 50, conversions: 0 }),
      makeKeyword({ criterionId: "b", cost: 100, conversions: 0 }),
    ];
    const results = findWastefulKeywords(keywords);
    expect(results[0].estimatedMonthlySavings).toBe(100);
  });

  it("respects custom spend threshold", () => {
    const keywords = [makeKeyword({ cost: 30, conversions: 0 })];
    expect(findWastefulKeywords(keywords, 25)).toHaveLength(1);
    expect(findWastefulKeywords(keywords, 50)).toHaveLength(0);
  });
});

// ─── Rule 2: Irrelevant Search Terms ─────────────────────────────────

describe("Rule 2: findIrrelevantSearchTerms", () => {
  it("flags search term with clicks, no conversions, 3+ occurrences", () => {
    const terms = [makeSearchTerm()];
    const results = findIrrelevantSearchTerms(terms);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("add_negative_keyword");
  });

  it("does NOT flag term with conversions", () => {
    const terms = [makeSearchTerm({ conversions: 1 })];
    expect(findIrrelevantSearchTerms(terms)).toHaveLength(0);
  });

  it("does NOT flag term with fewer than 3 occurrences", () => {
    const terms = [makeSearchTerm({ occurrences: 2 })];
    expect(findIrrelevantSearchTerms(terms)).toHaveLength(0);
  });

  it("does NOT flag term with zero clicks", () => {
    const terms = [makeSearchTerm({ clicks: 0 })];
    expect(findIrrelevantSearchTerms(terms)).toHaveLength(0);
  });
});

// ─── Rule 3: High CPA Campaigns ─────────────────────────────────────

describe("Rule 3: findHighCpaCampaigns", () => {
  it("flags campaign with CPA > 1.5x target", () => {
    // CPA = 500/10 = $50, target = $30, 50 > 30*1.5=45 → trigger
    const campaigns = [makeCampaign({ cost: 500, conversions: 10 })];
    const results = findHighCpaCampaigns(campaigns, 30);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("review_campaign");
  });

  it("does NOT flag campaign with CPA below 1.5x target", () => {
    // CPA = 500/10 = $50, target = $40, 50 < 40*1.5=60 → no trigger
    const campaigns = [makeCampaign({ cost: 500, conversions: 10 })];
    expect(findHighCpaCampaigns(campaigns, 40)).toHaveLength(0);
  });

  it("returns empty when no target CPA set", () => {
    const campaigns = [makeCampaign()];
    expect(findHighCpaCampaigns(campaigns, undefined)).toHaveLength(0);
  });

  it("skips campaigns with zero conversions", () => {
    const campaigns = [makeCampaign({ conversions: 0 })];
    expect(findHighCpaCampaigns(campaigns, 30)).toHaveLength(0);
  });
});

// ─── Rule 4: Low Quality Score ───────────────────────────────────────

describe("Rule 4: findLowQualityKeywords", () => {
  it("flags keyword with QS <= 3 and spend > $20", () => {
    const keywords = [makeKeyword({ qualityScore: 2, cost: 30 })];
    const results = findLowQualityKeywords(keywords);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("review_keyword");
  });

  it("does NOT flag keyword with QS > 3", () => {
    const keywords = [makeKeyword({ qualityScore: 5, cost: 30 })];
    expect(findLowQualityKeywords(keywords)).toHaveLength(0);
  });

  it("does NOT flag keyword with null QS", () => {
    const keywords = [makeKeyword({ qualityScore: null, cost: 30 })];
    expect(findLowQualityKeywords(keywords)).toHaveLength(0);
  });

  it("does NOT flag keyword below spend threshold", () => {
    const keywords = [makeKeyword({ qualityScore: 2, cost: 10 })];
    expect(findLowQualityKeywords(keywords)).toHaveLength(0);
  });
});

// ─── Rule 5: Budget-Limited Winners ──────────────────────────────────

describe("Rule 5: findBudgetLimitedWinners", () => {
  it("flags campaign hitting budget with CPA below target", () => {
    // CPA = 500/10 = $50, target = $60
    const campaigns = [makeCampaign({ isHittingBudget: true, cost: 500, conversions: 10 })];
    const results = findBudgetLimitedWinners(campaigns, 60);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("increase_budget");
  });

  it("does NOT flag campaign not hitting budget", () => {
    const campaigns = [makeCampaign({ isHittingBudget: false })];
    expect(findBudgetLimitedWinners(campaigns, 60)).toHaveLength(0);
  });

  it("does NOT flag campaign with CPA above target", () => {
    const campaigns = [makeCampaign({ isHittingBudget: true, cost: 500, conversions: 5 })];
    // CPA = $100, target = $60
    expect(findBudgetLimitedWinners(campaigns, 60)).toHaveLength(0);
  });

  it("returns empty when no target CPA", () => {
    expect(findBudgetLimitedWinners([makeCampaign()], undefined)).toHaveLength(0);
  });
});

// ─── Rule 6: Declining CTR ──────────────────────────────────────────

describe("Rule 6: findDecliningCtr", () => {
  it("flags keyword with CTR drop > 30%", () => {
    const current = [makeKeyword({ ctr: 0.02, impressions: 200 })];
    const prior = [makeKeyword({ ctr: 0.04 })]; // 50% drop
    const results = findDecliningCtr(current, prior);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("review_ad_copy");
  });

  it("does NOT flag keyword with CTR drop <= 30%", () => {
    const current = [makeKeyword({ ctr: 0.035, impressions: 200 })];
    const prior = [makeKeyword({ ctr: 0.04 })]; // 12.5% drop
    expect(findDecliningCtr(current, prior)).toHaveLength(0);
  });

  it("does NOT flag keyword with no prior data", () => {
    const current = [makeKeyword({ ctr: 0.02 })];
    expect(findDecliningCtr(current, [])).toHaveLength(0);
  });

  it("does NOT flag keyword with low impressions", () => {
    const current = [makeKeyword({ ctr: 0.02, impressions: 50 })];
    const prior = [makeKeyword({ ctr: 0.04 })];
    expect(findDecliningCtr(current, prior)).toHaveLength(0);
  });
});

// ─── Rule 7: Zero Impression Keywords ────────────────────────────────

describe("Rule 7: findZeroImpressionKeywords", () => {
  it("flags enabled keyword with 0 impressions", () => {
    const keywords = [makeKeyword({ impressions: 0 })];
    const results = findZeroImpressionKeywords(keywords);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("review_keyword");
  });

  it("does NOT flag paused keyword with 0 impressions", () => {
    const keywords = [makeKeyword({ impressions: 0, status: "PAUSED" })];
    expect(findZeroImpressionKeywords(keywords)).toHaveLength(0);
  });

  it("does NOT flag keyword with impressions", () => {
    const keywords = [makeKeyword({ impressions: 100 })];
    expect(findZeroImpressionKeywords(keywords)).toHaveLength(0);
  });
});

// ─── Rule 8: High CPC Outliers ──────────────────────────────────────

describe("Rule 8: findHighCpcOutliers", () => {
  it("flags keyword with CPC > 2x average and below-avg conversion rate", () => {
    const keywords = [
      makeKeyword({ averageCpc: 5.0, clicks: 20, conversions: 0, impressions: 200 }),
      makeKeyword({ criterionId: "1002", averageCpc: 2.0, clicks: 50, conversions: 5, impressions: 500 }),
    ];
    const avgCpc = 2.0;
    const results = findHighCpcOutliers(keywords, avgCpc);
    expect(results).toHaveLength(1);
    expect(results[0].target.id).toBe("1001");
    expect(results[0].action).toBe("reduce_bid");
  });

  it("does NOT flag keyword with CPC <= 2x average", () => {
    const keywords = [makeKeyword({ averageCpc: 3.0, clicks: 20, conversions: 0 })];
    expect(findHighCpcOutliers(keywords, 2.0)).toHaveLength(0);
  });

  it("does NOT flag keyword with above-avg conversion rate", () => {
    const keywords = [
      makeKeyword({ averageCpc: 5.0, clicks: 20, conversions: 5, impressions: 200 }),
    ];
    expect(findHighCpcOutliers(keywords, 2.0)).toHaveLength(0);
  });

  it("returns empty when campaign avg CPC is 0", () => {
    const keywords = [makeKeyword()];
    expect(findHighCpcOutliers(keywords, 0)).toHaveLength(0);
  });
});

// ─── Engine: getRecommendations ──────────────────────────────────────

describe("getRecommendations (engine)", () => {
  it("returns empty array for clean account", () => {
    const data = {
      keywords: [makeKeyword()], // healthy keyword with conversions
      searchTerms: [],
      campaigns: [makeCampaign()],
      campaignAvgCpc: 2.0,
    };
    const results = getRecommendations(data);
    expect(results).toHaveLength(0);
  });

  it("combines results from multiple rules and sorts by priority", () => {
    const data = {
      keywords: [
        makeKeyword({ criterionId: "wasteful", cost: 100, conversions: 0 }), // Rule 1
        makeKeyword({ criterionId: "lowqs", qualityScore: 2, cost: 30 }),     // Rule 4
      ],
      searchTerms: [
        makeSearchTerm(), // Rule 2
      ],
      campaigns: [makeCampaign()],
      campaignAvgCpc: 2.0,
    };
    const results = getRecommendations(data);
    expect(results.length).toBeGreaterThanOrEqual(3);
    // Priority 1 (wasteful) should come first
    expect(results[0].ruleId).toBe(1);
  });

  it("respects targetCpa goal for rules 3 and 5", () => {
    const data = {
      keywords: [],
      searchTerms: [],
      campaigns: [makeCampaign({ cost: 500, conversions: 5 })], // CPA = $100
      campaignAvgCpc: 2.0,
    };
    // No target CPA → rules 3 and 5 should not trigger
    expect(getRecommendations(data).filter((r) => r.ruleId === 3)).toHaveLength(0);

    // With target CPA of $50 → rule 3 should trigger (CPA $100 > $50 * 1.5 = $75)
    expect(
      getRecommendations(data, { targetCpa: 50 }).filter((r) => r.ruleId === 3),
    ).toHaveLength(1);
  });
});
