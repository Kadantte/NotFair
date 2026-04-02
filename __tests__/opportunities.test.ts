import { describe, it, expect } from "vitest";
import { detectOpportunities, type ImpressionShareData, type RecommendationData } from "@/lib/dashboard/opportunities";

describe("detectOpportunities", () => {
  describe("impression share", () => {
    it("detects budget-lost IS > 10%", () => {
      const opps = detectOpportunities({
        impressionShare: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          impressionShare: 0.6,
          budgetLostIS: 0.25,
          rankLostIS: 0.05,
          totalImpressions: 1000,
          totalCost: 300,
        }],
        recommendations: [],
      });

      const budgetOpp = opps.find((o) => o.id === "is-budget-1");
      expect(budgetOpp).toBeDefined();
      expect(budgetOpp!.type).toBe("impression_share");
      expect(budgetOpp!.title).toContain("25%");
      expect(budgetOpp!.action?.type).toBe("increase_budget");
    });

    it("ignores budget-lost IS <= 10%", () => {
      const opps = detectOpportunities({
        impressionShare: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          impressionShare: 0.85,
          budgetLostIS: 0.05,
          rankLostIS: 0.05,
          totalImpressions: 1000,
          totalCost: 300,
        }],
        recommendations: [],
      });

      expect(opps.filter((o) => o.id.startsWith("is-budget"))).toHaveLength(0);
    });

    it("detects rank-lost IS > 20%", () => {
      const opps = detectOpportunities({
        impressionShare: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          impressionShare: 0.5,
          budgetLostIS: 0.05,
          rankLostIS: 0.3,
          totalImpressions: 1000,
          totalCost: 300,
        }],
        recommendations: [],
      });

      const rankOpp = opps.find((o) => o.id === "is-rank-1");
      expect(rankOpp).toBeDefined();
      expect(rankOpp!.action).toBeNull(); // rank issues need investigation
    });

    it("handles null impression share values", () => {
      const opps = detectOpportunities({
        impressionShare: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          impressionShare: null,
          budgetLostIS: null,
          rankLostIS: null,
          totalImpressions: 0,
          totalCost: 0,
        }],
        recommendations: [],
      });

      expect(opps).toHaveLength(0);
    });
  });

  describe("recommendations", () => {
    it("includes recommendations as opportunities", () => {
      const opps = detectOpportunities({
        impressionShare: [],
        recommendations: [{
          type: "KEYWORD",
          campaignId: "1",
        }],
      });

      expect(opps).toHaveLength(1);
      expect(opps[0].type).toBe("recommendation");
      expect(opps[0].estimatedImpact).toBe("Review recommended");
    });

    it("formats recommendation type nicely", () => {
      const opps = detectOpportunities({
        impressionShare: [],
        recommendations: [{
          type: "SITELINK_EXTENSION",
          campaignId: "1",
        }],
      });

      expect(opps[0].title).toBe("Sitelink Extension");
    });
  });

  describe("empty inputs", () => {
    it("returns empty array with no data", () => {
      const opps = detectOpportunities({
        impressionShare: [],
        recommendations: [],
      });
      expect(opps).toHaveLength(0);
    });
  });
});
