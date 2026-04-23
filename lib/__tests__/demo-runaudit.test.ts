/**
 * Verifies the demo audit (what MCP reviewers will see when they call the
 * `audit` tool). We exercise `runAudit` via `lib/google-ads` so the one-line
 * demo gate is in the picture.
 */
import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/google-ads/audit";
import { DEMO_CUSTOMER_ID } from "@/lib/demo/constants";

const auth = { refreshToken: "unused", customerId: DEMO_CUSTOMER_ID };

describe("runAudit with demo auth", () => {
  it("returns a populated AuditResult with business metadata", async () => {
    const result = await runAudit(auth, 30);
    expect(result.account.name).toContain("Threadline");
    expect(result.account.currency).toBe("USD");
    expect(result.summary.totalSpend).toBeGreaterThan(0);
    expect(result.summary.totalConversions).toBeGreaterThan(0);
    expect(result.summary.activeCampaigns).toBe(5);
  });

  it("surfaces wasted search terms for the wasted-spend campaign", async () => {
    const result = await runAudit(auth, 30);
    expect(result.findings.wastedSearchTerms.total).toBeGreaterThan(0);
    expect(result.findings.wastedSearchTerms.items.length).toBeGreaterThan(0);
    // Every flagged term should have 0 conversions (that's what makes it waste).
    for (const item of result.findings.wastedSearchTerms.items) {
      expect(item.conversions).toBe(0);
    }
  });

  it("surfaces budget-constrained winners for the budget-capped campaign", async () => {
    const result = await runAudit(auth, 30);
    expect(result.findings.budgetConstrainedWinners.total).toBeGreaterThan(0);
    const names = result.findings.budgetConstrainedWinners.items.map((i) => i.campaignName);
    expect(names.some((n) => n.includes("Women"))).toBe(true);
  });

  it("returns all 5 demo campaigns in the per-campaign breakdown", async () => {
    const result = await runAudit(auth, 30);
    expect(result.campaigns).toHaveLength(5);
    for (const c of result.campaigns) {
      expect(c.name).toContain("Threadline");
      expect(c.status).toBe(2);
      expect(c.spend).toBeGreaterThan(0);
    }
  });

  it("matches summary numbers with what listCampaigns would report", async () => {
    const result = await runAudit(auth, 30);
    const summed = result.campaigns.reduce((s, c) => s + c.spend, 0);
    // Allow a tiny rounding gap (per-campaign rounding vs. summary rounding).
    expect(Math.abs(summed - result.summary.totalSpend)).toBeLessThan(1);
  });
});
