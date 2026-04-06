import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, sql, count } from "drizzle-orm";
import { getResend } from "@/lib/resend";

// Vercel Cron runs this every minute
// It picks up active campaigns and sends pending emails respecting the send rate

const FROM_DOMAIN = process.env.OUTREACH_FROM_DOMAIN || "adsagent.org";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://adsagent.org";

function interpolate(
  template: string,
  contact: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  }
): string {
  return template
    .replace(/\{\{firstName\}\}/g, contact.firstName || "")
    .replace(/\{\{lastName\}\}/g, contact.lastName || "")
    .replace(/\{\{company\}\}/g, contact.company || "")
    .replace(/\{\{email\}\}/g, contact.email);
}

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resend = getResend();

  // Get all active campaigns
  const activeCampaigns = await db()
    .select()
    .from(schema.outreachCampaigns)
    .where(eq(schema.outreachCampaigns.status, "active"));

  let totalSent = 0;

  for (const campaign of activeCampaigns) {
    // Calculate how many to send this minute (sendRate is per hour)
    const perMinute = Math.max(1, Math.ceil(campaign.sendRate / 60));

    // Atomically claim pending emails by setting status to 'sending'
    // This prevents duplicate sends if cron double-fires
    const claimed = await db()
      .execute(
        sql`UPDATE outreach_emails SET status = 'sending'
            WHERE id IN (
              SELECT id FROM outreach_emails
              WHERE campaign_id = ${campaign.id} AND status = 'pending'
              LIMIT ${perMinute}
              FOR UPDATE SKIP LOCKED
            )
            RETURNING id`
      );

    const claimedIds = (claimed as unknown as { id: number }[]).map((r) => r.id);

    if (claimedIds.length === 0) {
      // Check if there are any non-terminal emails left
      const [remaining] = await db()
        .select({ c: count() })
        .from(schema.outreachEmails)
        .where(
          and(
            eq(schema.outreachEmails.campaignId, campaign.id),
            sql`${schema.outreachEmails.status} IN ('pending', 'sending')`
          )
        );
      if (Number(remaining.c) === 0) {
        await db()
          .update(schema.outreachCampaigns)
          .set({ status: "completed" })
          .where(eq(schema.outreachCampaigns.id, campaign.id));
      }
      continue;
    }

    // Fetch contact info for claimed emails
    const pendingEmails = await db()
      .select({
        emailId: schema.outreachEmails.id,
        contactId: schema.outreachEmails.contactId,
        email: schema.contacts.email,
        firstName: schema.contacts.firstName,
        lastName: schema.contacts.lastName,
        company: schema.contacts.company,
        unsubscribed: schema.contacts.unsubscribed,
      })
      .from(schema.outreachEmails)
      .innerJoin(
        schema.contacts,
        eq(schema.outreachEmails.contactId, schema.contacts.id)
      )
      .where(sql`${schema.outreachEmails.id} IN (${sql.join(claimedIds.map(id => sql`${id}`), sql`, `)})`);

    for (const pending of pendingEmails) {
      // Skip unsubscribed contacts
      if (pending.unsubscribed) {
        await db()
          .update(schema.outreachEmails)
          .set({ status: "failed", error: "Contact unsubscribed" })
          .where(eq(schema.outreachEmails.id, pending.emailId));
        continue;
      }

      const subject = interpolate(campaign.subject, pending);

      // Add tracking pixel and unsubscribe link
      const trackingPixel = `<img src="${BASE_URL}/api/outreach/track/${pending.emailId}" width="1" height="1" style="display:none" />`;
      const unsubLink = `${BASE_URL}/api/outreach/unsubscribe/${pending.contactId}`;
      const unsubFooter = `<br/><p style="font-size:11px;color:#999;margin-top:24px;">
        <a href="${unsubLink}" style="color:#999;">Unsubscribe</a>
      </p>`;

      const body = interpolate(campaign.bodyHtml, pending) + trackingPixel + unsubFooter;

      try {
        await resend.emails.send({
          from: `${campaign.fromName} <outreach@${FROM_DOMAIN}>`,
          to: pending.email,
          replyTo: campaign.replyTo || undefined,
          subject,
          html: body,
        });

        await db()
          .update(schema.outreachEmails)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(schema.outreachEmails.id, pending.emailId));

        totalSent++;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown send error";
        await db()
          .update(schema.outreachEmails)
          .set({ status: "failed", error: message })
          .where(eq(schema.outreachEmails.id, pending.emailId));
      }
    }
  }

  return NextResponse.json({ sent: totalSent });
}
