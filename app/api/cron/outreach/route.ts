import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, lte, asc, eq } from "drizzle-orm";
import { getResend } from "@/lib/resend";
import { markContactStatusUpgrade } from "@/lib/outreach-contacts";

/**
 * Send scheduled outreach emails that are due.
 *
 * Triggered by Vercel Cron weekdays at 9:15am PT (see vercel.json).
 * Emails are already staggered by scheduled_at, so no artificial delay needed.
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

    const { error } = await resend.emails.send({
      from: "Tong from NotFair <tong.chen@adsagent.org>",
      to: contact.email,
      subject: contact.draftSubject,
      replyTo: "tong.chen@adsagent.org",
      text: contact.draftBody,
    });

    if (error) {
      results.push({ email: contact.email, company: contact.company, success: false, error: error.message });
      continue;
    }

    await markContactStatusUpgrade(contact, "contacted", { lastContactedAt: new Date() });

    results.push({ email: contact.email, company: contact.company, success: true });
  }

  const sent = results.filter((r) => r.success).length;
  return NextResponse.json({ sent, total: due.length, results });
}
