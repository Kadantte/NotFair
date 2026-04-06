import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, lte, asc } from "drizzle-orm";
import { getResend } from "@/lib/resend";

const DELAY_MS = 3 * 60 * 1000; // 3 minutes between emails

/**
 * Send scheduled outreach emails that are due, spaced 3 minutes apart.
 *
 * Triggered by Vercel Cron weekdays at 9am PT (see vercel.json).
 * Finds all contacts with scheduled_at <= now, sends them one at a time
 * with a 3-minute delay between each to improve deliverability.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await db()
    .select()
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.status, "scheduled"),
        lte(schema.contacts.scheduledAt!, now)
      )
    )
    .orderBy(asc(schema.contacts.scheduledAt));

  if (due.length === 0) {
    return NextResponse.json({ sent: 0, message: "No emails due" });
  }

  const resend = getResend();
  const results: { email: string; company: string | null; success: boolean; error?: string }[] = [];

  for (let i = 0; i < due.length; i++) {
    const contact = due[i];

    if (!contact.draftSubject || !contact.draftBody) {
      results.push({ email: contact.email, company: contact.company, success: false, error: "No draft" });
      continue;
    }

    if (contact.unsubscribed || contact.status === "bounced") {
      results.push({ email: contact.email, company: contact.company, success: false, error: "Bounced/unsubscribed" });
      continue;
    }

    // Wait 3 minutes between sends (skip delay for the first one)
    if (i > 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    const { error } = await resend.emails.send({
      from: "Tong from AdsAgent <tong.chen@adsagent.org>",
      to: contact.email,
      subject: contact.draftSubject,
      replyTo: "tong.chen@adsagent.org",
      text: contact.draftBody,
    });

    if (error) {
      results.push({ email: contact.email, company: contact.company, success: false, error: error.message });
      continue;
    }

    await db()
      .update(schema.contacts)
      .set({ status: "contacted", lastContactedAt: new Date() })
      .where(eq(schema.contacts.id, contact.id));

    results.push({ email: contact.email, company: contact.company, success: true });
  }

  const sent = results.filter((r) => r.success).length;
  return NextResponse.json({ sent, total: due.length, results });
}
