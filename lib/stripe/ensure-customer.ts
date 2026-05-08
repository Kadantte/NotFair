import "server-only";

import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { stripe } from "@/lib/stripe/client";
import { stripeMode } from "@/lib/stripe/config";
import { TRIAL_DURATION_MS } from "@/lib/trial-config";

interface Deps {
  database?: typeof db;
  stripe?: typeof stripe;
  idempotencyKey?: string;
  now?: Date;
}

/**
 * Create a Stripe customer and persist it to `subscriptions`. Call sites must
 * have already confirmed no customer row exists — this function does no
 * precheck.
 *
 * Idempotency: a fresh per-attempt UUID is used for the Stripe `customers.create`
 * call. We deliberately do NOT key on `userId` — that would let Stripe's 24-hour
 * idempotency cache replay a now-deleted customer id (e.g. after a dev-reset
 * that called `customers.del`), persisting a tombstoned id into the new row.
 * The narrow window this leaves open — a network failure mid-response causing
 * a true client-side retry — at worst creates a duplicate orphan Stripe customer;
 * the upsert below still writes exactly one row per (userId, env).
 */
export async function createStripeCustomerForUser(
  userId: string,
  email: string | null,
  deps: Deps = {},
): Promise<void> {
  const env = stripeMode();
  const stripeClient = (deps.stripe ?? stripe)();
  const database = (deps.database ?? db)();
  const customer = await stripeClient.customers.create(
    { email: email ?? undefined, metadata: { userId } },
    { idempotencyKey: deps.idempotencyKey ?? `signup:${env}:${userId}:${randomUUID()}` },
  );

  const now = deps.now ?? new Date();
  // First-time row: start the 7-day trial clock. On conflict (row already
  // existed), leave trial_ends_at alone — we never reset an existing trial.
  const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_MS);
  await database
    .insert(schema.subscriptions)
    .values({
      userId,
      env,
      email,
      stripeCustomerId: customer.id,
      data: null,
      trialEndsAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.subscriptions.userId, schema.subscriptions.env],
      set: { email, stripeCustomerId: customer.id, updatedAt: now },
    });
}
