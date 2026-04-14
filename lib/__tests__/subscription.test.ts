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

vi.mock("@/lib/db", () => ({
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
      stripeCustomerId: "stripeCustomerId",
      email: "email",
    },
  },
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
  getUserPlanLimits,
  hasFeature,
  planFromSubscriptionRow,
  isPlanEntitled,
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
}) {
  return {
    email: opts.email ?? null,
    stripeCustomerId: opts.stripeCustomerId ?? "cus_123",
    data: opts.data === undefined ? makeSubData() : opts.data,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("subscription resolver", () => {
  beforeEach(() => {
    mockRow = undefined;
  });

  describe("PLANS registry", () => {
    it("free plan caps at 300 ops/day", () => {
      expect(PLANS.free.limits.dailyOpLimit).toBe(300);
      expect(PLANS.free.features.unlimitedOperations).toBe(false);
    });

    it("growth plan is unlimited", () => {
      expect(PLANS.growth.limits.dailyOpLimit).toBeNull();
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

  describe("getUserPlan + getUserPlanLimits", () => {
    it("free user gets 300/day", async () => {
      mockRow = undefined;
      const plan = await getUserPlan("user-free");
      const limits = await getUserPlanLimits("user-free");
      expect(plan.key).toBe("free");
      expect(limits.dailyOpLimit).toBe(300);
    });

    it("growth user gets unlimited", async () => {
      mockRow = row({ data: makeSubData({ status: "active" }) });
      const limits = await getUserPlanLimits("user-growth");
      expect(limits.dailyOpLimit).toBeNull();
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
