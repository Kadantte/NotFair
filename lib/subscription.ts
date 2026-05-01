import "server-only";

import type Stripe from "stripe";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { resolvePrice, stripeMode } from "@/lib/stripe/config";
import { DEV_EMAILS } from "@/lib/dev-emails";

const DEV_GROWTH_OVERRIDE_COOKIE = "dev_growth_override";

// Re-exported so existing callers can keep importing from @/lib/subscription.
export { TRIAL_DURATION_MS } from "@/lib/trial-config";

// ─── Plan registry ────────────────────────────────────────────────────
//
// Adding a new paid plan: add an entry to PLANS, drop the matching Stripe
// price IDs into env, extend resolvePrice() in lib/stripe/config.ts, and
// every gate built on hasFeature() picks it up for free.

export type PlanKey = "free" | "growth";

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
  features: PlanFeatures;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    priceYearlyUsd: 0,
    features: { unlimitedOperations: false, prioritySupport: false },
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceMonthlyUsd: 99,
    priceYearlyUsd: 950,
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
  /** Stripe-side trial end (legacy — left in place for any caller that reads it). */
  trialEnd: Date | null;
  /** App-side trial cutoff. Set on subscription row creation = createdAt + 7d. */
  trialEndsAt: Date | null;
  /** True iff the user is currently within their app-side trial window. */
  inTrial: boolean;
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
  trialEndsAt: null,
  inTrial: false,
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
    trialEndsAt: null,
    inTrial: false,
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

  const resolved = row
    ? resolveFromStripeData(
        row.data as Stripe.Subscription | null,
        row.email,
        row.stripeCustomerId,
      )
    : FREE_SUBSCRIPTION;

  // Trial window comes from the row, NOT from Stripe. We track it ourselves
  // so every signed-up user gets a uniform 7 days regardless of whether they
  // ever hit checkout.
  const trialEndsAt = row?.trialEndsAt ?? null;
  const inTrial = !!trialEndsAt && trialEndsAt.getTime() > Date.now();
  const withTrial: UserSubscription = { ...resolved, trialEndsAt, inTrial };

  // Dev-email override: if the account belongs to a developer and doesn't
  // already have a paid entitlement, grant a synthetic growth plan so rate
  // limits and feature gates behave as if they were on Growth. A real Stripe
  // subscription (if ever created) still wins.
  if (withTrial.plan === "free") {
    const devOverride = await maybeDevOverride(userId, withTrial);
    if (devOverride) return devOverride;
  }

  return withTrial;
}

// Cache userId → isDev permanently. Dev-email membership is static for the
// life of the process, and this resolver runs on every rate-limit check.
const devUserCache = new Map<string, boolean>();

async function maybeDevOverride(
  userId: string,
  base: UserSubscription,
): Promise<UserSubscription | null> {
  if (!(await isDevUser(userId))) return null;
  // Per-session opt-out: when the cookie is "off", the override is disabled
  // and the caller falls back to whatever the DB says (passed in as `base`).
  // Note this whole function is only called when `base.plan === "free"`, so
  // a real paid Stripe sub already wins regardless of this toggle — turning
  // override off only matters for devs without a real subscription, who
  // then see the free-plan UX (paywalls, rate limits).
  // `cookies()` throws when called outside a request context (e.g.
  // background jobs, generateMetadata) — in that case keep override on.
  try {
    const store = await cookies();
    if (store.get(DEV_GROWTH_OVERRIDE_COOKIE)?.value === "off") return null;
  } catch {
    /* not in a request context — fall through to override on */
  }
  return { ...base, plan: "growth", status: "active" };
}

async function isDevUser(userId: string): Promise<boolean> {
  const cached = devUserCache.get(userId);
  if (cached !== undefined) return cached;
  const [row] = await db()
    .select({ email: schema.mcpSessions.googleEmail })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.userId, userId))
    .limit(1);
  const isDev = !!row?.email && DEV_EMAILS.includes(row.email);
  devUserCache.set(userId, isDev);
  return isDev;
}

export async function getUserPlan(userId: string | null | undefined): Promise<Plan> {
  const sub = await getUserSubscription(userId);
  return getPlan(sub.plan);
}

/** Generic feature gate. Use `hasFeature(userId, "unlimitedOperations")`. */
export async function hasFeature(userId: string | null | undefined, feature: keyof PlanFeatures): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features[feature];
}

/**
 * Access tier. The rate limiter consumes this to decide whether to skip
 * counting (paid/trial) or enforce the 300-ops-per-30-days free cap
 * (free_post_trial).
 *
 *   - paid           → no caps, no DB hit
 *   - trial          → no caps, no DB hit (within 7-day trial window)
 *   - free_post_trial → subject to FREE_MONTHLY_OP_LIMIT, period anchored
 *                       to trialEndsAt (or createdAt as a legacy fallback)
 */
export type AccessDecision =
  | { kind: "paid" }
  | { kind: "trial"; trialEndsAt: Date }
  | { kind: "free_post_trial"; quotaAnchor: Date };

export async function checkAccess(userId: string | null | undefined): Promise<AccessDecision> {
  const sub = await getUserSubscription(userId);

  // Paid + entitled (active / trialing / past_due) wins unconditionally —
  // ignores the app-side trial fields. Stripe-trialing customers also land
  // here because the resolver maps their plan to "growth".
  if (sub.plan !== "free" && isPlanEntitled(sub.status)) {
    return { kind: "paid" };
  }

  // App-side trial still in progress → unlimited until it ends.
  if (sub.inTrial && sub.trialEndsAt) {
    return { kind: "trial", trialEndsAt: sub.trialEndsAt };
  }

  // Post-trial free. The quota period is anchored to trialEndsAt; legacy
  // rows without one fall back to "now" so the cap effectively starts
  // counting from this request forward (conservative, never retroactive).
  return { kind: "free_post_trial", quotaAnchor: sub.trialEndsAt ?? new Date() };
}

// ─── Pure helper for tests ────────────────────────────────────────────

export function planFromSubscriptionRow(row: { data: Stripe.Subscription | null } | null | undefined): PlanKey {
  if (!row) return "free";
  return resolveFromStripeData(row.data, null, null).plan;
}
