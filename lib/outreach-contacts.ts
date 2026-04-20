import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { STATUS_RANK, type ContactStatus } from "@/lib/outreach-metrics";

export type Contact = typeof schema.contacts.$inferSelect;

/**
 * Read-or-insert a contact row for `email`. If the row exists, return it
 * untouched (preserving its `kind` so a row that started as a 'lead' and is
 * now a customer keeps its history). New rows insert with status='new'.
 */
export async function upsertCustomerContactByEmail(email: string): Promise<Contact> {
  const existing = await db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.email, email))
    .limit(1);
  if (existing.length > 0) return existing[0];

  await db()
    .insert(schema.contacts)
    .values({ email, status: "new", kind: "customer" })
    .onConflictDoNothing();

  const [row] = await db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.email, email))
    .limit(1);
  if (!row) throw new Error("Failed to upsert contact");
  return row;
}

/**
 * Statuses we'll actively upgrade to. 'new', 'drafted', 'scheduled' transitions
 * are managed by their own write paths; 'bounced' is terminal.
 */
type UpgradableStatus = "contacted" | "delivered" | "opened" | "clicked" | "replied";

/**
 * Upgrade a contact's status if `next` ranks higher than the current status.
 * Never overrides 'bounced'. Optionally bumps `lastContactedAt` (only if newer)
 * and clears `gmailDraftId`.
 *
 * Returns the post-update row, or the input row unchanged if nothing was
 * written. Single round trip via .returning(), no pre-read needed.
 */
export async function markContactStatusUpgrade(
  contact: Contact,
  next: UpgradableStatus,
  opts: { lastContactedAt?: Date; clearGmailDraftId?: boolean } = {},
): Promise<Contact> {
  if (contact.status === "bounced") return contact;

  const updates: Partial<Contact> = {};
  const curRank = contact.status in STATUS_RANK
    ? STATUS_RANK[contact.status as Exclude<ContactStatus, "bounced">]
    : 0;
  if (STATUS_RANK[next] > curRank) updates.status = next;
  if (
    opts.lastContactedAt &&
    (!contact.lastContactedAt || opts.lastContactedAt > contact.lastContactedAt)
  ) {
    updates.lastContactedAt = opts.lastContactedAt;
  }
  if (opts.clearGmailDraftId && contact.gmailDraftId !== null) {
    updates.gmailDraftId = null;
  }
  if (Object.keys(updates).length === 0) return contact;

  const [updated] = await db()
    .update(schema.contacts)
    .set(updates)
    .where(eq(schema.contacts.id, contact.id))
    .returning();
  return updated ?? contact;
}
