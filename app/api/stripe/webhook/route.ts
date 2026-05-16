import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { getStripeWebhookSecret } from "@/lib/stripe/config";
import { handleStripeEvent } from "@/lib/stripe/sync";
import { sendTiktokConversion } from "@/lib/tiktok-capi";
import { getAppOrigin } from "@/lib/app-url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, getStripeWebhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    if (result.action === "synced" && result.tiktokSubscribe) {
      after(
        sendTiktokConversion({
          event: "Subscribe",
          eventId: result.tiktokSubscribe.eventId,
          email: result.tiktokSubscribe.email,
          externalId: result.tiktokSubscribe.externalId,
          userAgent: request.headers.get("user-agent"),
          pageUrl: `${getAppOrigin()}/upgrade`,
          valueDecimal: result.tiktokSubscribe.valueDecimal,
          currency: result.tiktokSubscribe.currency,
        }),
      );
    }
    return NextResponse.json({ received: true, result });
  } catch (err) {
    console.error("[stripe webhook] handler failed", { type: event.type, err });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
