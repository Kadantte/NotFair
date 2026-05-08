import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getResend } from "@/lib/resend";

const SOFT_BOUNCE_LIMIT = 3;
const TERMINAL_BAD = ["bounced"];

// Per positive event, the contact statuses we refuse to downgrade.
const CONTACT_BLOCK_BY_EVENT: Record<string, string[]> = {
  "email.delivered": ["opened", "clicked", "replied"],
  "email.opened": ["clicked", "replied"],
  "email.clicked": ["replied"],
};

// Recipient statuses that shouldn't be downgraded by a later event.
const RECIPIENT_TERMINAL = ["bounced", "failed"];

type RecipientUpdate = {
  status: string;
  field: "deliveredAt" | "openedAt" | "clickedAt" | "bouncedAt";
  blockIfStatusIn?: string[];
  errorMessage?: string;
};

const RECIPIENT_UPDATE_BY_EVENT: Record<string, RecipientUpdate> = {
  "email.delivered": {
    status: "delivered",
    field: "deliveredAt",
    blockIfStatusIn: ["opened", "clicked", ...RECIPIENT_TERMINAL],
  },
  "email.opened": {
    status: "opened",
    field: "openedAt",
    blockIfStatusIn: ["clicked", ...RECIPIENT_TERMINAL],
  },
  "email.clicked": {
    status: "clicked",
    field: "clickedAt",
    blockIfStatusIn: RECIPIENT_TERMINAL,
  },
};

const HARD_BOUNCE_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);

async function updateBroadcastRecipient(
  emailId: string | undefined,
  next: RecipientUpdate,
): Promise<void> {
  if (!emailId) return;
  const setPatch: Record<string, unknown> = {
    status: next.status,
    [next.field]: new Date(),
  };
  if (next.errorMessage) setPatch.errorMessage = next.errorMessage;
  const conditions = [eq(schema.broadcastRecipients.resendId, emailId)];
  if (next.blockIfStatusIn && next.blockIfStatusIn.length > 0) {
    conditions.push(notInArray(schema.broadcastRecipients.status, next.blockIfStatusIn));
  }
  await db()
    .update(schema.broadcastRecipients)
    .set(setPatch)
    .where(and(...conditions));
}

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

  let event: { type: string; data: { to?: string[] | string; email_id?: string } };
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
  const emailId = event.data?.email_id;

  if (HARD_BOUNCE_EVENTS.has(event.type)) {
    await Promise.all([
      db()
        .update(schema.contacts)
        .set({
          unsubscribed: true,
          status: "bounced",
          bounceCount: sql`${schema.contacts.bounceCount} + 1`,
        })
        .where(inArray(schema.contacts.email, emails)),
      updateBroadcastRecipient(emailId, {
        status: "bounced",
        field: "bouncedAt",
        errorMessage: event.type,
      }),
    ]);
    return NextResponse.json({ ok: true, action: "bounced" });
  }

  if (event.type === "email.delivery_delayed") {
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

  const contactBlock = CONTACT_BLOCK_BY_EVENT[event.type];
  const recipientUpdate = RECIPIENT_UPDATE_BY_EVENT[event.type];
  if (!contactBlock || !recipientUpdate) {
    return NextResponse.json({ ok: true, action: "ignored", type: event.type });
  }

  await Promise.all([
    db()
      .update(schema.contacts)
      .set({ status: recipientUpdate.status })
      .where(
        and(
          inArray(schema.contacts.email, emails),
          notInArray(schema.contacts.status, [...contactBlock, ...TERMINAL_BAD]),
        ),
      ),
    updateBroadcastRecipient(emailId, recipientUpdate),
  ]);
  return NextResponse.json({ ok: true, action: recipientUpdate.status });
}
