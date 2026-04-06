"use server";

import { db, schema } from "@/lib/db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

function requireEmail(session: Awaited<ReturnType<typeof getSession>>): string {
  if (!session.connected || !session.googleEmail) redirect("/connect");
  return session.googleEmail;
}

// ─── Contacts ───────────────────────────────────────────────────────

export async function getContactsAction() {
  const session = await getSession();
  const userEmail = requireEmail(session);

  return db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.userEmail, userEmail))
    .orderBy(desc(schema.contacts.createdAt));
}

export async function importContactsAction(
  rows: { email: string; firstName?: string; lastName?: string; company?: string }[]
) {
  const session = await getSession();
  const userEmail = requireEmail(session);

  if (rows.length === 0) return { imported: 0, skipped: 0 };

  // Deduplicate by email within the batch
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const e = r.email.toLowerCase().trim();
    if (!e || seen.has(e)) return false;
    seen.add(e);
    return true;
  });

  // Upsert: skip if email already exists for this user
  let imported = 0;
  for (const row of unique) {
    try {
      await db()
        .insert(schema.contacts)
        .values({
          userEmail,
          email: row.email.toLowerCase().trim(),
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

  return { imported, skipped: unique.length - imported };
}

export async function deleteContactAction(contactId: number) {
  const session = await getSession();
  const userEmail = requireEmail(session);

  await db()
    .delete(schema.contacts)
    .where(
      and(
        eq(schema.contacts.id, contactId),
        eq(schema.contacts.userEmail, userEmail)
      )
    );
}

// ─── Campaigns ──────────────────────────────────────────────────────

export async function getCampaignsAction() {
  const session = await getSession();
  const userEmail = requireEmail(session);

  const campaigns = await db()
    .select()
    .from(schema.outreachCampaigns)
    .where(eq(schema.outreachCampaigns.userEmail, userEmail))
    .orderBy(desc(schema.outreachCampaigns.createdAt));

  // Get email stats for each campaign
  const stats = await Promise.all(
    campaigns.map(async (c) => {
      const [result] = await db()
        .select({
          total: count(),
          sent: count(
            sql`CASE WHEN ${schema.outreachEmails.status} IN ('sent', 'opened') THEN 1 END`
          ),
          opened: count(
            sql`CASE WHEN ${schema.outreachEmails.status} = 'opened' THEN 1 END`
          ),
          failed: count(
            sql`CASE WHEN ${schema.outreachEmails.status} = 'failed' THEN 1 END`
          ),
        })
        .from(schema.outreachEmails)
        .where(eq(schema.outreachEmails.campaignId, c.id));

      return { ...c, stats: result };
    })
  );

  return stats;
}

export async function getCampaignAction(campaignId: number) {
  const session = await getSession();
  const userEmail = requireEmail(session);

  const [campaign] = await db()
    .select()
    .from(schema.outreachCampaigns)
    .where(
      and(
        eq(schema.outreachCampaigns.id, campaignId),
        eq(schema.outreachCampaigns.userEmail, userEmail)
      )
    )
    .limit(1);

  if (!campaign) return null;

  // Get emails with contact info
  const emails = await db()
    .select({
      id: schema.outreachEmails.id,
      status: schema.outreachEmails.status,
      sentAt: schema.outreachEmails.sentAt,
      openedAt: schema.outreachEmails.openedAt,
      error: schema.outreachEmails.error,
      contactEmail: schema.contacts.email,
      contactFirstName: schema.contacts.firstName,
      contactLastName: schema.contacts.lastName,
      contactCompany: schema.contacts.company,
    })
    .from(schema.outreachEmails)
    .innerJoin(
      schema.contacts,
      eq(schema.outreachEmails.contactId, schema.contacts.id)
    )
    .where(eq(schema.outreachEmails.campaignId, campaignId))
    .orderBy(desc(schema.outreachEmails.createdAt));

  return { campaign, emails };
}

export async function createCampaignAction(data: {
  name: string;
  subject: string;
  bodyHtml: string;
  fromName: string;
  replyTo?: string;
  sendRate?: number;
  contactIds: number[];
}) {
  const session = await getSession();
  const userEmail = requireEmail(session);

  const [campaign] = await db()
    .insert(schema.outreachCampaigns)
    .values({
      userEmail,
      name: data.name,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      fromName: data.fromName,
      replyTo: data.replyTo || null,
      sendRate: data.sendRate || 50,
    })
    .returning();

  // Create email entries for each contact
  if (data.contactIds.length > 0) {
    await db()
      .insert(schema.outreachEmails)
      .values(
        data.contactIds.map((contactId) => ({
          campaignId: campaign.id,
          contactId,
        }))
      );
  }

  return campaign;
}

export async function updateCampaignStatusAction(
  campaignId: number,
  status: "active" | "paused" | "draft"
) {
  const session = await getSession();
  const userEmail = requireEmail(session);

  await db()
    .update(schema.outreachCampaigns)
    .set({ status })
    .where(
      and(
        eq(schema.outreachCampaigns.id, campaignId),
        eq(schema.outreachCampaigns.userEmail, userEmail)
      )
    );
}

export async function deleteCampaignAction(campaignId: number) {
  const session = await getSession();
  const userEmail = requireEmail(session);

  // Verify ownership first
  const [campaign] = await db()
    .select({ id: schema.outreachCampaigns.id })
    .from(schema.outreachCampaigns)
    .where(
      and(
        eq(schema.outreachCampaigns.id, campaignId),
        eq(schema.outreachCampaigns.userEmail, userEmail)
      )
    )
    .limit(1);

  if (!campaign) return;

  // Safe to delete now — ownership verified
  await db()
    .delete(schema.outreachEmails)
    .where(eq(schema.outreachEmails.campaignId, campaignId));

  await db()
    .delete(schema.outreachCampaigns)
    .where(eq(schema.outreachCampaigns.id, campaignId));
}
