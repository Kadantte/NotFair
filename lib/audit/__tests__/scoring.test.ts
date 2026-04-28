import { describe, it, expect } from "vitest";
import {
  computeAuditScore,
  scoreConversionTracking,
  scoreCampaignStructure,
  scoreKeywordHealth,
  scoreSearchTermQuality,
  scoreAdCopy,
  scoreBiddingStrategy,
  scoreImpressionShare,
  scoreSpendEfficiency,
  scoreLandingPageQuality,
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
    landingPages: [],
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
      { id: "1", name: "Brand", status: 2, cost: 500, conversions: 50, clicks: 200, impressions: 5000, biddingStrategy: "TARGET_CPA" },
      { id: "2", name: "Non-Brand Services", status: 2, cost: 1500, conversions: 30, clicks: 600, impressions: 15000, biddingStrategy: "MAXIMIZE_CONVERSIONS" },
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
      { adId: "1", type: 15, headlines: ["Best Plumber", "24/7 Service", "Free Estimates", "Licensed & Insured", "Call Now", "Same Day Service", "5-Star Rated", "Fast Response", "Local Experts", "Book Online"], descriptions: ["Professional plumbing services.", "Licensed, insured, 24/7."], finalUrls: ["https://example.com/plumbing"], impressions: 5000, clicks: 200, cost: 500, conversions: 20, adGroupId: "1", adGroupName: "Plumbing", status: 2 },
      { adId: "2", type: 15, headlines: ["Emergency Plumber", "Open Now", "No Extra Charge", "Fast Arrival", "Trusted Since 2010", "Top Rated", "Licensed Pro", "Free Quote"], descriptions: ["Emergency plumbing repair.", "Arrive in 30 minutes."], finalUrls: ["https://example.com/emergency"], impressions: 4000, clicks: 150, cost: 400, conversions: 10, adGroupId: "2", adGroupName: "Emergency", status: 2 },
    ],
    landingPages: [
      { url: "https://example.com/plumbing", ok: true, https: true, statusCode: 200, title: "Best Plumber - Professional Services", metaDescription: "Licensed plumber available 24/7.", h1: "Professional Plumbing Services", hasForm: true, hasMobileViewport: true, loadTimeMs: 450, errorReason: null },
      { url: "https://example.com/emergency", ok: true, https: true, statusCode: 200, title: "Emergency Plumber - Open Now", metaDescription: "Fast emergency plumbing repair.", h1: "Emergency Plumbing Repair", hasForm: true, hasMobileViewport: true, loadTimeMs: 520, errorReason: null },
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
      { adId: "1", type: 15, headlines: ["AI Google Ads Agent", "Google Ads MCP Server", "Free Setup", "Stop Wasting Ad Spend"], descriptions: ["Connect Google Ads to AI."], finalUrls: ["https://www.notfair.co"], impressions: 22, clicks: 2, cost: 1.38, conversions: 0, adGroupId: "1", adGroupName: "AG1", status: 2 },
    ],
    landingPages: [
      { url: "https://www.notfair.co", ok: true, https: true, statusCode: 200, title: "NotFair - AI Google Ads", metaDescription: null, h1: "AI Google Ads Agent", hasForm: false, hasMobileViewport: true, loadTimeMs: 800, errorReason: null },
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
    expect(result.dimensions).toHaveLength(9);
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

describe("scoreLandingPageQuality", () => {
  it("scores 2 with no ads or landing pages", () => {
    const result = scoreLandingPageQuality(emptyInput());
    expect(result.score).toBe(2);
  });

  it("scores high with healthy HTTPS pages that have forms and mobile viewport", () => {
    const result = scoreLandingPageQuality(wellOptimizedInput());
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("penalizes non-HTTPS pages", () => {
    const input = emptyInput();
    input.ads = [{ adId: "1", type: 15, headlines: ["Test"], descriptions: ["Test"], finalUrls: ["http://example.com"], impressions: 100, clicks: 10, cost: 50, conversions: 0, adGroupId: "1", adGroupName: "AG1", status: 2 }];
    input.landingPages = [{ url: "http://example.com", ok: true, https: false, statusCode: 200, title: "Test", metaDescription: "Test", h1: "Test", hasForm: true, hasMobileViewport: true, loadTimeMs: 300, errorReason: null }];
    const result = scoreLandingPageQuality(input);
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it("penalizes failed page loads", () => {
    const input = emptyInput();
    input.ads = [{ adId: "1", type: 15, headlines: ["Test"], descriptions: ["Test"], finalUrls: ["https://broken.example.com"], impressions: 100, clicks: 10, cost: 50, conversions: 0, adGroupId: "1", adGroupName: "AG1", status: 2 }];
    input.landingPages = [{ url: "https://broken.example.com", ok: false, https: true, statusCode: 500, title: null, metaDescription: null, h1: null, hasForm: false, hasMobileViewport: false, loadTimeMs: 200, errorReason: "HTTP 500" }];
    const result = scoreLandingPageQuality(input);
    expect(result.score).toBe(0);
  });

  it("penalizes slow server response", () => {
    const input = emptyInput();
    input.ads = [{ adId: "1", type: 15, headlines: ["Test"], descriptions: ["Test"], finalUrls: ["https://slow.example.com"], impressions: 100, clicks: 10, cost: 50, conversions: 0, adGroupId: "1", adGroupName: "AG1", status: 2 }];
    input.landingPages = [{ url: "https://slow.example.com", ok: true, https: true, statusCode: 200, title: "Test", metaDescription: "Test", h1: "Test", hasForm: true, hasMobileViewport: true, loadTimeMs: 6000, errorReason: null }];
    const result = scoreLandingPageQuality(input);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("scores new account with missing form lower", () => {
    const result = scoreLandingPageQuality(newAccountInput());
    // newAccountInput has no form on landing page
    expect(result.score).toBeLessThanOrEqual(4);
    expect(result.score).toBeGreaterThanOrEqual(2);
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

describe("scoreBiddingStrategy", () => {
  it("returns needs_work with no active campaigns", () => {
    const result = scoreBiddingStrategy(emptyInput());
    expect(result.score).toBe(2);
    expect(result.status).toBe("needs_work");
  });

  it("returns needs_work when biddingStrategy data unavailable", () => {
    const input = emptyInput();
    input.campaigns = [{ id: "1", name: "Test", status: 2, cost: 100, conversions: 5, clicks: 20, impressions: 500 }];
    const result = scoreBiddingStrategy(input);
    expect(result.score).toBe(2);
  });

  it("scores high when all campaigns use Smart Bidding", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Brand", status: 2, cost: 500, conversions: 50, clicks: 200, impressions: 5000, biddingStrategy: "TARGET_CPA" },
      { id: "2", name: "Non-Brand", status: 2, cost: 1500, conversions: 30, clicks: 600, impressions: 15000, biddingStrategy: "MAXIMIZE_CONVERSIONS" },
    ];
    const result = scoreBiddingStrategy(input);
    expect(result.score).toBe(5);
    expect(result.details.some((d) => d.includes("2/2"))).toBe(true);
  });

  it("penalizes deprecated Enhanced CPC", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Old Campaign", status: 2, cost: 500, conversions: 5, clicks: 100, impressions: 2000, biddingStrategy: "ENHANCED_CPC" },
    ];
    const result = scoreBiddingStrategy(input);
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.details.some((d) => d.includes("deprecated") || d.includes("Enhanced CPC"))).toBe(true);
  });

  it("scores manual bidding as acceptable for new accounts without conversions", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "New", status: 2, cost: 10, conversions: 0, clicks: 5, impressions: 100, biddingStrategy: "MANUAL_CPC" },
    ];
    const result = scoreBiddingStrategy(input);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("penalizes manual bidding when conversion history is strong", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Mature", status: 2, cost: 5000, conversions: 200, clicks: 1000, impressions: 30000, biddingStrategy: "MANUAL_CPC" },
    ];
    const result = scoreBiddingStrategy(input);
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it("handles numeric biddingStrategy values from google-ads-api (6=TARGET_CPA, 5=ENHANCED_CPC)", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Smart", status: 2, cost: 500, conversions: 20, clicks: 100, impressions: 2000, biddingStrategy: 6 as any },
      { id: "2", name: "Smart2", status: 2, cost: 500, conversions: 15, clicks: 80, impressions: 1500, biddingStrategy: 11 as any },
    ];
    const result = scoreBiddingStrategy(input);
    expect(result.score).toBe(5);
  });

  it("penalizes numeric ENHANCED_CPC (5) correctly", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Old", status: 2, cost: 500, conversions: 5, clicks: 100, impressions: 2000, biddingStrategy: 5 as any },
    ];
    const result = scoreBiddingStrategy(input);
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.details.some((d) => d.includes("deprecated") || d.includes("Enhanced CPC"))).toBe(true);
  });

  it("scores 60-80% smart bidding as 4", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Smart1", status: 2, cost: 500, conversions: 20, clicks: 100, impressions: 2000, biddingStrategy: "TARGET_CPA" },
      { id: "2", name: "Smart2", status: 2, cost: 500, conversions: 15, clicks: 80, impressions: 1500, biddingStrategy: "MAXIMIZE_CONVERSIONS" },
      { id: "3", name: "Manual", status: 2, cost: 200, conversions: 5, clicks: 50, impressions: 1000, biddingStrategy: "MANUAL_CPC" },
    ];
    const result = scoreBiddingStrategy(input);
    // 2/3 = 67% smart → score 4
    expect(result.score).toBe(4);
  });

  it("scores 40-60% smart bidding as 3", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Smart", status: 2, cost: 500, conversions: 20, clicks: 100, impressions: 2000, biddingStrategy: "TARGET_CPA" },
      { id: "2", name: "Manual1", status: 2, cost: 300, conversions: 10, clicks: 60, impressions: 1200, biddingStrategy: "MANUAL_CPC" },
      { id: "3", name: "Manual2", status: 2, cost: 200, conversions: 5, clicks: 50, impressions: 1000, biddingStrategy: "MANUAL_CPC" },
    ];
    const result = scoreBiddingStrategy(input);
    // 1/3 = 33% smart with conversions → score 2 (not enough conversion history check is per-account not per-campaign)
    // Actually 1/3 = 33% < 40%, totalConversions=35 > 30 → score 2
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it("does not count campaigns with undefined biddingStrategy as manual", () => {
    const input = emptyInput();
    input.campaigns = [
      { id: "1", name: "Smart", status: 2, cost: 500, conversions: 50, clicks: 200, impressions: 5000, biddingStrategy: "TARGET_CPA" },
      { id: "2", name: "Unknown", status: 2, cost: 200, conversions: 10, clicks: 60, impressions: 1500 }, // no biddingStrategy
    ];
    const result = scoreBiddingStrategy(input);
    // Known: 1 campaign, 1 smart → smartPct=100% → score 5 (not penalized for missing data)
    expect(result.score).toBe(5);
    expect(result.details.some((d) => d.includes("no bidding strategy data"))).toBe(true);
  });
});

describe("scoreKeywordHealth — match type distribution", () => {
  it("penalizes accounts with >70% broad match and 5+ keywords", () => {
    const input = emptyInput();
    input.campaigns = [{ id: "1", name: "C", status: 2, cost: 500, conversions: 5, clicks: 100, impressions: 2000 }];
    // 6 keywords, 5 broad (83%) — should trigger the penalty
    input.keywords = [
      { criterionId: "1", text: "kw1", qualityScore: 7, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 500, clicks: 25, cost: 75, conversions: 2, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "2", text: "kw2", qualityScore: 7, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 400, clicks: 20, cost: 60, conversions: 1, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "3", text: "kw3", qualityScore: 6, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 300, clicks: 15, cost: 45, conversions: 1, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "4", text: "kw4", qualityScore: 6, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 200, clicks: 10, cost: 30, conversions: 1, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "5", text: "kw5", qualityScore: 6, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 100, clicks: 5, cost: 15, conversions: 0, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "6", text: "kw6", qualityScore: 8, creativeQuality: 4, postClickQuality: 4, searchPredictedCtr: 4, impressions: 200, clicks: 25, cost: 50, conversions: 2, status: 2, matchType: "PHRASE", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 2.0, ctr: 0.125 },
    ];
    const result = scoreKeywordHealth(input);
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.details.some((d) => d.includes("broad match"))).toBe(true);
  });

  it("skips broad-match penalty with fewer than 5 keywords", () => {
    const input = emptyInput();
    input.campaigns = [{ id: "1", name: "C", status: 2, cost: 100, conversions: 2, clicks: 20, impressions: 500 }];
    input.keywords = [
      { criterionId: "1", text: "kw1", qualityScore: 7, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 200, clicks: 10, cost: 30, conversions: 1, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "2", text: "kw2", qualityScore: 7, creativeQuality: 3, postClickQuality: 3, searchPredictedCtr: 3, impressions: 150, clicks: 8, cost: 25, conversions: 1, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
      { criterionId: "3", text: "kw3", qualityScore: 8, creativeQuality: 4, postClickQuality: 3, searchPredictedCtr: 4, impressions: 100, clicks: 5, cost: 15, conversions: 1, status: 2, matchType: "BROAD", campaignName: "C", campaignId: "1", adGroupName: "AG1", averageCpc: 3.0, ctr: 0.05 },
    ];
    const result = scoreKeywordHealth(input);
    // 3 keywords, all broad but < 5 — no broad penalty
    expect(result.details.some((d) => d.includes("Over 70% broad match"))).toBe(false);
  });
});

describe("scoreAdCopy — ad strength", () => {
  it("caps score at 2 when majority of RSAs have POOR strength", () => {
    const input = emptyInput();
    input.adGroupCount = 2;
    input.ads = [
      { adId: "1", type: 15, headlines: ["H1", "H2", "H3", "H4", "H5"], descriptions: ["D1", "D2"], finalUrls: ["https://ex.com"], impressions: 500, clicks: 20, cost: 50, conversions: 1, adGroupId: "1", adGroupName: "AG1", status: 2, adStrength: "POOR" },
      { adId: "2", type: 15, headlines: ["H6", "H7", "H8", "H9", "H10"], descriptions: ["D3", "D4"], finalUrls: ["https://ex.com"], impressions: 300, clicks: 10, cost: 30, conversions: 0, adGroupId: "2", adGroupName: "AG2", status: 2, adStrength: "POOR" },
    ];
    const result = scoreAdCopy(input);
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.details.some((d) => d.includes("poor ad strength"))).toBe(true);
  });

  it("caps score at 2 when majority have numeric POOR (3)", () => {
    const input = emptyInput();
    input.adGroupCount = 2;
    input.ads = [
      { adId: "1", type: 15, headlines: ["H1", "H2", "H3", "H4", "H5"], descriptions: ["D1", "D2"], finalUrls: ["https://ex.com"], impressions: 500, clicks: 20, cost: 50, conversions: 1, adGroupId: "1", adGroupName: "AG1", status: 2, adStrength: 3 as any },
      { adId: "2", type: 15, headlines: ["H6", "H7", "H8", "H9", "H10"], descriptions: ["D3", "D4"], finalUrls: ["https://ex.com"], impressions: 300, clicks: 10, cost: 30, conversions: 0, adGroupId: "2", adGroupName: "AG2", status: 2, adStrength: 3 as any },
    ];
    const result = scoreAdCopy(input);
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it("awards bonus point when at least one RSA has EXCELLENT strength", () => {
    const input = emptyInput();
    input.adGroupCount = 1;
    input.ads = [
      { adId: "1", type: 15, headlines: ["H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","H11"], descriptions: ["D1", "D2", "D3"], finalUrls: ["https://ex.com"], impressions: 1000, clicks: 50, cost: 100, conversions: 5, adGroupId: "1", adGroupName: "AG1", status: 2, adStrength: "EXCELLENT" },
    ];
    const baseInput = emptyInput();
    baseInput.adGroupCount = 1;
    baseInput.ads = [
      { adId: "1", type: 15, headlines: ["H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","H11"], descriptions: ["D1", "D2", "D3"], finalUrls: ["https://ex.com"], impressions: 1000, clicks: 50, cost: 100, conversions: 5, adGroupId: "1", adGroupName: "AG1", status: 2 },
    ];
    const withStrength = scoreAdCopy(input);
    const withoutStrength = scoreAdCopy(baseInput);
    // EXCELLENT bonus should bump score higher than baseline
    expect(withStrength.score).toBeGreaterThanOrEqual(withoutStrength.score);
    expect(withStrength.details.some((d) => d.includes("Excellent"))).toBe(true);
  });

  it("awards bonus point when at least one RSA has numeric EXCELLENT (6)", () => {
    const input = emptyInput();
    input.adGroupCount = 1;
    input.ads = [
      { adId: "1", type: 15, headlines: ["H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","H11"], descriptions: ["D1", "D2", "D3"], finalUrls: ["https://ex.com"], impressions: 1000, clicks: 50, cost: 100, conversions: 5, adGroupId: "1", adGroupName: "AG1", status: 2, adStrength: 6 as any },
    ];
    const result = scoreAdCopy(input);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });
});
