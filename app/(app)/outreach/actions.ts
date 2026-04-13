"use server";

import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { validateEmails } from "@/lib/email-validation";
import { getSession } from "@/lib/session";
import {
  isGmailConfigured,
  upsertDraft,
  sendDraft,
  invalidateThreadCache,
} from "@/lib/gmail";

async function requireDev() {
  const session = await getSession();
  if (!session.connected || !session.isDev) {
    throw new Error("Forbidden");
  }
}

async function loadContact(contactId: number) {
  const [contact] = await db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);
  if (!contact) throw new Error("Contact not found");
  return contact;
}

// ─── Contacts (Leads) ──────────────────────────────────────────────

export async function getContactsAction() {
  await requireDev();
  return db()
    .select()
    .from(schema.contacts)
    .orderBy(desc(schema.contacts.createdAt));
}

export async function importContactsAction(
  rows: { email: string; firstName?: string; lastName?: string; company?: string }[]
) {
  await requireDev();
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
  await requireDev();
  await db()
    .delete(schema.contacts)
    .where(eq(schema.contacts.id, contactId));
}

/**
 * Save a draft and mirror it to Gmail so it appears in the Gmail Drafts folder.
 * Uses the contact's stored gmailDraftId to update the same draft on subsequent saves.
 * Falls back to local-only save if Gmail isn't configured.
 */
export async function saveDraftAndSyncGmailAction(
  contactId: number,
  subject: string,
  body: string,
): Promise<{ gmailDraftId: string | null; gmailSynced: boolean; syncError: string | null }> {
  await requireDev();
  const contact = await loadContact(contactId);

  let gmailDraftId: string | null = contact.gmailDraftId ?? null;
  let gmailSynced = false;
  let syncError: string | null = null;
  if (isGmailConfigured()) {
    try {
      gmailDraftId = await upsertDraft({
        to: contact.email,
        subject,
        body,
        draftId: gmailDraftId,
      });
      gmailSynced = true;
      invalidateThreadCache(contact.email);
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
      console.error("Gmail draft sync failed:", err);
    }
  }

  await db()
    .update(schema.contacts)
    .set({
      draftSubject: subject,
      draftBody: body,
      status: "drafted",
      gmailDraftId,
    })
    .where(eq(schema.contacts.id, contactId));

  return { gmailDraftId, gmailSynced, syncError };
}

/**
 * Send the contact's draft via Gmail (not Resend) so the full thread stays in
 * tong's Gmail — drafts → Sent → replies all in one place. Mirrors status.
 */
export async function sendDraftViaGmailAction(contactId: number) {
  await requireDev();
  const contact = await loadContact(contactId);
  if (!contact.draftSubject || !contact.draftBody) throw new Error("No draft to send");
  if (contact.unsubscribed || contact.status === "bounced") {
    throw new Error("Contact is unsubscribed or previously bounced");
  }

  const draftId =
    contact.gmailDraftId ??
    (await upsertDraft({
      to: contact.email,
      subject: contact.draftSubject,
      body: contact.draftBody,
      draftId: null,
    }));
  await sendDraft(draftId);
  invalidateThreadCache(contact.email);

  await db()
    .update(schema.contacts)
    .set({
      status: "contacted",
      lastContactedAt: new Date(),
      gmailDraftId: null,
    })
    .where(eq(schema.contacts.id, contactId));
}

export async function scheduleContactAction(contactId: number, scheduledAt: Date) {
  await requireDev();
  await db()
    .update(schema.contacts)
    .set({ status: "scheduled", scheduledAt })
    .where(eq(schema.contacts.id, contactId));
}

export async function sendOutreachAction(contactId: number) {
  await requireDev();
  const contact = await loadContact(contactId);
  if (!contact.draftSubject || !contact.draftBody) {
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
