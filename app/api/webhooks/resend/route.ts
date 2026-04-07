import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, inArray, notInArray, sql } from "drizzle-orm";
import { getResend } from "@/lib/resend";

const SOFT_BOUNCE_LIMIT = 3;

// Statuses that count as "already better" — don't downgrade them
const BETTER_THAN_DELIVERED = ["opened", "clicked", "replied"];
const BETTER_THAN_OPENED = ["clicked", "replied"];
const BETTER_THAN_CLICKED = ["replied"];
const TERMINAL_BAD = ["bounced"];

export async function POST(request: Request) {
  const body = await request.text();

  // Verify Resend webhook signature — fail closed if secret is missing
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET is not set — rejecting webhook");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 401 });
  }
  try {
    const resend = getResend();
    resend.webhooks.verify({
      payload: body,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret: secret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type: string; data: { to?: string[] | string } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toField = event.data?.to;
  const recipients = Array.isArray(toField) ? toField : toField ? [toField] : [];
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, action: "no_recipients" });
  }
  const emails = recipients.map((e) => e.toLowerCase());

  switch (event.type) {
    // ── Hard failures → bounced ──────────────────────────────────────
    case "email.bounced":
    case "email.complained":
    case "email.failed":
    case "email.suppressed": {
      await db()
        .update(schema.contacts)
        .set({
          unsubscribed: true,
          status: "bounced",
          bounceCount: sql`${schema.contacts.bounceCount} + 1`,
        })
        .where(inArray(schema.contacts.email, emails));
      return NextResponse.json({ ok: true, action: "bounced" });
    }

    // ── Soft bounce → increment, mark bounced at threshold ──────────
    case "email.delivery_delayed": {
      await db()
        .update(schema.contacts)
        .set({
          bounceCount: sql`${schema.contacts.bounceCount} + 1`,
          unsubscribed: sql`CASE WHEN ${schema.contacts.bounceCount} + 1 >= ${SOFT_BOUNCE_LIMIT} THEN true ELSE ${schema.contacts.unsubscribed} END`,
          status: sql`CASE WHEN ${schema.contacts.bounceCount} + 1 >= ${SOFT_BOUNCE_LIMIT} THEN 'bounced' ELSE ${schema.contacts.status} END`,
        })
        .where(inArray(schema.contacts.email, emails));
      return NextResponse.json({ ok: true, action: "soft_bounce" });
    }

    // ── Positive engagement — upgrade only, never downgrade ─────────
    case "email.delivered": {
      await db()
        .update(schema.contacts)
        .set({ status: "delivered" })
        .where(
          and(
            inArray(schema.contacts.email, emails),
            notInArray(schema.contacts.status, [...BETTER_THAN_DELIVERED, ...TERMINAL_BAD]),
          )
        );
      return NextResponse.json({ ok: true, action: "delivered" });
    }

    case "email.opened": {
      await db()
        .update(schema.contacts)
        .set({ status: "opened" })
        .where(
          and(
            inArray(schema.contacts.email, emails),
            notInArray(schema.contacts.status, [...BETTER_THAN_OPENED, ...TERMINAL_BAD]),
          )
        );
      return NextResponse.json({ ok: true, action: "opened" });
    }

    case "email.clicked": {
      await db()
        .update(schema.contacts)
        .set({ status: "clicked" })
        .where(
          and(
            inArray(schema.contacts.email, emails),
            notInArray(schema.contacts.status, [...BETTER_THAN_CLICKED, ...TERMINAL_BAD]),
          )
        );
      return NextResponse.json({ ok: true, action: "clicked" });
    }

    default:
      return NextResponse.json({ ok: true, action: "ignored", type: event.type });
  }
}
