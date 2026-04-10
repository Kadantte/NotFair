import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe/client";
import { getUserSubscription } from "@/lib/subscription";
import { getAppOrigin } from "@/lib/app-url";

export async function POST() {
  const session = await getSession();
  if (!session.connected) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sub = await getUserSubscription(session.userId);
  if (!sub.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 });
  }

  const portal = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${getAppOrigin()}/pricing`,
  });

  return NextResponse.json({ url: portal.url });
}
