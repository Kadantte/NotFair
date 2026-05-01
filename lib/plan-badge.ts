/**
 * Pure decision function for the navbar plan badge. Lives outside the layout
 * component so it's unit-testable without RTL/jsdom.
 *
 * Branch order matters:
 *   1. Plan not loaded → render nothing (avoid flash).
 *   2. Paid plan (anything other than "free", incl. Stripe-trialing users
 *      whose subscription resolves to "growth") → show plan-name pill.
 *      The app-side `inTrial` flag is IGNORED for paid users by design —
 *      paying customers should never see "Free trial" copy in the nav.
 *   3. Free + in-trial → show "Free trial · Xd left" countdown.
 *   4. Free + post-trial → show neutral "Free" pill. The 300-ops/30d cap
 *      lives in the rate limiter; warning copy ("approaching" / "reached")
 *      is rendered as a separate banner driven by usage info.
 */

export type PlanBadge =
  | { kind: "none" }
  | { kind: "paid"; planName: string }
  | { kind: "trial"; daysLeft: number; endingSoon: boolean }
  | { kind: "free" };

export interface PlanBadgeInput {
  /** "free", "growth", or null when /api/subscription hasn't responded yet. */
  plan: string | null;
  /** App-side trial-window flag (true iff trialEndsAt is in the future). */
  inTrial: boolean;
  /** App-side trial cutoff. Drives the "Xd left" countdown. */
  trialEndsAt: Date | null;
  /** Used to compute days-left; injected so tests can pin the clock. */
  now?: Date;
}

const DAY_MS = 86_400_000;

export function computePlanBadge(input: PlanBadgeInput): PlanBadge {
  const { plan, inTrial, trialEndsAt } = input;
  const now = input.now ?? new Date();

  if (plan === null) return { kind: "none" };

  // Paid users (incl. Stripe-trialing users that resolve to "growth") win
  // unconditionally — they never see free-trial copy in the nav, even if a
  // stale app-side trial row still has trialEndsAt in the future.
  if (plan !== "free") {
    return {
      kind: "paid",
      planName: plan.charAt(0).toUpperCase() + plan.slice(1),
    };
  }

  if (inTrial && trialEndsAt) {
    const daysLeft = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
    return { kind: "trial", daysLeft, endingSoon: daysLeft <= 3 };
  }

  // Post-trial free. The pill itself is just "Free" — usage warnings come
  // from getUsageInfo and render as a separate banner.
  return { kind: "free" };
}
