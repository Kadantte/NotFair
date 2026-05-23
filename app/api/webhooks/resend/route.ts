import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";

/**
 * Resend webhook receiver — fans email lifecycle events (delivered, opened,
 * clicked, bounced, complained, failed) onto `email_sends` rows by matching
 * on `resend_id`. Table is kind-agnostic, so any future send type
 * (product_update, quota_warning, …) gets webhook tracking for free as long
 * as its sender inserts an `email_sends` row with the Resend message id.
 *
 * Signature: Resend uses the Standard Webhooks spec — three headers
 * (`svix-id`, `svix-timestamp`, `svix-signature`) plus a secret of the form
 * `whsec_<base64>`. We verify HMAC-SHA256 of `${id}.${timestamp}.${body}`
 * against any `v1,<sig>` entry in the signature header. Replay protection
 * rejects timestamps older than 5 minutes.
 *
 * Fail-closed: missing RESEND_WEBHOOK_SECRET or any signature mismatch
 * returns 401. Unknown event types are acknowledged (200) so Resend stops
 * retrying — we just don't write anything for them.
 */

const REPLAY_TOLERANCE_S = 5 * 60;

interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    [k: string]: unknown;
  };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 401 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await request.text();

  if (!verifySvix({ id: svixId, timestamp: svixTimestamp, signature: svixSignature, body, secret })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resendId = event.data?.email_id;
  if (!resendId || !event.type) {
    // Resend test pings sometimes lack data — ack so they stop retrying.
    return NextResponse.json({ ok: true, ignored: "no email_id or type" });
  }

  const now = new Date();
  const update: Partial<typeof schema.emailSends.$inferInsert> = { updatedAt: now };
  let nextStatus: string | null = null;

  switch (event.type) {
    case "email.delivered":
      update.deliveredAt = now;
      nextStatus = "delivered";
      break;
    case "email.opened":
      update.openedAt = now;
      nextStatus = "opened";
      break;
    case "email.clicked":
      update.clickedAt = now;
      nextStatus = "clicked";
      break;
    case "email.bounced":
      update.bouncedAt = now;
      update.bounceType = event.data?.bounce?.type ?? event.data?.bounce?.subType ?? null;
      update.errorMessage = event.data?.bounce?.message ?? null;
      nextStatus = "bounced";
      break;
    case "email.complained":
    case "email.failed":
      update.errorMessage = (event.data?.bounce?.message as string | undefined) ?? event.type;
      nextStatus = "failed";
      break;
    case "email.sent":
    case "email.delivery_delayed":
      // No-op: cron already stamped `sent_at` at insert time; delay isn't
      // worth surfacing in the dashboard right now.
      return NextResponse.json({ ok: true, type: event.type });
    default:
      return NextResponse.json({ ok: true, ignored: event.type });
  }

  // Only escalate status forward — never downgrade a 'clicked' row to
  // 'delivered' because the delivered event arrived late. Bounced/failed
  // are terminal and always win.
  const result = await db()
    .update(schema.emailSends)
    .set({
      ...update,
      ...(nextStatus ? { status: statusEscalation(nextStatus) } : {}),
    })
    .where(eq(schema.emailSends.resendId, resendId))
    .returning({ id: schema.emailSends.id });

  if (result.length === 0) {
    console.warn(`[webhooks/resend] no trial_end_emails row for resend_id=${resendId} (event=${event.type})`);
  }

  return NextResponse.json({ ok: true, type: event.type, matched: result.length });
}

const STATUS_RANK: Record<string, number> = {
  sent: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  bounced: 10, // terminal — always wins
  failed: 10,
};

// SQL CASE: never overwrite a higher-ranked status with a lower one.
// Postgres-side comparison keeps this race-free against concurrent webhook
// events landing out of order.
function statusEscalation(next: string) {
  const nextRank = STATUS_RANK[next] ?? 0;
  return sql`CASE
    WHEN ${schema.emailSends.status} IN ('bounced', 'failed') THEN ${schema.emailSends.status}
    WHEN ${nextRank} >= (CASE ${schema.emailSends.status}
      WHEN 'sent' THEN 0
      WHEN 'delivered' THEN 1
      WHEN 'opened' THEN 2
      WHEN 'clicked' THEN 3
      ELSE 0
    END) THEN ${next}
    ELSE ${schema.emailSends.status}
  END`;
}

interface SvixVerifyInput {
  id: string;
  timestamp: string;
  signature: string;
  body: string;
  secret: string;
}

function verifySvix({ id, timestamp, signature, body, secret }: SvixVerifyInput): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowS = Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - ts) > REPLAY_TOLERANCE_S) return false;

  // Secrets are stored prefixed (`whsec_<b64>`). Strip the prefix and
  // base64-decode the actual signing key.
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return false;
  }

  const signedPayload = `${id}.${timestamp}.${body}`;
  const expected = createHmac("sha256", key).update(signedPayload).digest("base64");

  // Header carries one or more `v1,<sig>` tokens separated by spaces.
  for (const token of signature.split(" ")) {
    const [version, sig] = token.split(",", 2);
    if (version !== "v1" || !sig) continue;
    try {
      const a = Buffer.from(sig, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // try next signature
    }
  }
  return false;
}
