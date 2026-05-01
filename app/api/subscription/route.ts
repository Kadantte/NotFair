import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";
import { createStripeCustomerForUser } from "@/lib/stripe/ensure-customer";

/**
 * Lightweight client-facing subscription summary. Used by the sidebar
 * UserMenu to decide whether to enable "Manage subscription".
 */
export async function GET() {
  const session = await getSession();
  if (!session.connected) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sub = await getUserSubscription(session.userId);

  // Backfill Stripe customer for users who signed in before eager provisioning
  // shipped. Fires once per user — subsequent calls find a row and no-op.
  if (!sub.stripeCustomerId && session.userId) {
    const userId = session.userId;
    const email = sub.email ?? session.googleEmail ?? null;
    after(async () => {
      try {
        await createStripeCustomerForUser(userId, email);
      } catch (err) {
        console.error("[stripe] ensureStripeCustomer failed:", err);
      }
    });
  }

  return NextResponse.json({
    plan: sub.plan,
    status: sub.status,
    stripeCustomerId: sub.stripeCustomerId,
    scheduledCancelAt: sub.scheduledCancelAt?.toISOString() ?? null,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    inTrial: sub.inTrial,
  });
}
