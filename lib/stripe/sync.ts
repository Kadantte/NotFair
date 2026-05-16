import "server-only";

import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { stripe as stripeClient } from "./client";
import { stripeMode } from "./config";
import { TRIAL_DURATION_MS } from "@/lib/trial-config";

/**
 * Stripe → DB sync layer.
 *
 * Canonical pattern: every webhook event funnels into one function,
 * `syncStripeSubscription(customerId)`, which re-fetches the FRESH state of
 * that customer's most recent subscription from Stripe and writes it to a
 * single jsonb column. There are no per-event handlers and no per-field
 * extraction in the write path — the resolver in lib/subscription.ts pulls
 * what the UI needs out of `data` at read time.
 *
 * Why this shape:
 *   - Out-of-order webhook bugs are impossible: we always re-fetch.
 *   - Missed-field bugs are impossible: anything Stripe sends is in `data`.
 *   - Adding a new field that affects the UI never requires a migration.
 */

export type TiktokSubscribePayload = {
  eventId: string;
  externalId: string;
  email: string | null;
  valueDecimal: number;
  currency: string;
};

export type SyncResult =
  | { action: "synced"; userId: string; customerId: string; email: string | null; tiktokSubscribe?: TiktokSubscribePayload }
  | { action: "demoted"; userId: string }
  | { action: "skipped"; reason: string };

interface DepsOverride {
  /** Override the DB layer (used in unit tests). */
  database?: typeof db;
  /** Override the Stripe SDK client (used in unit tests). */
  stripe?: typeof stripeClient;
}

function database(deps?: DepsOverride) {
  return (deps?.database ?? db)();
}

function stripeSdk(deps?: DepsOverride) {
  return (deps?.stripe ?? stripeClient)();
}

// ─── Customer-id extraction ───────────────────────────────────────────

function customerIdFromEvent(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const customer = obj.customer;
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer) {
    return (customer as { id: string }).id;
  }
  // For events whose object IS a customer (e.g. customer.created), the id is on the object.
  const id = obj.id;
  if (typeof id === "string" && id.startsWith("cus_")) return id;
  return null;
}

// ─── Core sync function ───────────────────────────────────────────────

/**
 * Re-fetch the latest subscription for a Stripe customer and mirror its
 * full state into our `subscriptions` table. Idempotent — safe to call
 * multiple times. The customer is the source of truth, not the event payload.
 */
export async function syncStripeSubscription(
  customerId: string,
  deps?: DepsOverride,
): Promise<SyncResult> {
  const sdk = stripeSdk(deps);

  // Fetch the most recent subscription for this customer (any status).
  const subs = await sdk.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 1,
    expand: ["data.items.data.price", "data.default_payment_method"],
  });

  // Pull email from the customer object (denormalized for support/debugging).
  const customer = await sdk.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) {
    return { action: "skipped", reason: "customer was deleted at Stripe" };
  }
  const email = (customer as Stripe.Customer).email ?? null;

  // Case A: customer has no subscription on file. Demote any matching row to free
  // by clearing `data` (the resolver returns FREE_SUBSCRIPTION when data is null).
  const env = stripeMode();
  if (subs.data.length === 0) {
    const updated = await database(deps)
      .update(schema.subscriptions)
      .set({ data: null, email, updatedAt: new Date() })
      .where(
        and(
          eq(schema.subscriptions.stripeCustomerId, customerId),
          eq(schema.subscriptions.env, env),
        ),
      )
      .returning({ userId: schema.subscriptions.userId });
    if (updated.length === 0) {
      return { action: "skipped", reason: "no local row for customer with no subscription" };
    }
    return { action: "demoted", userId: updated[0].userId };
  }

  // Case B: customer has a subscription. Mirror it into `data`.
  const sub = subs.data[0];
  const userId = sub.metadata?.userId;
  if (!userId) {
    return { action: "skipped", reason: "subscription has no userId in metadata" };
  }

  const stripeCustomerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const now = new Date();
  const row = {
    userId,
    env,
    email,
    stripeCustomerId,
    data: sub as unknown as Record<string, unknown>,
    updatedAt: now,
  };

  // Insert path: webhook arrived before /api/subscription was ever called.
  // Set the trial clock so this user gets the same 7-day window. On conflict
  // we don't touch trial_ends_at — never reset an existing trial.
  const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_MS);

  await database(deps)
    .insert(schema.subscriptions)
    .values({ ...row, trialEndsAt, createdAt: now })
    .onConflictDoUpdate({
      target: [schema.subscriptions.userId, schema.subscriptions.env],
      set: row,
    });

  return { action: "synced", userId, customerId: stripeCustomerId, email };
}

// ─── Idempotency-aware webhook router ─────────────────────────────────

/**
 * Mark an event as processed. Returns true if this is the first time we've
 * seen it, false if it's a duplicate (Stripe retries).
 */
async function recordEventOnce(
  event: Stripe.Event,
  deps?: DepsOverride,
): Promise<boolean> {
  const inserted = await database(deps)
    .insert(schema.processedStripeEvents)
    .values({ eventId: event.id, type: event.type, processedAt: new Date() })
    .onConflictDoNothing({ target: schema.processedStripeEvents.eventId })
    .returning({ eventId: schema.processedStripeEvents.eventId });
  return inserted.length > 0;
}

/**
 * Top-level webhook event router. All event types funnel into the same
 * sync function — there are no per-event handlers, by design.
 *
 * Exception: on `customer.subscription.created`, attach a `tiktokSubscribe`
 * payload so the route can fire a TikTok `Subscribe` CAPI event. We do NOT
 * fire it from inside this function because the webhook route owns the
 * Next.js `after()` lifecycle — firing from here would either block the
 * webhook response or risk being killed mid-flight on Vercel.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  deps?: DepsOverride,
): Promise<SyncResult> {
  // Idempotency: short-circuit if Stripe is replaying.
  const fresh = await recordEventOnce(event, deps);
  if (!fresh) {
    return { action: "skipped", reason: "duplicate event (already processed)" };
  }

  const customerId = customerIdFromEvent(event);
  if (!customerId) {
    return { action: "skipped", reason: `event ${event.type} has no customer id` };
  }

  const result = await syncStripeSubscription(customerId, deps);

  if (
    event.type === "customer.subscription.created" &&
    result.action === "synced"
  ) {
    const tiktokSubscribe = extractTiktokSubscribePayload(event, result.userId, result.email);
    if (tiktokSubscribe) return { ...result, tiktokSubscribe };
  }

  return result;
}

/**
 * Build the TikTok `Subscribe` CAPI payload from a subscription event.
 * Returns null if the subscription has no price (shouldn't happen for
 * paid subs) — we still want the funnel signal but won't fire a bogus
 * zero-value event.
 */
function extractTiktokSubscribePayload(
  event: Stripe.Event,
  userId: string,
  email: string | null,
): TiktokSubscribePayload | null {
  const sub = event.data.object as Stripe.Subscription;
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price?.unit_amount) return null;

  // Stripe stores amounts in the currency's smallest unit (cents for USD).
  const valueDecimal = price.unit_amount / 100;
  const currency = (price.currency ?? "usd").toUpperCase();

  return {
    eventId: event.id,
    externalId: userId,
    email,
    valueDecimal,
    currency,
  };
}
