import "server-only";

import { db, schema } from "@/lib/db";
import { stripe } from "@/lib/stripe/client";

/**
 * Create a Stripe customer and persist it to `subscriptions`. Call sites must
 * have already confirmed no customer row exists — this function does no
 * precheck. Idempotent on Stripe's side via the `signup:${userId}` key.
 */
export async function createStripeCustomerForUser(userId: string, email: string | null): Promise<void> {
  const customer = await stripe().customers.create(
    { email: email ?? undefined, metadata: { userId } },
    { idempotencyKey: `signup:${userId}` },
  );

  const now = new Date();
  await db()
    .insert(schema.subscriptions)
    .values({
      userId,
      email,
      stripeCustomerId: customer.id,
      data: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.userId,
      set: { email, stripeCustomerId: customer.id, updatedAt: now },
    });
}
