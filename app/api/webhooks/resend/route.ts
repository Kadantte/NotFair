import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { inArray, sql } from "drizzle-orm";

const SOFT_BOUNCE_LIMIT = 3;

/**
 * Resend webhook handler for bounce & complaint events.
 *
 * Configure in Resend dashboard → Webhooks → POST to:
 *   https://adsagent.org/api/webhooks/resend
 *
 * Events to subscribe: email.bounced, email.complained, email.delivery_delayed
 */
export async function POST(request: Request) {
  let event: { type: string; data: { to?: string[] | string; email_id?: string } };
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recipients = Array.isArray(event.data.to)
    ? event.data.to
    : event.data.to
      ? [event.data.to]
      : [];

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, action: "no_recipients" });
  }

  const emails = recipients.map((e) => e.toLowerCase());

  switch (event.type) {
    case "email.bounced":
    case "email.complained": {
      await db()
        .update(schema.contacts)
        .set({
          unsubscribed: true,
          status: "bounced",
          bounceCount: sql`${schema.contacts.bounceCount} + 1`,
        })
        .where(inArray(schema.contacts.email, emails));

      const action = event.type === "email.bounced" ? "hard_bounce" : "complaint";
      return NextResponse.json({ ok: true, action, emails });
    }

    case "email.delivery_delayed": {
      // Increment bounce count and mark as bounced if over threshold — single query
      await db()
        .update(schema.contacts)
        .set({
          bounceCount: sql`${schema.contacts.bounceCount} + 1`,
          unsubscribed: sql`CASE WHEN ${schema.contacts.bounceCount} + 1 >= ${SOFT_BOUNCE_LIMIT} THEN true ELSE ${schema.contacts.unsubscribed} END`,
          status: sql`CASE WHEN ${schema.contacts.bounceCount} + 1 >= ${SOFT_BOUNCE_LIMIT} THEN 'bounced' ELSE ${schema.contacts.status} END`,
        })
        .where(inArray(schema.contacts.email, emails));

      return NextResponse.json({ ok: true, action: "soft_bounce", emails });
    }

    default:
      return NextResponse.json({ ok: true, action: "ignored", type: event.type });
  }
}
