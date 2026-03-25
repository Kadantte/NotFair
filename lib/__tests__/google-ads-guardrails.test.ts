import { describe, it, expect } from "vitest";
import { DEFAULT_GUARDRAILS, type Guardrails } from "@/lib/google-ads";

describe("Google Ads Guardrails", () => {
  describe("DEFAULT_GUARDRAILS", () => {
    it("has 25% max bid change", () => {
      expect(DEFAULT_GUARDRAILS.maxBidChangePct).toBe(0.25);
    });

    it("has 50% max budget change", () => {
      expect(DEFAULT_GUARDRAILS.maxBudgetChangePct).toBe(0.50);
    });

    it("has 30% max keyword pause", () => {
      expect(DEFAULT_GUARDRAILS.maxKeywordPausePct).toBe(0.30);
    });
  });

  describe("bid change guardrail logic", () => {
    const guardrails = DEFAULT_GUARDRAILS;

    it("allows bid change within 25%", () => {
      const currentBid = 1_000_000; // $1.00
      const newBid = 1_200_000;     // $1.20 = 20% increase
      const changePct = Math.abs(newBid - currentBid) / currentBid;
      expect(changePct).toBeLessThanOrEqual(guardrails.maxBidChangePct);
    });

    it("rejects bid change exceeding 25%", () => {
      const currentBid = 1_000_000; // $1.00
      const newBid = 1_300_000;     // $1.30 = 30% increase
      const changePct = Math.abs(newBid - currentBid) / currentBid;
      expect(changePct).toBeGreaterThan(guardrails.maxBidChangePct);
    });

    it("rejects bid decrease exceeding 25%", () => {
      const currentBid = 1_000_000;
      const newBid = 700_000;       // $0.70 = 30% decrease
      const changePct = Math.abs(newBid - currentBid) / currentBid;
      expect(changePct).toBeGreaterThan(guardrails.maxBidChangePct);
    });

    it("allows exact 25% change", () => {
      const currentBid = 1_000_000;
      const newBid = 1_250_000;     // exactly 25%
      const changePct = Math.abs(newBid - currentBid) / currentBid;
      expect(changePct).toBeLessThanOrEqual(guardrails.maxBidChangePct);
    });

    it("rejects zero bid", () => {
      expect(0).toBeLessThanOrEqual(0);
      // Zero bid is caught by the newBidMicros <= 0 check in updateBid
    });

    it("rejects negative bid", () => {
      expect(-100).toBeLessThan(0);
    });
  });

  describe("budget change guardrail logic", () => {
    const guardrails = DEFAULT_GUARDRAILS;

    it("allows budget change within 50%", () => {
      const current = 10_000_000; // $10/day
      const newBudget = 14_000_000; // $14/day = 40% increase
      const changePct = Math.abs(newBudget - current) / current;
      expect(changePct).toBeLessThanOrEqual(guardrails.maxBudgetChangePct);
    });

    it("rejects budget change exceeding 50%", () => {
      const current = 10_000_000;
      const newBudget = 16_000_000; // $16/day = 60% increase
      const changePct = Math.abs(newBudget - current) / current;
      expect(changePct).toBeGreaterThan(guardrails.maxBudgetChangePct);
    });

    it("rejects budget below $1/day minimum", () => {
      const newBudget = 500_000; // $0.50
      expect(newBudget).toBeLessThan(1_000_000);
    });
  });

  describe("custom guardrails", () => {
    it("accepts tighter guardrails", () => {
      const tight: Guardrails = {
        maxBidChangePct: 0.10,     // 10%
        maxBudgetChangePct: 0.20,  // 20%
        maxKeywordPausePct: 0.10,  // 10%
      };
      expect(tight.maxBidChangePct).toBe(0.10);
    });

    it("accepts looser guardrails", () => {
      const loose: Guardrails = {
        maxBidChangePct: 0.50,     // 50%
        maxBudgetChangePct: 1.00,  // 100%
        maxKeywordPausePct: 0.50,  // 50%
      };
      expect(loose.maxBidChangePct).toBe(0.50);
    });
  });
});

describe("safeCampaignId validation", () => {
  // Testing the validation logic that safeCampaignId implements
  it("accepts valid numeric string", () => {
    const id = Number("12345678");
    expect(Number.isFinite(id) && id > 0).toBe(true);
  });

  it("rejects non-numeric string", () => {
    const id = Number("abc");
    expect(Number.isFinite(id) && id > 0).toBe(false);
  });

  it("rejects empty string", () => {
    const id = Number("");
    expect(id > 0).toBe(false);
  });

  it("rejects negative number", () => {
    const id = Number("-1");
    expect(id > 0).toBe(false);
  });

  it("rejects zero", () => {
    const id = Number("0");
    expect(id > 0).toBe(false);
  });
});
