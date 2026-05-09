/**
 * HighLevel webhook endpoint.
 *
 * - Verifies the `x-wh-signature` header against the configured public key
 *   (RSA) or shared secret (HMAC).
 * - Parses the JSON event and dispatches to `handleWebhookEvent`.
 * - Returns 200 with `{ received: true, result }` on success so HighLevel
 *   doesn't retry. Returns 400 only on signature failure or malformed body.
 *   500 is reserved for unexpected handler exceptions; HighLevel will retry
 *   on 5xx, which is the desired behavior for transient DB errors.
 *
 * Mirrors the Stripe webhook contract (`app/api/stripe/webhook/route.ts`).
 */
import { NextResponse } from "next/server";
import { handleWebhookEvent, verifyWebhookSignature } from "@/lib/gohighlevel/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("x-wh-signature");
  const rawBody = await request.text();

  const verify = verifyWebhookSignature({ rawBody, signature });
  if (!verify.ok) {
    return NextResponse.json({ error: `Invalid signature: ${verify.reason}` }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    return NextResponse.json({ error: `Invalid JSON: ${message}` }, { status: 400 });
  }

  try {
    const result = await handleWebhookEvent(event);
    return NextResponse.json({ received: true, mode: verify.mode, result });
  } catch (e) {
    console.error("[gohighlevel webhook] handler failed", { type: event.type, err: e });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
