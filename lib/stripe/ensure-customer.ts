import "server-only";

import { db, schema } from "@/lib/db";
import { stripe } from "@/lib/stripe/client";
import { stripeMode } from "@/lib/stripe/config";
import { TRIAL_DURATION_MS } from "@/lib/trial-config";

/**
 * Create a Stripe customer and persist it to `subscriptions`. Call sites must
 * have already confirmed no customer row exists — this function does no
 * precheck. Idempotent on Stripe's side via the `signup:${userId}` key.
 */
export async function createStripeCustomerForUser(userId: string, email: string | null): Promise<void> {
  const env = stripeMode();
  const customer = await stripe().customers.create(
    { email: email ?? undefined, metadata: { userId } },
    { idempotencyKey: `signup:${env}:${userId}` },
  );

  const now = new Date();
  // First-time row: start the 7-day trial clock. On conflict (row already
  // existed), leave trial_ends_at alone — we never reset an existing trial.
  const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_MS);
  await db()
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
