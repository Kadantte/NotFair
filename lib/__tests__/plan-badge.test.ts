import { describe, expect, it } from "vitest";
import { computePlanBadge } from "@/lib/plan-badge";

const NOW = new Date("2026-05-01T00:00:00Z");
const fromNow = (ms: number) => new Date(NOW.getTime() + ms);
const DAY = 86_400_000;

describe("computePlanBadge", () => {
  describe("paid users never see the free-trial badge", () => {
    it("growth user with no app-side trial → paid badge", () => {
      expect(computePlanBadge({ plan: "growth", inTrial: false, trialEndsAt: null, now: NOW }))
        .toEqual({ kind: "paid", planName: "Growth" });
    });

    it("growth user whose trialEndsAt is still in the future → still paid badge", () => {
      // Stripe-trialing users resolve to plan="growth"; the resolver also
      // surfaces inTrial=true if the row's app-side trial_ends_at is in the
      // future. They must NOT see the "Free trial" countdown — the paid pill
      // wins. Regression guard for the issue this test was added to cover.
      const badge = computePlanBadge({
        plan: "growth",
        inTrial: true,
        trialEndsAt: fromNow(3 * DAY),
        now: NOW,
      });
      expect(badge.kind).toBe("paid");
      expect(badge.kind === "paid" && badge.planName).toBe("Growth");
    });

    it("growth user with expired trialEndsAt → still paid badge, never 'Trial ended'", () => {
      // Same guarantee on the other side: a paying customer whose app-side
      // trial window has lapsed is still paying. We must not strand them with
      // a red "Trial ended" pill.
      const badge = computePlanBadge({
        plan: "growth",
        inTrial: false,
        trialEndsAt: fromNow(-30 * DAY),
        now: NOW,
      });
      expect(badge.kind).toBe("paid");
    });
  });

  describe("free + in-trial → countdown badge", () => {
    it("6 days left renders normal (not ending-soon) styling", () => {
      const badge = computePlanBadge({
        plan: "free",
        inTrial: true,
        trialEndsAt: fromNow(6 * DAY),
        now: NOW,
      });
      expect(badge).toEqual({ kind: "trial", daysLeft: 6, endingSoon: false });
    });

    it("3 days left flips endingSoon = true (warning color)", () => {
      const badge = computePlanBadge({
        plan: "free",
        inTrial: true,
        trialEndsAt: fromNow(3 * DAY),
        now: NOW,
      });
      expect(badge).toEqual({ kind: "trial", daysLeft: 3, endingSoon: true });
    });

    it("partial day rounds UP to the next whole day so the countdown never reads 0 prematurely", () => {
      const badge = computePlanBadge({
        plan: "free",
        inTrial: true,
        trialEndsAt: fromNow(DAY + 1_000),
        now: NOW,
      });
      expect(badge.kind === "trial" && badge.daysLeft).toBe(2);
    });

    it("less than 1 day left → daysLeft 1", () => {
      const badge = computePlanBadge({
        plan: "free",
        inTrial: true,
        trialEndsAt: fromNow(60 * 60 * 1000),
        now: NOW,
      });
      expect(badge.kind === "trial" && badge.daysLeft).toBe(1);
    });
  });

  describe("free + not in trial → expired badge", () => {
    it("trialEndsAt in the past, inTrial=false → trial_expired", () => {
      const badge = computePlanBadge({
        plan: "free",
        inTrial: false,
        trialEndsAt: fromNow(-DAY),
        now: NOW,
      });
      expect(badge).toEqual({ kind: "trial_expired" });
    });

    it("free user with no trialEndsAt set at all → trial_expired (defensive default)", () => {
      // Backfill ensured every row has trial_ends_at, but if a future code
      // path ever yields a free user without one, the safe behavior is to
      // gate access (not silently grant it). This locks that in.
      const badge = computePlanBadge({
        plan: "free",
        inTrial: false,
        trialEndsAt: null,
        now: NOW,
      });
      expect(badge).toEqual({ kind: "trial_expired" });
    });
  });

  describe("plan not loaded yet", () => {
    it("plan=null → kind:none (avoids a flash of the wrong pill)", () => {
      expect(computePlanBadge({ plan: null, inTrial: false, trialEndsAt: null, now: NOW }))
        .toEqual({ kind: "none" });
    });
  });
});
