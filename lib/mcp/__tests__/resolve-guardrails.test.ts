import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_GUARDRAILS } from "@/lib/google-ads";

const { mockGetGoals } = vi.hoisted(() => ({
  mockGetGoals: vi.fn(),
}));

vi.mock("@/lib/db/tracking", () => ({
  getGoals: mockGetGoals,
}));

import { resolveGuardrails } from "@/lib/mcp/write-tools/_deps";

describe("resolveGuardrails", () => {
  beforeEach(() => {
    mockGetGoals.mockReset();
  });

  it("returns DEFAULT_GUARDRAILS when no goals row exists", async () => {
    mockGetGoals.mockResolvedValueOnce(null);
    const result = await resolveGuardrails("acct-1");
    expect(result).toEqual(DEFAULT_GUARDRAILS);
    expect(mockGetGoals).toHaveBeenCalledWith("acct-1", undefined);
  });

  it("returns persisted values when all fields are set", async () => {
    mockGetGoals.mockResolvedValueOnce({
      accountId: "acct-1",
      campaignId: "",
      maxBidChangePct: 1.0,
      maxBudgetChangePct: 0.75,
      maxKeywordPausePct: 0.5,
    });
    const result = await resolveGuardrails("acct-1");
    expect(result).toEqual({
      maxBidChangePct: 1.0,
      maxBudgetChangePct: 0.75,
      maxKeywordPausePct: 0.5,
    });
  });

  it("falls back to DEFAULT_GUARDRAILS for individual unset fields (null in DB)", async () => {
    mockGetGoals.mockResolvedValueOnce({
      accountId: "acct-1",
      campaignId: "",
      maxBidChangePct: 0.9,
      maxBudgetChangePct: null,
      maxKeywordPausePct: null,
    });
    const result = await resolveGuardrails("acct-1");
    expect(result.maxBidChangePct).toBe(0.9);
    expect(result.maxBudgetChangePct).toBe(DEFAULT_GUARDRAILS.maxBudgetChangePct);
    expect(result.maxKeywordPausePct).toBe(DEFAULT_GUARDRAILS.maxKeywordPausePct);
  });

  it("passes campaignId through to getGoals so campaign-specific guardrails win", async () => {
    mockGetGoals.mockResolvedValueOnce({
      accountId: "acct-1",
      campaignId: "camp-99",
      maxBidChangePct: 0.5,
      maxBudgetChangePct: 0.5,
      maxKeywordPausePct: 0.3,
    });
    const result = await resolveGuardrails("acct-1", "camp-99");
    expect(mockGetGoals).toHaveBeenCalledWith("acct-1", "camp-99");
    expect(result.maxBidChangePct).toBe(0.5);
  });

  it("falls back to DEFAULT_GUARDRAILS when the goals lookup throws (DB hiccup)", async () => {
    // A DB outage shouldn't block a bid update — the user retries, and the
    // worst case is they get the tighter default cap instead of their custom one.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockGetGoals.mockRejectedValueOnce(new Error("Missing DATABASE_URL environment variable"));
    const result = await resolveGuardrails("acct-1");
    expect(result).toEqual(DEFAULT_GUARDRAILS);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("treats explicit 0 as a real value, not unset", async () => {
    // Defensive — nullish-coalescing (??) preserves 0; '||' would not.
    // 0 isn't a legal guardrail (Zod cap is .min(0.01)) but we shouldn't
    // silently rewrite it to the default.
    mockGetGoals.mockResolvedValueOnce({
      maxBidChangePct: 0,
      maxBudgetChangePct: 0,
      maxKeywordPausePct: 0,
    });
    const result = await resolveGuardrails("acct-1");
    expect(result.maxBidChangePct).toBe(0);
    expect(result.maxBudgetChangePct).toBe(0);
    expect(result.maxKeywordPausePct).toBe(0);
  });
});
