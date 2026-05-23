/**
 * Simulate a Resend webhook callback against a local /api/webhooks/resend.
 *
 * Lets you exercise the lifecycle-tracking path (email_sends row gets
 * delivered_at / opened_at / clicked_at / bounced_at + status escalated)
 * without waiting on real Resend deliveries.
 *
 * Usage:
 *   pnpm tsx scripts/simulate-resend-webhook.ts <event> <resend_id> [--url=http://localhost:3000]
 *
 *   event ∈ delivered | opened | clicked | bounced | failed
 *
 * Requires RESEND_WEBHOOK_SECRET in env (matching what the route reads).
 * Generates a Standard Webhooks v1 signature so the route verifies + accepts.
 */
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const EVENT_MAP: Record<string, string> = {
  delivered: "email.delivered",
  opened: "email.opened",
  clicked: "email.clicked",
  bounced: "email.bounced",
  failed: "email.failed",
};

async function main() {
  loadEnvLocal();

  const [eventArg, resendId, ...rest] = process.argv.slice(2);
  if (!eventArg || !resendId) {
    console.error(
      "Usage: pnpm tsx scripts/simulate-resend-webhook.ts <delivered|opened|clicked|bounced|failed> <resend_id> [--url=...]",
    );
    process.exit(1);
  }
  const eventType = EVENT_MAP[eventArg];
  if (!eventType) {
    console.error(`Unknown event '${eventArg}'. Use one of: ${Object.keys(EVENT_MAP).join(", ")}`);
    process.exit(1);
  }

  const urlArg = rest.find((arg) => arg.startsWith("--url="));
  const baseUrl = urlArg?.slice("--url=".length) ?? "http://localhost:3000";
  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/webhooks/resend`;

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing RESEND_WEBHOOK_SECRET in env (set it in .env.local and start `next dev`).");
    process.exit(1);
  }

  const id = `msg_${randomUUID().replace(/-/g, "")}`;
  const timestamp = String(Math.floor(Date.now() / 1000));

  const payload = {
    type: eventType,
    created_at: new Date().toISOString(),
    data: {
      email_id: resendId,
      from: "alert@updates.notfair.co",
      to: ["simulator@local"],
      subject: "Your NotFair trial just ended",
      ...(eventType === "email.bounced"
        ? { bounce: { type: "Permanent", subType: "General", message: "Simulated hard bounce" } }
        : {}),
    },
  };
  const body = JSON.stringify(payload);

  // Standard Webhooks v1 signature:
  //   signed_payload = `${id}.${timestamp}.${body}`
  //   HMAC-SHA256(key=base64-decode(secret_without_prefix), signed_payload)
  //   header value = `v1,<base64-sig>`
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(raw, "base64");
  const signedPayload = `${id}.${timestamp}.${body}`;
  const sig = createHmac("sha256", key).update(signedPayload).digest("base64");
  const signature = `v1,${sig}`;

  console.log(`[simulator] POST ${webhookUrl}`);
  console.log(`[simulator]   event=${eventType} resend_id=${resendId} svix-id=${id}`);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    },
    body,
  });
  const text = await res.text();
  console.log(`[simulator] ← ${res.status} ${text}`);
  if (!res.ok) process.exit(2);
}

main().catch((err) => {
  console.error("[simulator] FAILED:", err);
  process.exit(1);
});
