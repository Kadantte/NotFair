/**
 * Tests for the subscription resolver. Stripe is the source of truth — the
 * resolver pulls plan / status / interval / cancel state from the `data`
 * jsonb column at read time. There are no flat columns to mock anymore.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/stripe/config", () => ({
  isStripeTestMode: () => true,
  stripeMode: () => "test" as const,
  getStripeSecretKey: () => "sk_test_dummy",
  getStripePublishableKey: () => "pk_test_dummy",
  getStripeWebhookSecret: () => "whsec_dummy",
  getGrowthProductId: () => "prod_test",
  getGrowthMonthlyPriceId: () => "price_monthly",
  getGrowthYearlyPriceId: () => "price_yearly",
  resolvePrice: (id: string) => {
    if (id === "price_monthly") return { plan: "growth" as const, interval: "month" as const };
    if (id === "price_yearly") return { plan: "growth" as const, interval: "year" as const };
    return null;
  },
}));

let mockRow: Record<string, unknown> | undefined = undefined;
let mockMcpSessionEmail: string | null = null;

vi.mock("@/lib/db", () => {
  return {
    db: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => (mockRow ? [mockRow] : []),
          }),
        }),
      }),
    }),
    schema: {
      subscriptions: {
        userId: "userId",
        env: "env",
        stripeCustomerId: "stripeCustomerId",
        email: "email",
      },
    },
  };
});

// Phase-4 step 2: subscription resolver looks up dev email via getUserEmail
// (auth.users) instead of mcp_sessions. Mock returns whatever the test sets.
vi.mock("@/lib/auth/get-user-email", () => ({
  getUserEmail: vi.fn(async () => mockMcpSessionEmail),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ["eq", ...args]),
  and: vi.fn((...args: unknown[]) => ["and", ...args]),
}));

import {
  PLANS,
  getPlan,
  getUserPlan,
  getUserSubscription,
  hasFeature,
  planFromSubscriptionRow,
  isPlanEntitled,
  checkAccess,
  TRIAL_DURATION_MS,
} from "@/lib/subscription";

// ─── Stripe.Subscription factory ──────────────────────────────────────

function makeSubData(opts: {
  id?: string;
  status?: string;
  priceId?: string;
  interval?: "month" | "year";
  cancelAtPeriodEnd?: boolean;
  cancelAt?: number | null;
  trialEnd?: number | null;
  periodEnd?: number;
} = {}) {
  return {
    id: opts.id ?? "sub_test",
    object: "subscription",
    status: opts.status ?? "active",
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    cancel_at: opts.cancelAt ?? null,
    trial_end: opts.trialEnd ?? null,
    items: {
      data: [
        {
          id: "si_1",
          current_period_end: opts.periodEnd,
          price: {
            id: opts.priceId ?? "price_monthly",
            recurring: { interval: opts.interval ?? "month" },
          },
        },
      ],
    },
  };
}

function row(opts: {
  data?: ReturnType<typeof makeSubData> | null;
  email?: string | null;
  stripeCustomerId?: string | null;
  trialEndsAt?: Date | null;
}) {
  return {
    email: opts.email ?? null,
    stripeCustomerId: opts.stripeCustomerId ?? "cus_123",
    data: opts.data === undefined ? makeSubData() : opts.data,
    // Default: in-trial (signup ~1h ago, trial ends ~6 days from now). Tests
    // that need expired or post-trial state pass an explicit trialEndsAt.
    trialEndsAt: opts.trialEndsAt === undefined
      ? new Date(Date.now() + TRIAL_DURATION_MS - 3_600_000)
      : opts.trialEndsAt,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("subscription resolver", () => {
  beforeEach(() => {
    mockRow = undefined;
    mockMcpSessionEmail = null;
  });

  describe("PLANS registry", () => {
    it("free plan does not grant unlimited operations", () => {
      expect(PLANS.free.features.unlimitedOperations).toBe(false);
    });

    it("growth plan grants unlimited operations", () => {
      expect(PLANS.growth.features.unlimitedOperations).toBe(true);
    });

    it("growth pricing matches the spec ($99 / $950)", () => {
      expect(PLANS.growth.priceMonthlyUsd).toBe(99);
      expect(PLANS.growth.priceYearlyUsd).toBe(950);
    });
  });

  describe("getPlan", () => {
    it("returns free for null/undefined/unknown", () => {
      expect(getPlan(null).key).toBe("free");
      expect(getPlan(undefined).key).toBe("free");
      expect(getPlan("nonexistent").key).toBe("free");
    });
    it("returns growth for 'growth'", () => {
      expect(getPlan("growth").key).toBe("growth");
    });
  });

  describe("getUserSubscription — driven by data jsonb", () => {
    it("returns free defaults for null userId", async () => {
      const sub = await getUserSubscription(null);
      expect(sub.plan).toBe("free");
      expect(sub.stripeCustomerId).toBeNull();
    });

    it("returns free defaults when no row exists", async () => {
      mockRow = undefined;
      const sub = await getUserSubscription("user-no-row");
      expect(sub.plan).toBe("free");
    });

    it("row exists but data is null → free, but with email/customerId preserved", async () => {
      mockRow = row({ data: null, email: "f@x", stripeCustomerId: "cus_pre" });
      const sub = await getUserSubscription("user-prestamp");
      expect(sub.plan).toBe("free");
      expect(sub.email).toBe("f@x");
      expect(sub.stripeCustomerId).toBe("cus_pre");
    });

    it("active monthly subscription resolves to growth", async () => {
      mockRow = row({
        data: makeSubData({ status: "active", interval: "month", priceId: "price_monthly" }),
        email: "f@x",
      });
      const sub = await getUserSubscription("user-active");
      expect(sub.plan).toBe("growth");
      expect(sub.status).toBe("active");
      expect(sub.interval).toBe("month");
      expect(sub.email).toBe("f@x");
    });

    it("active yearly subscription resolves with year interval", async () => {
      mockRow = row({
        data: makeSubData({ status: "active", interval: "year", priceId: "price_yearly" }),
      });
      const sub = await getUserSubscription("user-yearly");
      expect(sub.plan).toBe("growth");
      expect(sub.interval).toBe("year");
    });

    it("past_due is still entitled (Stripe is retrying the card)", async () => {
      mockRow = row({ data: makeSubData({ status: "past_due" }) });
      const sub = await getUserSubscription("user-past-due");
      expect(sub.plan).toBe("growth");
      expect(sub.status).toBe("past_due");
    });

    it("trialing status keeps the user entitled", async () => {
      const trialEnd = Math.floor(Date.UTC(2026, 4, 1) / 1000);
      mockRow = row({ data: makeSubData({ status: "trialing", trialEnd }) });
      const sub = await getUserSubscription("user-trial");
      expect(sub.plan).toBe("growth");
      expect(sub.trialEnd?.getTime()).toBe(trialEnd * 1000);
    });

    it("canceled status drops to free (status preserved for display)", async () => {
      mockRow = row({ data: makeSubData({ status: "canceled" }) });
      const sub = await getUserSubscription("user-canceled");
      expect(sub.plan).toBe("free");
      expect(sub.status).toBe("canceled");
    });

    it("unpaid status drops to free", async () => {
      mockRow = row({ data: makeSubData({ status: "unpaid" }) });
      const sub = await getUserSubscription("user-unpaid");
      expect(sub.plan).toBe("free");
    });

    it("incomplete status drops to free", async () => {
      mockRow = row({ data: makeSubData({ status: "incomplete" }) });
      const sub = await getUserSubscription("user-incomplete");
      expect(sub.plan).toBe("free");
    });

    it("unknown price id falls back to free", async () => {
      mockRow = row({ data: makeSubData({ status: "active", priceId: "price_mystery" }) });
      const sub = await getUserSubscription("user-mystery");
      expect(sub.plan).toBe("free");
    });
  });

  // ─── The bug that motivated the resolver pattern ────────────────────

  describe("scheduledCancelAt", () => {
    it("legacy portal flow (cancel_at_period_end true): falls back to current_period_end", async () => {
      const periodEnd = Math.floor(Date.UTC(2026, 4, 10) / 1000);
      mockRow = row({
        data: makeSubData({ cancelAtPeriodEnd: true, cancelAt: null, periodEnd }),
      });
      const sub = await getUserSubscription("user-legacy");
      expect(sub.scheduledCancelAt?.getTime()).toBe(periodEnd * 1000);
      expect(sub.cancelAtPeriodEnd).toBe(true);
    });

    it("modern portal flow (cancel_at set, CAPE false): uses cancel_at directly", async () => {
      const cancelAt = Math.floor(Date.UTC(2026, 4, 10) / 1000);
      mockRow = row({
        data: makeSubData({ cancelAtPeriodEnd: false, cancelAt }),
      });
      const sub = await getUserSubscription("user-modern");
      expect(sub.scheduledCancelAt?.getTime()).toBe(cancelAt * 1000);
      expect(sub.cancelAtPeriodEnd).toBe(false);
      expect(sub.cancelAt?.getTime()).toBe(cancelAt * 1000);
    });

    it("cancel_at takes precedence over cancel_at_period_end if both set", async () => {
      const cancelAt = Math.floor(Date.UTC(2026, 3, 15) / 1000);
      const periodEnd = Math.floor(Date.UTC(2026, 4, 10) / 1000);
      mockRow = row({
        data: makeSubData({ cancelAtPeriodEnd: true, cancelAt, periodEnd }),
      });
      const sub = await getUserSubscription("user-both");
      expect(sub.scheduledCancelAt?.getTime()).toBe(cancelAt * 1000);
    });

    it("no scheduled cancel returns null", async () => {
      mockRow = row({ data: makeSubData({ cancelAtPeriodEnd: false, cancelAt: null }) });
      const sub = await getUserSubscription("user-renewing");
      expect(sub.scheduledCancelAt).toBeNull();
    });
  });

  describe("getUserPlan", () => {
    it("free user resolves to the free plan", async () => {
      mockRow = undefined;
      const plan = await getUserPlan("user-free");
      expect(plan.key).toBe("free");
    });

    it("growth user resolves to the growth plan", async () => {
      mockRow = row({ data: makeSubData({ status: "active" }) });
      const plan = await getUserPlan("user-growth");
      expect(plan.key).toBe("growth");
    });
  });

  describe("checkAccess (3-tier: paid / trial / free_post_trial)", () => {
    it("free user with trial in the future → trial tier (anchor returned)", async () => {
      const trialEndsAt = new Date(Date.now() + 86_400_000);
      mockRow = row({ data: null, trialEndsAt });
      const sub = await getUserSubscription("user-free-in-trial");
      expect(sub.plan).toBe("free");
      expect(sub.inTrial).toBe(true);
      const access = await checkAccess("user-free-in-trial");
      expect(access.kind).toBe("trial");
      if (access.kind === "trial") expect(access.trialEndsAt.getTime()).toBe(trialEndsAt.getTime());
    });

    it("free user with trial in the past → free_post_trial (no longer ok:false)", async () => {
      // Behavior change: post-trial free users are no longer hard-blocked at
      // the resolver. They drop into the 300-ops/30d cap regime, which the
      // rate limiter enforces. Locks in the new semantics.
      const trialEndsAt = new Date(Date.now() - 86_400_000);
      mockRow = row({ data: null, trialEndsAt });
      const sub = await getUserSubscription("user-trial-expired");
      expect(sub.inTrial).toBe(false);
      const access = await checkAccess("user-trial-expired");
      expect(access.kind).toBe("free_post_trial");
      if (access.kind === "free_post_trial") {
        expect(access.quotaAnchor.getTime()).toBe(trialEndsAt.getTime());
      }
    });

    it("growth user passes as paid regardless of trial state", async () => {
      mockRow = row({
        data: makeSubData({ status: "active" }),
        trialEndsAt: new Date(Date.now() - 86_400_000),
      });
      const access = await checkAccess("user-growth-expired-trial");
      expect(access.kind).toBe("paid");
    });

    it("Stripe-trialing user with expired app-side trial → paid (regression guard)", async () => {
      mockRow = row({
        data: makeSubData({ status: "trialing" }),
        trialEndsAt: new Date(Date.now() - 30 * 86_400_000),
      });
      const access = await checkAccess("user-stripe-trialing-expired-app-trial");
      expect(access.kind).toBe("paid");
    });

    it("past_due Growth user with expired app-side trial → paid", async () => {
      mockRow = row({
        data: makeSubData({ status: "past_due" }),
        trialEndsAt: new Date(Date.now() - 86_400_000),
      });
      const access = await checkAccess("user-past-due-expired-app-trial");
      expect(access.kind).toBe("paid");
    });

    it("canceled Growth user with expired app-side trial → free_post_trial", async () => {
      // Once Stripe drops them to canceled, isPlanEntitled is false → plan
      // resolves back to "free", so they fall to the 300/period regime.
      mockRow = row({
        data: makeSubData({ status: "canceled" }),
        trialEndsAt: new Date(Date.now() - 86_400_000),
      });
      const access = await checkAccess("user-canceled-expired-trial");
      expect(access.kind).toBe("free_post_trial");
    });

    it("free user with NULL trialEndsAt → free_post_trial with anchor=now (legacy fallback)", async () => {
      // No trial_ends_at on the row (legacy / migration hole). Defensive
      // fallback: treat as already post-trial with the period anchored to
      // "now" so we never retroactively count old ops against a fresh user.
      mockRow = row({ data: null, trialEndsAt: null });
      const before = Date.now();
      const access = await checkAccess("user-no-trial-row");
      const after = Date.now();
      expect(access.kind).toBe("free_post_trial");
      if (access.kind === "free_post_trial") {
        expect(access.quotaAnchor.getTime()).toBeGreaterThanOrEqual(before);
        expect(access.quotaAnchor.getTime()).toBeLessThanOrEqual(after);
      }
    });
  });

  describe("hasFeature", () => {
    it("free user does NOT have unlimitedOperations", async () => {
      mockRow = undefined;
      expect(await hasFeature("free-user", "unlimitedOperations")).toBe(false);
      expect(await hasFeature("free-user", "prioritySupport")).toBe(false);
    });

    it("growth user has unlimitedOperations and prioritySupport", async () => {
      mockRow = row({ data: makeSubData({ status: "active" }) });
      expect(await hasFeature("growth-user", "unlimitedOperations")).toBe(true);
      expect(await hasFeature("growth-user", "prioritySupport")).toBe(true);
    });
  });

  describe("dev-email override", () => {
    it("dev emails resolve to growth with unlimited ops", async () => {
      mockRow = undefined;
      mockMcpSessionEmail = "tongchen92@gmail.com";
      const sub = await getUserSubscription("dev-user");
      expect(sub.plan).toBe("growth");
      expect(sub.status).toBe("active");
      expect(await hasFeature("dev-user", "unlimitedOperations")).toBe(true);
    });

    it("non-dev emails stay on free", async () => {
      mockRow = undefined;
      mockMcpSessionEmail = "someone@example.com";
      const sub = await getUserSubscription("normal-user");
      expect(sub.plan).toBe("free");
    });

    it("override does not override real paid Stripe subscription state", async () => {
      // If a dev actually pays, the real Stripe subscription (e.g. past_due)
      // must flow through instead of being masked by the override.
      mockRow = row({ data: makeSubData({ status: "past_due" }) });
      mockMcpSessionEmail = "tongchen92@gmail.com";
      const sub = await getUserSubscription("dev-user");
      expect(sub.plan).toBe("growth");
      expect(sub.status).toBe("past_due");
    });
  });

  describe("pure helpers", () => {
    it("isPlanEntitled covers active/trialing/past_due", () => {
      expect(isPlanEntitled("active")).toBe(true);
      expect(isPlanEntitled("trialing")).toBe(true);
      expect(isPlanEntitled("past_due")).toBe(true);
      expect(isPlanEntitled("canceled")).toBe(false);
      expect(isPlanEntitled("unpaid")).toBe(false);
      expect(isPlanEntitled("incomplete")).toBe(false);
      expect(isPlanEntitled("no_subscription")).toBe(false);
    });

    it("planFromSubscriptionRow handles edge cases", () => {
      expect(planFromSubscriptionRow(null)).toBe("free");
      expect(planFromSubscriptionRow(undefined)).toBe("free");
      expect(planFromSubscriptionRow({ data: null })).toBe("free");
      expect(planFromSubscriptionRow({ data: makeSubData({ status: "active" }) as never })).toBe("growth");
      expect(planFromSubscriptionRow({ data: makeSubData({ status: "canceled" }) as never })).toBe("free");
    });
  });
});
