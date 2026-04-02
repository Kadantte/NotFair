import { describe, it, expect } from "vitest";
import { computeHealthScore, type HealthInput } from "@/lib/dashboard/health-score";

function makeInput(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    campaigns: [{ impressions: 1000, clicks: 100, cost: 500, conversions: 10 }],
    keywords: [{ qualityScore: 8, impressions: 500 }],
    searchImpressionShare: 0.7,
    wastedSpend: 50,
    totalSearchTermSpend: 500,
    positiveChanges: 3,
    totalChanges: 5,
    ...overrides,
  };
}

describe("computeHealthScore", () => {
  it("returns a score between 0 and 100", () => {
    const result = computeHealthScore(makeInput());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns green for score >= 70", () => {
    const result = computeHealthScore(makeInput());
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.color).toBe("green");
  });

  it("returns red for terrible metrics", () => {
    const result = computeHealthScore(makeInput({
      campaigns: [{ impressions: 1000, clicks: 100, cost: 1000, conversions: 0 }],
      keywords: [{ qualityScore: 2, impressions: 500 }],
      searchImpressionShare: 0.1,
      wastedSpend: 400,
      totalSearchTermSpend: 500,
      positiveChanges: 0,
      totalChanges: 10,
    }));
    expect(result.color).toBe("red");
    expect(result.score).toBeLessThan(40);
  });

  it("returns yellow for mediocre metrics", () => {
    const result = computeHealthScore(makeInput({
      campaigns: [{ impressions: 1000, clicks: 100, cost: 500, conversions: 3 }],
      keywords: [
        { qualityScore: 7, impressions: 300 },
        { qualityScore: 4, impressions: 200 },
      ],
      searchImpressionShare: 0.5,
      wastedSpend: 100,
      totalSearchTermSpend: 500,
      positiveChanges: 2,
      totalChanges: 5,
    }));
    expect(result.color).toBe("yellow");
  });

  it("handles all-zero input gracefully", () => {
    const result = computeHealthScore(makeInput({
      campaigns: [],
      keywords: [],
      searchImpressionShare: null,
      wastedSpend: 0,
      totalSearchTermSpend: 0,
      positiveChanges: 0,
      totalChanges: 0,
    }));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("handles null impression share as neutral", () => {
    const result = computeHealthScore(makeInput({ searchImpressionShare: null }));
    expect(result.components.impressionShare).toBe(50);
  });

  it("scores waste correctly at 0%", () => {
    const result = computeHealthScore(makeInput({ wastedSpend: 0, totalSearchTermSpend: 500 }));
    expect(result.components.wasteRatio).toBe(100);
  });

  it("scores waste correctly at 50%+", () => {
    const result = computeHealthScore(makeInput({ wastedSpend: 300, totalSearchTermSpend: 500 }));
    expect(result.components.wasteRatio).toBeLessThanOrEqual(0);
  });

  it("returns 100 waste score when no search term spend", () => {
    const result = computeHealthScore(makeInput({ wastedSpend: 0, totalSearchTermSpend: 0 }));
    expect(result.components.wasteRatio).toBe(100);
  });

  it("scores CPA as 10 when spending with zero conversions", () => {
    const result = computeHealthScore(makeInput({
      campaigns: [{ impressions: 1000, clicks: 100, cost: 500, conversions: 0 }],
    }));
    expect(result.components.cpaEfficiency).toBe(10);
  });

  it("scores CPA as 50 with zero spend", () => {
    const result = computeHealthScore(makeInput({
      campaigns: [{ impressions: 0, clicks: 0, cost: 0, conversions: 0 }],
    }));
    expect(result.components.cpaEfficiency).toBe(50);
  });

  it("gives high CPA score for >10% conversion rate", () => {
    const result = computeHealthScore(makeInput({
      campaigns: [{ impressions: 1000, clicks: 100, cost: 500, conversions: 15 }],
    }));
    expect(result.components.cpaEfficiency).toBe(100);
  });

  it("scores quality based on QS >= 7 ratio", () => {
    const result = computeHealthScore(makeInput({
      keywords: [
        { qualityScore: 8, impressions: 500 },
        { qualityScore: 3, impressions: 500 },
      ],
    }));
    expect(result.components.qualityScores).toBe(50);
  });

  it("returns neutral quality score with no keyword data", () => {
    const result = computeHealthScore(makeInput({ keywords: [] }));
    expect(result.components.qualityScores).toBe(50);
  });

  it("computes momentum from positive/total ratio", () => {
    const result = computeHealthScore(makeInput({ positiveChanges: 3, totalChanges: 4 }));
    expect(result.components.changeMomentum).toBe(75);
  });

  it("returns neutral momentum with zero changes", () => {
    const result = computeHealthScore(makeInput({ positiveChanges: 0, totalChanges: 0 }));
    expect(result.components.changeMomentum).toBe(50);
  });

  it("includes all 5 components in the result", () => {
    const result = computeHealthScore(makeInput());
    expect(result.components).toHaveProperty("cpaEfficiency");
    expect(result.components).toHaveProperty("qualityScores");
    expect(result.components).toHaveProperty("impressionShare");
    expect(result.components).toHaveProperty("wasteRatio");
    expect(result.components).toHaveProperty("changeMomentum");
  });
});
