import { describe, it, expect } from "vitest";
import {
  anonymizeAuditResult,
  bandSpend,
  bandAnnualized,
  buildCampaignNameMap,
  roundSavings,
  DEFAULT_SHARE_SETTINGS,
  type ShareSettings,
} from "../anonymize";
import type { AuditResult } from "../scoring";

// ─── Fixtures ────────────────────────────────────────────────────────

function mkResult(overrides: Partial<AuditResult> = {}): AuditResult {
  const base: AuditResult = {
    overallScore: 72.5,
    category: "OK",
    dimensions: [],
    wastedSpend: {
      total: 1234.56,
      pct: 0.12,
      annualized: 14814.72,
      categories: [],
      qualityIssues: { total: 0, pct: 0, categories: [] },
    },
    impressionShareDiagnosis: {
      avgIS: null,
      budgetLost: null,
      rankLost: null,
      diagnosis: "",
      campaignBreakdown: [],
    },
    topActions: [],
    keyNumbers: {
      totalSpend: 10_000,
      conversions: 42,
      cpa: 238.1,
      topCampaign: "Brand – US Search",
      wastedSpend: 1234.56,
    },
    wastedSearchTerms: [],
    zeroCvCampaigns: [],
    pulseMetrics: { wasteRate: 12.3, demandCaptured: 64, cpa: 238.1 },
    passes: {
      stopWasting: [
        {
          action: "Pause Brand – US Search — $500/mo wasted",
          impact: "~$500/mo saved",
          estimatedMonthlySavings: 523,
          actionType: "pause_campaign",
          targetId: "9999",
          campaignId: "9999",
        },
      ],
      captureMore: [],
      fixFundamentals: [],
    },
    verdict:
      "Brand – US Search is burning budget while Non-Brand Display underperforms.",
  };
  return { ...base, ...overrides };
}

// ─── Campaign name obfuscation ──────────────────────────────────────

describe("buildCampaignNameMap", () => {
  it("assigns A/B/C in first-seen order, deduping", () => {
    const m = buildCampaignNameMap(["Alpha", "Beta", "Alpha", "Gamma"], false);
    expect(m.get("Alpha")).toBe("Campaign A");
    expect(m.get("Beta")).toBe("Campaign B");
    expect(m.get("Gamma")).toBe("Campaign C");
    expect(m.size).toBe(3);
  });

  it("passes names through when showCampaignNames=true", () => {
    const m = buildCampaignNameMap(["Alpha", "Beta"], true);
    expect(m.get("Alpha")).toBe("Alpha");
    expect(m.get("Beta")).toBe("Beta");
  });

  it("handles empty and blank names gracefully", () => {
    const m = buildCampaignNameMap(["", "Alpha", "", "Alpha"], false);
    expect(m.size).toBe(1);
    expect(m.get("Alpha")).toBe("Campaign A");
  });

  it("rolls over to AA after 26 campaigns", () => {
    const names = Array.from({ length: 28 }, (_, i) => `c${i}`);
    const m = buildCampaignNameMap(names, false);
    expect(m.get("c25")).toBe("Campaign Z");
    expect(m.get("c26")).toBe("Campaign AA");
    expect(m.get("c27")).toBe("Campaign AB");
  });
});

// ─── Spend banding ──────────────────────────────────────────────────

describe("bandSpend", () => {
  it("bands by standard brackets", () => {
    expect(bandSpend(0)).toBe("$0");
    expect(bandSpend(-5)).toBe("$0");
    expect(bandSpend(250)).toBe("< $500/mo");
    expect(bandSpend(750)).toBe("$500–$1k/mo");
    expect(bandSpend(2500)).toBe("$1k–$5k/mo");
    expect(bandSpend(7500)).toBe("$5k–$10k/mo");
    expect(bandSpend(12000)).toBe("$10k–$25k/mo");
    expect(bandSpend(40000)).toBe("$25k–$50k/mo");
    expect(bandSpend(75000)).toBe("$50k–$100k/mo");
    expect(bandSpend(200000)).toBe("$100k–$250k/mo");
    expect(bandSpend(500_000)).toBe("$250k–$1M/mo");
    expect(bandSpend(2_000_000)).toBe("$1M+/mo");
  });

  it("handles non-finite values by bucketing to $0 (defensive)", () => {
    // Both NaN and +Infinity fail Number.isFinite; the guard returns $0.
    // This is intentional — infinite/NaN spend is meaningless and the
    // fallback is the safest display.
    expect(bandSpend(Number.NaN)).toBe("$0");
    expect(bandSpend(Number.POSITIVE_INFINITY)).toBe("$0");
  });
});

describe("bandAnnualized", () => {
  it("uses coarser annualized brackets", () => {
    expect(bandAnnualized(0)).toBe("$0");
    expect(bandAnnualized(5000)).toBe("< $10k/yr");
    expect(bandAnnualized(25000)).toBe("$10k–$50k/yr");
    expect(bandAnnualized(75000)).toBe("$50k–$100k/yr");
    expect(bandAnnualized(250_000)).toBe("$100k–$500k/yr");
    expect(bandAnnualized(750_000)).toBe("$500k–$1M/yr");
    expect(bandAnnualized(2_000_000)).toBe("$1M+/yr");
  });
});

// ─── Savings rounding ───────────────────────────────────────────────

describe("roundSavings", () => {
  it("rounds small amounts to nearest $50", () => {
    expect(roundSavings(123)).toBe(100);
    expect(roundSavings(175)).toBe(200);
    expect(roundSavings(499)).toBe(500);
  });

  it("rounds mid amounts to nearest $500", () => {
    expect(roundSavings(1234)).toBe(1000);
    expect(roundSavings(1750)).toBe(2000);
    expect(roundSavings(4999)).toBe(5000);
  });

  it("rounds large amounts to nearest $5,000", () => {
    expect(roundSavings(12345)).toBe(10000);
    expect(roundSavings(17500)).toBe(20000);
    expect(roundSavings(99999)).toBe(100000);
  });

  it("clamps non-positive inputs to 0", () => {
    expect(roundSavings(0)).toBe(0);
    expect(roundSavings(-100)).toBe(0);
    expect(roundSavings(Number.NaN)).toBe(0);
  });
});

// ─── anonymizeAuditResult integration ───────────────────────────────

describe("anonymizeAuditResult — defaults", () => {
  it("strips campaign names and bands spend by default", () => {
    const r = mkResult();
    const payload = anonymizeAuditResult(r);

    // Top campaign rewritten.
    expect(payload.keyNumbers.topCampaign).toBe("Campaign A");

    // Verdict has no raw name left.
    expect(payload.verdict).not.toContain("Brand – US Search");
    expect(payload.verdict).toContain("Campaign A");

    // Pass action & impact rewritten.
    expect(payload.passes.stopWasting[0]?.action).not.toContain("Brand – US Search");
    expect(payload.passes.stopWasting[0]?.action).toContain("Campaign A");

    // Savings rounded.
    expect(payload.passes.stopWasting[0]?.estimatedMonthlySavings).toBe(500);

    // No account-scoped ids leaked.
    expect(payload.passes.stopWasting[0]).not.toHaveProperty("targetId");
    expect(payload.passes.stopWasting[0]).not.toHaveProperty("campaignId");

    // Spend is banded, not exact.
    expect(payload.keyNumbers.totalSpend).toEqual({ band: "$10k–$25k/mo" });
    expect(payload.keyNumbers.wastedSpend).toEqual({ band: "$1k–$5k/mo" });
    expect(payload.wastedSpend.annualizedBand).toBe("$10k–$50k/yr");

    // Shape invariants.
    expect(payload.version).toBe(1);
    expect(payload.accountLabel).toBe("Account");
    expect(payload.settings).toEqual(DEFAULT_SHARE_SETTINGS);
    expect(typeof payload.anonymizedAt).toBe("string");
  });

  it("preserves pulse metrics, category, and overallScore", () => {
    const r = mkResult();
    const payload = anonymizeAuditResult(r);
    expect(payload.category).toBe("OK");
    expect(payload.overallScore).toBe(73); // 72.5 rounded
    expect(payload.pulseMetrics).toEqual({ wasteRate: 12.3, demandCaptured: 64, cpa: 238.1 });
  });
});

describe("anonymizeAuditResult — settings respected", () => {
  it("keeps campaign names when showCampaignNames=true", () => {
    const r = mkResult();
    const settings: ShareSettings = {
      showCampaignNames: true,
      showSpend: true,
      showExactSpend: false,
    };
    const payload = anonymizeAuditResult(r, settings);
    expect(payload.keyNumbers.topCampaign).toBe("Brand – US Search");
    expect(payload.verdict).toContain("Brand – US Search");
  });

  it("includes exact spend when showExactSpend=true", () => {
    const r = mkResult();
    const settings: ShareSettings = {
      showCampaignNames: false,
      showSpend: true,
      showExactSpend: true,
    };
    const payload = anonymizeAuditResult(r, settings);
    expect(payload.keyNumbers.totalSpend?.exact).toBe(10000);
    expect(payload.keyNumbers.wastedSpend?.exact).toBeCloseTo(1234.56, 2);
  });

  it("hides spend entirely when showSpend=false", () => {
    const r = mkResult();
    const settings: ShareSettings = {
      showCampaignNames: false,
      showSpend: false,
      showExactSpend: false,
    };
    const payload = anonymizeAuditResult(r, settings);
    expect(payload.keyNumbers.totalSpend).toBeNull();
    expect(payload.keyNumbers.wastedSpend).toBeNull();
    expect(payload.wastedSpend.total).toBeNull();
    expect(payload.wastedSpend.annualizedBand).toBeNull();
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe("anonymizeAuditResult — edge cases", () => {
  it("handles empty passes, zero spend, null topCampaign", () => {
    const r = mkResult({
      keyNumbers: {
        totalSpend: 0,
        conversions: 0,
        cpa: null,
        topCampaign: null,
        wastedSpend: 0,
      },
      wastedSpend: {
        total: 0,
        pct: 0,
        annualized: 0,
        categories: [],
        qualityIssues: { total: 0, pct: 0, categories: [] },
      },
      passes: { stopWasting: [], captureMore: [], fixFundamentals: [] },
      verdict: "",
    });

    const payload = anonymizeAuditResult(r);
    expect(payload.keyNumbers.topCampaign).toBeNull();
    expect(payload.keyNumbers.totalSpend).toEqual({ band: "$0" });
    expect(payload.wastedSpend.annualizedBand).toBeNull();
    expect(payload.passes.stopWasting).toEqual([]);
    expect(payload.verdict).toBe("");
  });

  it("tolerates a result missing optional arrays without throwing", () => {
    const r = mkResult();
    // Simulate older shape by deleting optional arrays.
    const partial = {
      ...r,
      wastedSearchTerms: [],
      zeroCvCampaigns: [],
      impressionShareDiagnosis: {
        ...r.impressionShareDiagnosis,
        campaignBreakdown: [],
      },
    } as AuditResult;
    expect(() => anonymizeAuditResult(partial)).not.toThrow();
  });

  it("rewrites longer names before shorter ones to avoid partial overlap", () => {
    const r = mkResult({
      keyNumbers: {
        totalSpend: 10_000,
        conversions: 1,
        cpa: null,
        topCampaign: "Brand",
        wastedSpend: 0,
      },
      impressionShareDiagnosis: {
        avgIS: null,
        budgetLost: null,
        rankLost: null,
        diagnosis: "",
        campaignBreakdown: [
          {
            campaignName: "Brand – US",
            impressionShare: null,
            budgetLostIS: null,
            rankLostIS: null,
            totalImpressions: 0,
            totalCost: 0,
            diagnosis: "healthy",
            topKeywords: [],
          },
        ],
      },
      verdict: "Brand – US beats Brand every day",
    });
    const payload = anonymizeAuditResult(r);
    // Both distinct names must get distinct labels, and neither should end up
    // as the literal raw name inside the verdict.
    expect(payload.verdict).not.toContain("Brand – US");
    expect(payload.verdict).not.toMatch(/\bBrand\b(?! – US)/); // no lone "Brand"
  });

  it("does not expose forbidden AuditInput fields", () => {
    const r = mkResult();
    const payload = anonymizeAuditResult(r);
    // Spot-check: none of the PassItem id fields survive.
    const item = payload.passes.stopWasting[0]!;
    expect(Object.keys(item).sort()).toEqual(
      ["action", "actionType", "estimatedMonthlySavings", "impact"].sort(),
    );
  });
});
