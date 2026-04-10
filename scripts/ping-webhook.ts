import Stripe from "stripe";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const secret = process.env.STRIPE_WEBHOOK_SECRET_LIVE;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET_LIVE not set");

  const url = process.argv[2] ?? "https://adsagent.org/api/stripe/webhook";

  // Use an event type our handler explicitly skips so this is a DB no-op.
  const payload = JSON.stringify({
    id: "evt_dummy_ping_" + Date.now(),
    object: "event",
    api_version: "2026-03-25.dahlia",
    created: Math.floor(Date.now() / 1000),
    type: "payment_intent.succeeded",
    livemode: true,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: { id: "pi_dummy_ping", object: "payment_intent" } },
  });

  // Need a Stripe instance to call generateTestHeaderString. The secret key
  // isn't validated for offline signing, so any string works.
  const stripe = new Stripe("sk_live_dummy_for_signing_only", {
    apiVersion: "2026-03-25.dahlia",
  });

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  console.log(`POST ${url}`);
  console.log(`Event: payment_intent.succeeded (handler should skip)`);
  console.log(`Body bytes: ${payload.length}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });

  const body = await res.text();
  console.log(`\n← ${res.status} ${res.statusText}`);
  console.log(body);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
