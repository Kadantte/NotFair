import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe/client";
import { getGrowthMonthlyPriceId, getGrowthYearlyPriceId, stripeMode } from "@/lib/stripe/config";
import { getUserSubscription } from "@/lib/subscription";
import { TRIAL_DURATION_MS } from "@/lib/trial-config";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.connected) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Account missing stable userId" }, { status: 400 });
  }

  let body: { interval?: "month" | "year" } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — default to monthly
  }
  const interval = body.interval === "year" ? "year" : "month";
  const priceId = interval === "year" ? getGrowthYearlyPriceId() : getGrowthMonthlyPriceId();

  const existing = await getUserSubscription(session.userId);
  const origin = getAppOrigin();
  const email = session.googleEmail ?? null;

  // Eagerly create the Stripe customer up front (the canonical pattern). This
  // gives us a stable customer id BEFORE checkout, so the portal works the
  // moment the user lands back on /pricing — no race with the first webhook.
  let customerId = existing.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: email ?? undefined,
      metadata: { userId: session.userId },
    });
    customerId = customer.id;

    const now = new Date();
    const env = stripeMode();
    // First time we're seeing this user → start the 7-day trial clock.
    // Existing rows keep their original trial_ends_at.
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_MS);
    await db()
      .insert(schema.subscriptions)
      .values({
        userId: session.userId,
        env,
        email,
        stripeCustomerId: customerId,
        data: null,
        trialEndsAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.subscriptions.userId, schema.subscriptions.env],
        set: { email, stripeCustomerId: customerId, updatedAt: now },
      });
  }

  const checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/upgrade?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/upgrade?status=cancelled`,
    customer: customerId,
    client_reference_id: session.userId,
    metadata: { userId: session.userId },
    subscription_data: {
      metadata: { userId: session.userId },
    },
    allow_promotion_codes: true,
  }, {
    // Idempotency: protect against double-clicks / network retries creating
    // duplicate sessions for the same user + price.
    idempotencyKey: `checkout:${session.userId}:${priceId}:${Math.floor(Date.now() / 60_000)}`,
  });

  return NextResponse.json({ url: checkout.url });
}
