"use server";

import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { normalizeEmail, validateEmails } from "@/lib/email-validation";
import { getSession } from "@/lib/session";
import {
  isGmailConfigured,
  upsertDraft,
  sendDraft,
  invalidateThreadCache,
  listThreadsForEmail,
  findDraftForEmail,
  type GmailThreadSummary,
} from "@/lib/gmail";
import { reconcileContactFromThreads } from "@/lib/outreach-reconcile";
import {
  markContactStatusUpgrade,
  upsertCustomerContactByEmail,
} from "@/lib/outreach-contacts";

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
  // Leads tab is cold prospects only — customer re-engagement uses its own
  // surface on /dev/[accountId] via getCustomerOutreachAction.
  return db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.kind, "lead"))
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

  await markContactStatusUpgrade(contact, "contacted", {
    lastContactedAt: new Date(),
    clearGmailDraftId: true,
  });
}

export type CustomerOutreachState = {
  /** null when no contact row exists yet (first visit, never saved a draft) */
  contactId: number | null;
  email: string;
  draftSubject: string;
  draftBody: string;
  hasGmailDraftId: boolean;
  canSend: boolean;
  status: string;
  lastContactedAt: string | null;
  gmailConfigured: boolean;
  gmailError: string | null;
  threads: GmailThreadSummary[];
};

/**
 * Read-only outreach state for a connected customer, keyed by email. Never
 * writes — browsing customer pages must not pollute the contacts table. If no
 * contact row exists, returns an empty draft with contactId=null; the row is
 * created lazily on the first save via upsertCustomerContactByEmail.
 */
export async function getCustomerOutreachAction(
  rawEmail: string,
): Promise<CustomerOutreachState> {
  await requireDev();
  const email = normalizeEmail(rawEmail);

  const gmailConfigured = isGmailConfigured();
  let threads: GmailThreadSummary[] = [];
  let gmailError: string | null = null;

  const [[initial], threadsResult] = await Promise.all([
    db().select().from(schema.contacts).where(eq(schema.contacts.email, email)).limit(1),
    gmailConfigured
      ? listThreadsForEmail(email, 15).then(
          (t) => ({ ok: true as const, threads: t }),
          (err: unknown) => ({ ok: false as const, err }),
        )
      : Promise.resolve({ ok: true as const, threads: [] as GmailThreadSummary[] }),
  ]);

  let contact: typeof schema.contacts.$inferSelect | null = initial ?? null;
  if (threadsResult.ok) {
    threads = threadsResult.threads;
    contact = await reconcileContactFromThreads(email, threads, contact);
  } else {
    gmailError = threadsResult.err instanceof Error ? threadsResult.err.message : String(threadsResult.err);
  }

  // Local DB is the source of truth for drafts the app created. If it's empty
  // (e.g., draft was created out-of-band via the Gmail MCP), fall back to the
  // newest matching Gmail draft so the editor isn't blank.
  const localSubject = contact?.draftSubject ?? "";
  const localBody = contact?.draftBody ?? "";
  const hasLocalDraft = !!(localSubject || localBody);
  let fallbackSubject = "";
  let fallbackBody = "";
  let fallbackDraftId: string | null = null;
  if (gmailConfigured && !gmailError && !hasLocalDraft) {
    try {
      const found = await findDraftForEmail(email);
      if (found) {
        fallbackSubject = found.subject;
        fallbackBody = found.body;
        fallbackDraftId = found.draftId;
      }
    } catch (err) {
      gmailError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!contact) {
    return {
      contactId: null,
      email,
      draftSubject: fallbackSubject,
      draftBody: fallbackBody,
      hasGmailDraftId: !!fallbackDraftId,
      canSend: true,
      status: "new",
      lastContactedAt: null,
      gmailConfigured,
      gmailError,
      threads,
    };
  }

  return {
    contactId: contact.id,
    email: contact.email,
    draftSubject: hasLocalDraft ? localSubject : fallbackSubject,
    draftBody: hasLocalDraft ? localBody : fallbackBody,
    hasGmailDraftId: !!contact.gmailDraftId || !!fallbackDraftId,
    canSend: !contact.unsubscribed && contact.status !== "bounced",
    status: contact.status,
    lastContactedAt: contact.lastContactedAt
      ? contact.lastContactedAt.toISOString()
      : null,
    gmailConfigured,
    gmailError,
    threads,
  };
}

/**
 * Save a draft for a connected customer keyed by their email. Creates the
 * contact row on first save (kind='customer'), then delegates to the same
 * Gmail sync path used by the lead flow so behavior stays identical.
 */
export async function saveDraftForCustomerAction(
  rawEmail: string,
  subject: string,
  body: string,
): Promise<{ contactId: number; gmailSynced: boolean; syncError: string | null }> {
  await requireDev();
  const email = normalizeEmail(rawEmail);
  const contact = await upsertCustomerContactByEmail(email);

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
    .where(eq(schema.contacts.id, contact.id));

  return { contactId: contact.id, gmailSynced, syncError };
}

/**
 * Send a customer's draft via Gmail. Looks up by email so callers don't need
 * to thread a contactId through the UI.
 */
export async function sendDraftForCustomerAction(rawEmail: string): Promise<void> {
  await requireDev();
  const email = normalizeEmail(rawEmail);

  // Mirror the read path's graceful fallback: a draft created out-of-band
  // via the Gmail MCP has no contacts row yet, but the editor still shows it
  // because getCustomerOutreachAction falls back to findDraftForEmail. The
  // send path needs the same fallback or send-from-editor breaks.
  const contact = await upsertCustomerContactByEmail(email);
  if (contact.unsubscribed || contact.status === "bounced") {
    throw new Error("Contact is unsubscribed or previously bounced");
  }

  let subject = contact.draftSubject;
  let body = contact.draftBody;
  let draftId: string | null = contact.gmailDraftId ?? null;

  if (!subject || !body) {
    const found = await findDraftForEmail(email);
    if (!found) throw new Error("No draft found for this customer");
    subject = found.subject;
    body = found.body;
    draftId = found.draftId;
  }

  if (!draftId) {
    draftId = await upsertDraft({ to: email, subject, body, draftId: null });
  }
  await sendDraft(draftId);
  invalidateThreadCache(email);

  // Persist the (possibly Gmail-discovered) draft body alongside the status
  // upgrade so the contacts row reflects what was actually sent.
  await db()
    .update(schema.contacts)
    .set({ draftSubject: subject, draftBody: body })
    .where(eq(schema.contacts.id, contact.id));
  await markContactStatusUpgrade(contact, "contacted", {
    lastContactedAt: new Date(),
    clearGmailDraftId: true,
  });
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
    from: "Tong from NotFair <tong.chen@adsagent.org>",
    to: contact.email,
    subject: contact.draftSubject,
    replyTo: "tong.chen@adsagent.org",
    text: contact.draftBody,
  });

  if (error) throw new Error(error.message);

  await markContactStatusUpgrade(contact, "contacted", { lastContactedAt: new Date() });
}
