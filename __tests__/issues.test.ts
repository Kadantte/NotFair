import { describe, it, expect } from "vitest";
import { detectIssues, type SearchTermData, type KeywordData, type CampaignPerfData } from "@/lib/dashboard/issues";

describe("detectIssues", () => {
  describe("wasted search terms", () => {
    it("detects search terms with zero conversions and >$1/day spend", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          terms: [
            { searchTerm: "free pet food", campaignName: "Pet Hotel", cost: 60, conversions: 0, clicks: 30, impressions: 500 },
            { searchTerm: "pet hotel near me", campaignName: "Pet Hotel", cost: 100, conversions: 5, clicks: 50, impressions: 1000 },
          ],
        }],
        keywordsByCampaign: [],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("wasted_search_terms");
      expect(issues[0].dailyImpact).toBe(2); // $60 / 30 days
      expect(issues[0].action.type).toBe("add_negatives");
      if (issues[0].action.type === "add_negatives") {
        expect(issues[0].action.terms).toContain("free pet food");
      }
    });

    it("filters out terms below $1/day threshold", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          terms: [
            { searchTerm: "cheap stuff", campaignName: "Pet Hotel", cost: 10, conversions: 0, clicks: 5, impressions: 100 },
          ],
        }],
        keywordsByCampaign: [],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(0);
    });

    it("returns empty array when all terms have conversions", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          terms: [
            { searchTerm: "pet hotel", campaignName: "Pet Hotel", cost: 100, conversions: 5, clicks: 50, impressions: 1000 },
          ],
        }],
        keywordsByCampaign: [],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(0);
    });

    it("returns empty array with no search terms", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [],
        keywordsByCampaign: [],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(0);
    });

    it("caps to top 10 wasted terms per campaign", () => {
      const terms: SearchTermData[] = Array.from({ length: 20 }, (_, i) => ({
        searchTerm: `term-${i}`,
        campaignName: "Test",
        cost: 100 - i,
        conversions: 0,
        clicks: 10,
        impressions: 100,
      }));

      const issues = detectIssues({
        searchTermsByCampaign: [{ campaignId: "1", campaignName: "Test", terms }],
        keywordsByCampaign: [],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(1);
      if (issues[0].action.type === "add_negatives") {
        expect(issues[0].action.terms).toHaveLength(10);
      }
    });

    it("assigns high severity for waste >= $20/day", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [{
          campaignId: "1",
          campaignName: "Test",
          terms: [
            { searchTerm: "expensive junk", campaignName: "Test", cost: 900, conversions: 0, clicks: 100, impressions: 5000 },
          ],
        }],
        keywordsByCampaign: [],
        campaignPerf: [],
        days: 30,
      });

      expect(issues[0].severity).toBe("high");
    });
  });

  describe("low quality keywords", () => {
    it("detects keywords with QS < 5 and significant spend", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [],
        keywordsByCampaign: [{
          campaignId: "1",
          keywords: [{
            criterionId: "100",
            adGroupId: "50",
            adGroupName: "Main",
            text: "bad keyword",
            qualityScore: 3,
            cost: 60,
            conversions: 0,
            impressions: 500,
          }],
        }],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("low_quality_keyword");
      expect(issues[0].action.type).toBe("pause_keyword");
      if (issues[0].action.type === "pause_keyword") {
        expect(issues[0].action.criterionId).toBe("100");
        expect(issues[0].action.adGroupId).toBe("50");
      }
    });

    it("ignores keywords with null quality score", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [],
        keywordsByCampaign: [{
          campaignId: "1",
          keywords: [{
            criterionId: "100",
            adGroupId: "50",
            adGroupName: "Main",
            text: "unknown qs",
            qualityScore: null,
            cost: 60,
            conversions: 0,
            impressions: 500,
          }],
        }],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(0);
    });

    it("ignores keywords with QS >= 5", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [],
        keywordsByCampaign: [{
          campaignId: "1",
          keywords: [{
            criterionId: "100",
            adGroupId: "50",
            adGroupName: "Main",
            text: "ok keyword",
            qualityScore: 6,
            cost: 60,
            conversions: 0,
            impressions: 500,
          }],
        }],
        campaignPerf: [],
        days: 30,
      });

      expect(issues).toHaveLength(0);
    });
  });

  describe("declining campaigns", () => {
    it("detects CPA spike > 20%", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [],
        keywordsByCampaign: [],
        campaignPerf: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          currentWeekCpa: 60,
          previousWeekCpa: 40,
          currentWeekCost: 300,
        }],
        days: 30,
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("declining_campaign");
      expect(issues[0].title).toContain("50%");
    });

    it("ignores CPA changes <= 20%", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [],
        keywordsByCampaign: [],
        campaignPerf: [{
          campaignId: "1",
          campaignName: "Pet Hotel",
          currentWeekCpa: 44,
          previousWeekCpa: 40,
          currentWeekCost: 220,
        }],
        days: 30,
      });

      expect(issues).toHaveLength(0);
    });

    it("skips campaigns with null CPA", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [],
        keywordsByCampaign: [],
        campaignPerf: [{
          campaignId: "1",
          campaignName: "New Campaign",
          currentWeekCpa: null,
          previousWeekCpa: null,
          currentWeekCost: 0,
        }],
        days: 30,
      });

      expect(issues).toHaveLength(0);
    });
  });

  describe("sorting", () => {
    it("sorts issues by daily impact descending", () => {
      const issues = detectIssues({
        searchTermsByCampaign: [
          {
            campaignId: "1",
            campaignName: "Small",
            terms: [{ searchTerm: "small waste", campaignName: "Small", cost: 60, conversions: 0, clicks: 5, impressions: 100 }],
          },
          {
            campaignId: "2",
            campaignName: "Big",
            terms: [{ searchTerm: "big waste", campaignName: "Big", cost: 600, conversions: 0, clicks: 50, impressions: 1000 }],
          },
        ],
        keywordsByCampaign: [],
        campaignPerf: [],
        days: 30,
      });

      expect(issues[0].dailyImpact).toBeGreaterThan(issues[1].dailyImpact);
    });
  });
});
