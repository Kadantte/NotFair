"use server";

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { normalizeEmail } from "@/lib/email-validation";
import {
  isGmailConfigured,
  upsertDraft,
  invalidateThreadCache,
} from "@/lib/gmail";
import {
  CONTACT_KIND_INFLUENCER,
  PLATFORM_LABELS,
  type DiscoveredBy,
  type Platform,
} from "./types";

async function requireDev() {
  const session = await getSession();
  if (!session.connected || !session.isDev) {
    throw new Error("Forbidden");
  }
}

export type InfluencerInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  platform?: Platform | null;
  handle?: string | null;
  followerCount?: number | null;
  niche?: string | null;
  profileUrl?: string | null;
  notes?: string | null;
  discoveredBy?: DiscoveredBy | null;
};

export type InfluencerRow = typeof schema.contacts.$inferSelect;

export async function getInfluencersAction(): Promise<InfluencerRow[]> {
  await requireDev();
  return db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.kind, CONTACT_KIND_INFLUENCER))
    .orderBy(desc(schema.contacts.discoveredAt));
}

function sanitizeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export async function addInfluencerAction(input: InfluencerInput): Promise<InfluencerRow> {
  await requireDev();
  const email = normalizeEmail(input.email);
  const fields = {
    firstName: input.firstName?.trim() || null,
    lastName: input.lastName?.trim() || null,
    platform: input.platform?.trim().toLowerCase() || null,
    handle: input.handle?.trim().replace(/^@/, "") || null,
    followerCount: input.followerCount ?? null,
    niche: input.niche?.trim() || null,
    profileUrl: sanitizeUrl(input.profileUrl?.trim() || null),
    notes: input.notes?.trim() || null,
    discoveredBy: input.discoveredBy?.trim() || "agent",
  };

  // Insert sets kind+status; conflict path leaves existing status alone so an
  // already-contacted row doesn't get reset to 'new' on a notes update.
  const [row] = await db()
    .insert(schema.contacts)
    .values({ email, kind: CONTACT_KIND_INFLUENCER, status: "new", ...fields })
    .onConflictDoUpdate({
      target: schema.contacts.email,
      set: { kind: CONTACT_KIND_INFLUENCER, ...fields },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert influencer");
  return row;
}

export async function deleteInfluencerAction(id: number): Promise<void> {
  await requireDev();
  await db()
    .delete(schema.contacts)
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.kind, CONTACT_KIND_INFLUENCER)));
}

/**
 * Build a personalized outreach email for an influencer using known fields.
 * Pure template — no LLM call. The agent can rewrite via chat after the
 * default lands; this exists so the user can one-click a useful first draft
 * for every influencer instead of staring at a blank editor.
 */
function buildInfluencerDraft(row: InfluencerRow): {
  subject: string;
  body: string;
} {
  const firstName =
    row.firstName?.trim() ||
    (row.handle ? capitalize(row.handle) : null) ||
    "there";
  const platformLabel = formatPlatformForCopy(row.platform);
  const handleLabel = row.handle ? `@${row.handle}` : null;
  const followerLabel = row.followerCount != null ? formatCompact(row.followerCount) : null;
  const nicheLabel = row.niche?.trim() || null;

  const platformLine = platformLabel
    ? handleLabel
      ? `your ${platformLabel} (${handleLabel})`
      : `your ${platformLabel}`
    : "your work";

  const audienceLine = followerLabel
    ? ` Your ${followerLabel} ${nicheLabel ?? ""} audience is exactly who NotFair was built for — ${nicheLabel ? "operators" : "people"} who run their own Google Ads and want an AI copilot they can actually trust.`
    : nicheLabel
      ? ` The ${nicheLabel} angle you cover lines up well with NotFair — an AI copilot for Google Ads that operators can actually trust.`
      : ` NotFair is an AI copilot for Google Ads — agents that propose changes, you approve. Built for operators who manage their own accounts.`;

  const subject = nicheLabel
    ? `Quick partnership idea — NotFair × ${nicheLabel}`
    : `Quick partnership idea — NotFair affiliate program`;

  const body = [
    `Hey ${firstName},`,
    "",
    `I've been following ${platformLine} and wanted to reach out.${audienceLine}`,
    "",
    `We're spinning up an affiliate program for creators in the SMB / paid-marketing space and you stood out as a great fit. The setup is simple: you get a custom link + meaningful rev share on every paying customer, and we'll co-create the framing so it actually feels native to your audience (no forced scripts).`,
    "",
    `Quick stats on us:`,
    `• Free MCP for Google Ads — works with Claude, Cursor, ChatGPT`,
    `• Real audits + safe write actions (approval-gated)`,
    `• Live, growing fast`,
    "",
    `Would you be open to a 15-minute chat next week to see if it makes sense? Happy to send over the affiliate terms first if that's easier.`,
    "",
    `Thanks,`,
    `Tong`,
    `Founder, NotFair`,
    `https://notfair.co`,
  ].join("\n");

  return { subject, body };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Email-copy variant of the platform label — uses inline phrasing
 * ("YouTube channel", lowercase "podcast") that reads naturally in a sentence.
 * UI badges should use `PLATFORM_LABELS` from `./types` instead.
 */
function formatPlatformForCopy(p: string | null): string | null {
  if (!p) return null;
  const copyOverrides: Record<string, string> = {
    youtube: "YouTube channel",
    podcast: "podcast",
    blog: "blog",
  };
  return copyOverrides[p.toLowerCase()] ?? PLATFORM_LABELS[p.toLowerCase() as Platform] ?? p;
}

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Fill the influencer's draft slot with a generated default + sync to Gmail
 * draft so it's visible from the inbox immediately. No-op if a draft already
 * exists (so we don't clobber edits).
 */
export async function generateInfluencerDraftAction(
  id: number,
  opts: { overwrite?: boolean } = {},
): Promise<{ subject: string; body: string; gmailSynced: boolean; syncError: string | null }> {
  await requireDev();
  const [row] = await db()
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.kind, CONTACT_KIND_INFLUENCER)))
    .limit(1);
  if (!row) throw new Error("Influencer not found");

  const existing = row.draftSubject || row.draftBody;
  if (existing && !opts.overwrite) {
    return {
      subject: row.draftSubject ?? "",
      body: row.draftBody ?? "",
      gmailSynced: false,
      syncError: null,
    };
  }

  const { subject, body } = buildInfluencerDraft(row);

  let gmailDraftId: string | null = row.gmailDraftId ?? null;
  let gmailSynced = false;
  let syncError: string | null = null;
  if (isGmailConfigured()) {
    try {
      gmailDraftId = await upsertDraft({
        to: row.email,
        subject,
        body,
        draftId: gmailDraftId,
      });
      gmailSynced = true;
      invalidateThreadCache(row.email);
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
    .where(eq(schema.contacts.id, id));

  return { subject, body, gmailSynced, syncError };
}
