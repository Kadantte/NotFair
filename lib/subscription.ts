import "server-only";

import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { resolvePrice, stripeMode } from "@/lib/stripe/config";

// ─── Plan registry ────────────────────────────────────────────────────
//
// Adding a new paid plan: add an entry to PLANS, drop the matching Stripe
// price IDs into env, extend resolvePrice() in lib/stripe/config.ts, and
// every gate built on hasFeature() / getPlanLimits() picks it up for free.

export type PlanKey = "free" | "growth";

export interface PlanLimits {
  /** Daily Google Ads operation count. null = unlimited. */
  dailyOpLimit: number | null;
}

export interface PlanFeatures {
  unlimitedOperations: boolean;
  prioritySupport: boolean;
}

export interface Plan {
  key: PlanKey;
  name: string;
  /** Monthly price in USD (display only — Stripe is source of truth). */
  priceMonthlyUsd: number;
  priceYearlyUsd: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    priceYearlyUsd: 0,
    limits: { dailyOpLimit: 300 },
    features: { unlimitedOperations: false, prioritySupport: false },
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceMonthlyUsd: 99,
    priceYearlyUsd: 950,
    limits: { dailyOpLimit: null },
    features: { unlimitedOperations: true, prioritySupport: true },
  },
};

export function getPlan(key: PlanKey | string | null | undefined): Plan {
  if (key && key in PLANS) return PLANS[key as PlanKey];
  return PLANS.free;
}

// ─── Resolver ─────────────────────────────────────────────────────────

export interface UserSubscription {
  plan: PlanKey;
  status: string;
  email: string | null;
  interval: "month" | "year" | null;
  currentPeriodEnd: Date | null;
  /** Legacy relational schedule flag (cancel at end of current period) */
  cancelAtPeriodEnd: boolean;
  /** Absolute cancel timestamp (Stripe `cancel_at` — independent of CAPE) */
  cancelAt: Date | null;
  /** Computed: when the cancel will actually take effect, if scheduled. */
  scheduledCancelAt: Date | null;
  trialEnd: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

const FREE_SUBSCRIPTION: UserSubscription = {
  plan: "free",
  status: "no_subscription",
  email: null,
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  cancelAt: null,
  scheduledCancelAt: null,
  trialEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
};

/**
 * Stripe statuses that grant access. `past_due` keeps access while Stripe
 * retries the card; `canceled`/`unpaid` drop the user back to free.
 */
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isPlanEntitled(status: string): boolean {
  return ENTITLED_STATUSES.has(status);
}

/**
 * The single function that translates a stored Stripe subscription into our
 * domain model. Pulls everything out of `data` — no flat columns to read.
 */
function resolveFromStripeData(
  data: Stripe.Subscription | null,
  email: string | null,
  stripeCustomerId: string | null,
): UserSubscription {
  if (!data) {
    return { ...FREE_SUBSCRIPTION, email, stripeCustomerId };
  }

  const status = data.status;
  const item = data.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const interval = (item?.price?.recurring?.interval as "month" | "year" | null) ?? null;
  // Stripe moved current_period_end to the item level in newer API versions;
  // fall back to the subscription level for older shapes.
  const periodEndTs =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (data as unknown as { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = periodEndTs ? new Date(periodEndTs * 1000) : null;
  const cancelAtPeriodEnd = !!data.cancel_at_period_end;
  const cancelAt = data.cancel_at ? new Date(data.cancel_at * 1000) : null;
  const trialEnd = data.trial_end ? new Date(data.trial_end * 1000) : null;

  // Plan resolution: only entitled subs map to a paid plan; everything else is free.
  let plan: PlanKey = "free";
  if (isPlanEntitled(status) && priceId) {
    const resolved = resolvePrice(priceId);
    if (resolved && resolved.plan in PLANS) plan = resolved.plan as PlanKey;
  }

  // scheduledCancelAt prefers the absolute timestamp when set (modern portal flow);
  // falls back to current period end when only the legacy CAPE flag is on.
  const scheduledCancelAt = cancelAt ?? (cancelAtPeriodEnd ? currentPeriodEnd : null);

  return {
    plan,
    status,
    email,
    interval,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelAt,
    scheduledCancelAt,
    trialEnd,
    stripeCustomerId,
    stripeSubscriptionId: data.id,
  };
}

export async function getUserSubscription(userId: string | null | undefined): Promise<UserSubscription> {
  if (!userId) return FREE_SUBSCRIPTION;

  const [row] = await db()
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.env, stripeMode()),
      ),
    )
    .limit(1);

  if (!row) return FREE_SUBSCRIPTION;

  return resolveFromStripeData(
    row.data as Stripe.Subscription | null,
    row.email,
    row.stripeCustomerId,
  );
}

export async function getUserPlan(userId: string | null | undefined): Promise<Plan> {
  const sub = await getUserSubscription(userId);
  return getPlan(sub.plan);
}

export async function getUserPlanLimits(userId: string | null | undefined): Promise<PlanLimits> {
  return (await getUserPlan(userId)).limits;
}

/** Generic feature gate. Use `hasFeature(userId, "unlimitedOperations")`. */
export async function hasFeature(userId: string | null | undefined, feature: keyof PlanFeatures): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features[feature];
}

// ─── Pure helper for tests ────────────────────────────────────────────

export function planFromSubscriptionRow(row: { data: Stripe.Subscription | null } | null | undefined): PlanKey {
  if (!row) return "free";
  return resolveFromStripeData(row.data, null, null).plan;
}
