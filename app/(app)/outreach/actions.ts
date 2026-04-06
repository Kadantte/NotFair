"use server";

import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { validateEmails } from "@/lib/email-validation";

// ─── Contacts (Leads) ──────────────────────────────────────────────

export async function getContactsAction() {
  return db()
    .select()
    .from(schema.contacts)
    .orderBy(desc(schema.contacts.createdAt));
}

export async function importContactsAction(
  rows: { email: string; firstName?: string; lastName?: string; company?: string }[]
) {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const e = r.email.toLowerCase().trim();
    if (!e || seen.has(e)) return false;
    seen.add(e);
    return true;
  });

  const emailsToValidate = unique.map((r) => r.email.toLowerCase().trim());
  const validationResults = await validateEmails(emailsToValidate);

  let imported = 0;
  const invalidEmails: string[] = [];

  for (const row of unique) {
    const email = row.email.toLowerCase().trim();
    const result = validationResults.get(email);

    if (result && !result.valid) {
      invalidEmails.push(`${email} (${result.reason})`);
      continue;
    }

    try {
      await db()
        .insert(schema.contacts)
        .values({
          email,
          firstName: row.firstName?.trim() || null,
          lastName: row.lastName?.trim() || null,
          company: row.company?.trim() || null,
        })
        .onConflictDoNothing();
      imported++;
    } catch {
      // skip duplicates
    }
  }

  return { imported, skipped: unique.length - imported, invalidEmails };
}

export async function deleteContactAction(contactId: number) {
  await db()
    .delete(schema.contacts)
    .where(eq(schema.contacts.id, contactId));
}

export async function saveDraftAction(
  contactId: number,
  subject: string,
  body: string
) {
  await db()
    .update(schema.contacts)
    .set({ draftSubject: subject, draftBody: body, status: "drafted" })
    .where(eq(schema.contacts.id, contactId));
}

export async function sendOutreachAction(contactId: number) {
  const [contact] = await db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);

  if (!contact || !contact.draftSubject || !contact.draftBody) {
    throw new Error("No draft to send");
  }

  if (contact.unsubscribed || contact.status === "bounced") {
    throw new Error("Contact is unsubscribed or previously bounced");
  }

  // Send via Resend
  const { getResend } = await import("@/lib/resend");
  const resend = getResend();

  const { error } = await resend.emails.send({
    from: "Tong from AdsAgent <tong.chen@adsagent.org>",
    to: contact.email,
    subject: contact.draftSubject,
    replyTo: "tong.chen@adsagent.org",
    text: contact.draftBody,
  });

  if (error) throw new Error(error.message);

  // Mark as contacted
  await db()
    .update(schema.contacts)
    .set({ status: "contacted", lastContactedAt: new Date() })
    .where(eq(schema.contacts.id, contactId));
}
