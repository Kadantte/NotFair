import { describe, it, expect } from "vitest";
import { computeAuditScore, isReversible, type AuditInput } from "@/lib/audit/scoring";

// ─── isReversible ────────────────────────────────────────────────────

describe("isReversible", () => {
  it("returns true for undefined (unknown/text-only actions)", () => {
    expect(isReversible(undefined)).toBe(true);
  });

  it("returns true for pause_campaign", () => {
    expect(isReversible("pause_campaign")).toBe(true);
  });

  it("returns true for pause_keyword", () => {
    expect(isReversible("pause_keyword")).toBe(true);
  });

  it("returns true for add_negative", () => {
    expect(isReversible("add_negative")).toBe(true);
  });

  // NOTE: No test for irreversible actions yet — the current REVERSIBLE_ACTIONS
  // set is permissive because every PassItem `actionType` today is reversible.
  // Future action types like `remove_campaign` (delete, not pause) MUST NOT be
  // added to the REVERSIBLE_ACTIONS set; at that point add a test here asserting
  // `isReversible("remove_campaign") === false`.
});

// ─── estimatedMonthlySavings propagation ─────────────────────────────

function baseInput(): AuditInput {
  return {
    accountSettings: {
      autoTaggingEnabled: true,
      conversionTrackingId: "1",
      trackingUrlTemplate: null,
    },
    conversionActions: [
      { id: "1", name: "Purchase", type: 8, status: 2, category: 13, includeInConversions: true, countingType: 2 },
    ],
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

describe("PassItem estimatedMonthlySavings", () => {
  it("sets estimatedMonthlySavings=cost on a zero-conversion campaign pause", () => {
    const input = baseInput();
    input.campaigns.push({
      id: "zc1",
      name: "Zero CV",
      status: 2, // ENABLED
      cost: 100,
      conversions: 0,
      clicks: 25,
      impressions: 500,
    });

    const result = computeAuditScore(input);

    const pauseItem = result.passes.stopWasting.find(
      (p) => p.actionType === "pause_campaign" && p.targetId === "zc1",
    );
    expect(pauseItem).toBeDefined();
    expect(pauseItem?.estimatedMonthlySavings).toBe(100);
    // sanity: the helper agrees this is reversible
    expect(isReversible(pauseItem?.actionType)).toBe(true);
  });

  it("does not set estimatedMonthlySavings on add-keyword captureMore items", () => {
    const input = baseInput();
    // one enabled campaign with an existing keyword (so keyword set is non-empty)
    input.campaigns.push({
      id: "c1",
      name: "Main",
      status: 2,
      cost: 500,
      conversions: 20,
      clicks: 200,
      impressions: 5000,
    });
    input.keywords.push({
      criterionId: "k1",
      text: "existing keyword",
      qualityScore: 7,
      creativeQuality: 3,
      postClickQuality: 3,
      searchPredictedCtr: 3,
      impressions: 5000,
      clicks: 200,
      cost: 500,
      conversions: 20,
      status: 2,
      matchType: "EXACT",
      campaignName: "Main",
      campaignId: "c1",
      adGroupName: "AG1",
      averageCpc: 2.5,
      ctr: 0.04,
    });
    // a converting search term NOT in the keyword list — this triggers the "add keyword" suggestion
    input.searchTerms.push({
      searchTerm: "new converting term",
      impressions: 100,
      clicks: 20,
      cost: 40,
      conversions: 5,
      campaignName: "Main",
      campaignId: "c1",
      adGroupName: "AG1",
    });

    const result = computeAuditScore(input);

    const addKwItem = result.passes.captureMore.find((p) =>
      p.action.startsWith('Add "new converting term"'),
    );
    expect(addKwItem).toBeDefined();
    // Acquisition play — no reliable savings estimate, must be undefined.
    expect(addKwItem?.estimatedMonthlySavings).toBeUndefined();
  });
});
