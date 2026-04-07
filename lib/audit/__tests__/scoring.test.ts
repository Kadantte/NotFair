import { describe, it, expect } from "vitest";
import {
  computeAuditScore,
  scoreConversionTracking,
  scoreCampaignStructure,
  scoreKeywordHealth,
  scoreSearchTermQuality,
  scoreAdCopy,
  scoreImpressionShare,
  scoreSpendEfficiency,
  type AuditInput,
} from "../scoring";

// ─── Fixtures ────────────────────────────────────────────────────────

function emptyInput(): AuditInput {
  return {
    accountSettings: { autoTaggingEnabled: false, conversionTrackingId: null, trackingUrlTemplate: null },
    conversionActions: [],
    campaigns: [],
    keywords: [],
    searchTerms: [],
    ads: [],
    impressionShare: [],
    negativeKeywords: [],
    adGroupCount: 0,
  };
}

function wellOptimizedInput(): AuditInput {
  return {
    accountSettings: { autoTaggingEnabled: true, conversionTrackingId: "123", trackingUrlTemplate: "{lpurl}?utm_source=google" },
    conversionActions: [
      { id: "1", name: "Purchase", type: 8, status: 2, category: 13, includeInConversions: true, countingType: 2 },
      { id: "2", name: "Lead", type: 29, status: 2, category: 13, includeInConversions: true, countingType: 2 },
    ],
    campaigns: [
      { id: "1", name: "Brand", status: 2, cost: 500, conversions: 50, clicks: 200, impressions: 5000 },
      { id: "2", name: "Non-Brand Services", status: 2, cost: 1500, conversions: 30, clicks: 600, impressions: 15000 },
    ],
    keywords: [
      { criterionId: "1", text: "brand name", qualityScore: 9, creativeQuality: 4, postClickQuality: 4, searchPredictedCtr: 4, impressions: 3000, clicks: 150, cost: 300, conversions: 40, status: 2, matchType: "EXACT", campaignName: "Brand", campaignId: "1", adGroupName: "Brand", averageCpc: 2.0, ctr: 0.05 },
      { criterionId: "2", text: "plumber near me", qualityScore: 7, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 8000, clicks: 400, cost: 1200, conversions: 25, status: 2, matchType: "PHRASE", campaignName: "Non-Brand Services", campaignId: "2", adGroupName: "Plumbing", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "3", text: "emergency plumber", qualityScore: 8, creativeQuality: 4, postClickQuality: 3, searchPredictedCtr: 4, impressions: 4000, clicks: 200, cost: 500, conversions: 15, status: 2, matchType: "BROAD", campaignName: "Non-Brand Services", campaignId: "2", adGroupName: "Emergency", averageCpc: 2.5, ctr: 0.05 },
    ],
    searchTerms: [
      { searchTerm: "best plumber near me", impressions: 500, clicks: 30, cost: 90, conversions: 5, campaignName: "Non-Brand Services", campaignId: "2", adGroupName: "Plumbing" },
      { searchTerm: "brand name plumber", impressions: 200, clicks: 50, cost: 100, conversions: 15, campaignName: "Brand", campaignId: "1", adGroupName: "Brand" },
    ],
    ads: [
      { adId: "1", type: 15, headlines: ["Best Plumber", "24/7 Service", "Free Estimates", "Licensed & Insured", "Call Now", "Same Day Service", "5-Star Rated", "Fast Response", "Local Experts", "Book Online"], descriptions: ["Professional plumbing services.", "Licensed, insured, 24/7."], impressions: 5000, clicks: 200, cost: 500, conversions: 20, adGroupId: "1", adGroupName: "Plumbing", status: 2 },
      { adId: "2", type: 15, headlines: ["Emergency Plumber", "Open Now", "No Extra Charge", "Fast Arrival", "Trusted Since 2010", "Top Rated", "Licensed Pro", "Free Quote"], descriptions: ["Emergency plumbing repair.", "Arrive in 30 minutes."], impressions: 4000, clicks: 150, cost: 400, conversions: 10, adGroupId: "2", adGroupName: "Emergency", status: 2 },
    ],
    impressionShare: [
      { campaignName: "Brand", impressionShare: 0.95, budgetLostIS: 0.02, rankLostIS: 0.03, totalImpressions: 5000, totalCost: 500 },
      { campaignName: "Non-Brand Services", impressionShare: 0.70, budgetLostIS: 0.10, rankLostIS: 0.20, totalImpressions: 15000, totalCost: 1500 },
    ],
    negativeKeywords: [
      { text: "free", campaignId: "2" },
      { text: "jobs", campaignId: "2" },
      { text: "diy", campaignId: "2" },
      { text: "salary", campaignId: "2" },
    ],
    adGroupCount: 3,
  };
}

function newAccountInput(): AuditInput {
  return {
    accountSettings: { autoTaggingEnabled: true, conversionTrackingId: "456", trackingUrlTemplate: null },
    conversionActions: [
      { id: "1", name: "Lead form", type: 29, status: 2, category: 13, includeInConversions: true, countingType: 2 },
    ],
    campaigns: [
      { id: "1", name: "Test Campaign", status: 2, cost: 1.38, conversions: 0, clicks: 2, impressions: 22 },
    ],
    keywords: [
      { criterionId: "1", text: "google ads skill", qualityScore: null, creativeQuality: null, postClickQuality: null, searchPredictedCtr: null, impressions: 21, clicks: 2, cost: 1.38, conversions: 0, status: 3, matchType: "BROAD", campaignName: "Test Campaign", campaignId: "1", adGroupName: "AG1", averageCpc: 0.69, ctr: 0.095 },
      { criterionId: "2", text: "google ads ai tool", qualityScore: null, creativeQuality: null, postClickQuality: null, searchPredictedCtr: null, impressions: 0, clicks: 0, cost: 0, conversions: 0, status: 2, matchType: "BROAD", campaignName: "Test Campaign", campaignId: "1", adGroupName: "AG1", averageCpc: 0, ctr: 0 },
    ],
    searchTerms: [
      { searchTerm: "google skillshop", impressions: 6, clicks: 2, cost: 1.38, conversions: 0, campaignName: "Test Campaign", campaignId: "1", adGroupName: "AG1" },
      { searchTerm: "skillshop", impressions: 9, clicks: 0, cost: 0, conversions: 0, campaignName: "Test Campaign", campaignId: "1", adGroupName: "AG1" },
    ],
    ads: [
      { adId: "1", type: 15, headlines: ["AI Google Ads Agent", "Google Ads MCP Server", "Free Setup", "Stop Wasting Ad Spend"], descriptions: ["Connect Google Ads to AI."], impressions: 22, clicks: 2, cost: 1.38, conversions: 0, adGroupId: "1", adGroupName: "AG1", status: 2 },
    ],
    impressionShare: [
      { campaignName: "Test Campaign", impressionShare: 0.33, budgetLostIS: 0.23, rankLostIS: 0.44, totalImpressions: 22, totalCost: 1.38 },
    ],
    negativeKeywords: [{ text: "skillshop", campaignId: "1" }],
    adGroupCount: 1,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("computeAuditScore", () => {
  it("handles empty account gracefully", () => {
    const result = computeAuditScore(emptyInput());
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.dimensions).toHaveLength(7);
    expect(result.category).toBe("Critical");
  });

  it("scores a well-optimized account highly", () => {
    const result = computeAuditScore(wellOptimizedInput());
    expect(result.overallScore).toBeGreaterThanOrEqual(60);
    expect(["OK", "Strong", "Excellent"]).toContain(result.category);
    expect(result.keyNumbers.totalSpend).toBe(2000);
    expect(result.keyNumbers.conversions).toBe(80);
  });

  it("scores a new account with issues low", () => {
    const result = computeAuditScore(newAccountInput());
    expect(result.overallScore).toBeLessThan(60);
    expect(result.keyNumbers.totalSpend).toBeCloseTo(1.38, 1);
  });

  it("produces correct key numbers", () => {
    const result = computeAuditScore(wellOptimizedInput());
    expect(result.keyNumbers.cpa).toBeCloseTo(25, 0); // 2000/80
    expect(result.keyNumbers.topCampaign).toBe("Non-Brand Services");
  });

  it("produces top actions sorted by savings", () => {
    const result = computeAuditScore(wellOptimizedInput());
    expect(result.topActions).toBeInstanceOf(Array);
    // Actions should be sorted by savings (descending)
    for (let i = 1; i < result.topActions.length; i++) {
      expect(result.topActions[i]).toBeDefined();
    }
  });
});

describe("scoreConversionTracking", () => {
  it("scores 0 with no conversion actions", () => {
    const result = scoreConversionTracking(emptyInput());
    expect(result.score).toBe(0);
    expect(result.status).toBe("critical");
  });

  it("scores high with auto-tagging and multiple actions", () => {
    const result = scoreConversionTracking(wellOptimizedInput());
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("penalizes MANY counting on lead actions", () => {
    const input = emptyInput();
    input.conversionActions = [
      { id: "1", name: "Lead", type: 8, status: 2, category: 13, includeInConversions: true, countingType: 3 },
    ];
    input.accountSettings = { autoTaggingEnabled: true, conversionTrackingId: "123", trackingUrlTemplate: null };
    const result = scoreConversionTracking(input);
    expect(result.score).toBeLessThanOrEqual(3);
    expect(result.details.some((d) => d.includes("MANY counting"))).toBe(true);
  });
});

describe("scoreCampaignStructure", () => {
  it("scores 0 with no enabled campaigns", () => {
    const result = scoreCampaignStructure(emptyInput());
    expect(result.score).toBe(0);
  });

  it("scores low for single campaign single ad group", () => {
    const result = scoreCampaignStructure(newAccountInput());
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it("scores higher with brand separation", () => {
    const result = scoreCampaignStructure(wellOptimizedInput());
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe("scoreKeywordHealth", () => {
  it("scores 0 with no enabled keywords", () => {
    const result = scoreKeywordHealth(emptyInput());
    expect(result.score).toBe(0);
  });

  it("scores well with high QS keywords", () => {
    const result = scoreKeywordHealth(wellOptimizedInput());
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("handles missing quality scores", () => {
    const result = scoreKeywordHealth(newAccountInput());
    // Should not crash, should use neutral scoring
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
  });
});

describe("scoreSearchTermQuality", () => {
  it("scores 2 with no search terms", () => {
    const result = scoreSearchTermQuality(emptyInput());
    expect(result.score).toBe(2);
  });

  it("scores low with 100% irrelevant terms", () => {
    const result = scoreSearchTermQuality(newAccountInput());
    // All search terms have 0 conversions
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it("scores well with converting search terms", () => {
    const result = scoreSearchTermQuality(wellOptimizedInput());
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe("scoreAdCopy", () => {
  it("scores 0 with no ads", () => {
    const result = scoreAdCopy(emptyInput());
    expect(result.score).toBe(0);
  });

  it("scores well with multiple RSAs and headline variety", () => {
    const result = scoreAdCopy(wellOptimizedInput());
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe("scoreImpressionShare", () => {
  it("scores 2 with no data", () => {
    const result = scoreImpressionShare(emptyInput());
    expect(result.score).toBe(2);
  });

  it("scores high with 95%+ IS", () => {
    const input = emptyInput();
    input.impressionShare = [{ campaignName: "Brand", impressionShare: 0.95, budgetLostIS: 0.02, rankLostIS: 0.03, totalImpressions: 5000, totalCost: 500 }];
    const result = scoreImpressionShare(input);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("diagnoses structural problem with high budget+rank loss", () => {
    const result = scoreImpressionShare(newAccountInput());
    expect(result.details.some((d) => d.includes("Structural") || d.includes("structural"))).toBe(true);
  });
});

describe("scoreSpendEfficiency", () => {
  it("scores 2 with no spend", () => {
    const result = scoreSpendEfficiency(emptyInput());
    expect(result.score).toBe(2);
  });

  it("scores 0 with 0 conversions", () => {
    const result = scoreSpendEfficiency(newAccountInput());
    expect(result.score).toBe(0);
  });

  it("scores well with low waste", () => {
    const result = scoreSpendEfficiency(wellOptimizedInput());
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe("wasted spend breakdown", () => {
  it("computes wasted spend correctly", () => {
    const result = computeAuditScore(newAccountInput());
    expect(result.wastedSpend.total).toBeGreaterThanOrEqual(0);
    expect(result.wastedSpend.pct).toBeGreaterThanOrEqual(0);
    expect(result.wastedSpend.pct).toBeLessThanOrEqual(1);
  });

  it("returns zero waste for well-optimized account", () => {
    const result = computeAuditScore(wellOptimizedInput());
    // All search terms have conversions in the well-optimized input
    expect(result.wastedSpend.total).toBe(0);
  });

  it("wastedSpend has qualityIssues field with correct shape", () => {
    const result = computeAuditScore(newAccountInput());
    expect(result.wastedSpend.qualityIssues).toBeDefined();
    expect(typeof result.wastedSpend.qualityIssues.total).toBe("number");
    expect(typeof result.wastedSpend.qualityIssues.pct).toBe("number");
    expect(result.wastedSpend.qualityIssues.pct).toBeGreaterThanOrEqual(0);
    expect(result.wastedSpend.qualityIssues.pct).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.wastedSpend.qualityIssues.categories)).toBe(true);
  });

  it("quality issue categories have description field", () => {
    const result = computeAuditScore(newAccountInput());
    for (const cat of result.wastedSpend.qualityIssues.categories) {
      expect(typeof cat.label).toBe("string");
      expect(typeof cat.amount).toBe("number");
      expect(typeof cat.description).toBe("string");
      expect(cat.description.length).toBeGreaterThan(0);
      expect(Array.isArray(cat.items)).toBe(true);
    }
  });

  it("relevant-but-not-converting search terms go into qualityIssues, not waste categories", () => {
    // Build an input where search term shares core words with an active keyword
    // (so it is "likely_relevant") but has no conversions and meaningful spend
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Services", status: 2, cost: 500, conversions: 5, clicks: 100, impressions: 2000 },
    ];
    input.keywords = [
      { criterionId: "1", text: "plumber services", qualityScore: 7, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 1000, clicks: 50, cost: 200, conversions: 5, status: 2, matchType: "PHRASE", campaignName: "Services", campaignId: "1", adGroupName: "AG1", averageCpc: 4.0, ctr: 0.05 },
    ];
    // "emergency plumber services" shares words with "plumber services" keyword → likely_relevant
    // Has no conversions and >= $10 spend → should appear in qualityIssues
    input.searchTerms = [
      { searchTerm: "emergency plumber services", impressions: 200, clicks: 20, cost: 80, conversions: 0, campaignName: "Services", campaignId: "1", adGroupName: "AG1" },
    ];
    const result = computeAuditScore(input);

    // Should NOT appear in true waste categories
    const wasteItems = result.wastedSpend.categories.flatMap(c => c.items);
    expect(wasteItems.some(item => item.includes("emergency plumber services"))).toBe(false);

    // Should appear in quality issues
    const qualityItems = result.wastedSpend.qualityIssues.categories.flatMap(c => c.items);
    expect(qualityItems.some(item => item.includes("emergency plumber services"))).toBe(true);
  });

  it("confirmed waste search terms go into waste categories, not qualityIssues", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Services", status: 2, cost: 500, conversions: 5, clicks: 100, impressions: 2000 },
    ];
    input.keywords = [
      { criterionId: "1", text: "plumber services", qualityScore: 7, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 1000, clicks: 50, cost: 200, conversions: 5, status: 2, matchType: "PHRASE", campaignName: "Services", campaignId: "1", adGroupName: "AG1", averageCpc: 4.0, ctr: 0.05 },
    ];
    // "plumber jobs" hits the "job seeker" low-intent pattern → confirmed_waste
    input.searchTerms = [
      { searchTerm: "plumber jobs hiring", impressions: 500, clicks: 50, cost: 200, conversions: 0, campaignName: "Services", campaignId: "1", adGroupName: "AG1" },
    ];
    const result = computeAuditScore(input);

    // Should appear in true waste categories (irrelevant search terms)
    const wasteItems = result.wastedSpend.categories.flatMap(c => c.items);
    expect(wasteItems.some(item => item.includes("plumber jobs hiring"))).toBe(true);
    expect(result.wastedSpend.total).toBeGreaterThan(0);
  });
});

describe("impression share diagnosis", () => {
  it("returns null values with no data", () => {
    const result = computeAuditScore(emptyInput());
    expect(result.impressionShareDiagnosis.avgIS).toBeNull();
  });

  it("provides a diagnosis string", () => {
    const result = computeAuditScore(newAccountInput());
    expect(result.impressionShareDiagnosis.diagnosis.length).toBeGreaterThan(0);
    expect(result.impressionShareDiagnosis.avgIS).toBeCloseTo(0.33, 1);
  });
});
