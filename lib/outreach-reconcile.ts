import "server-only";
import { db, schema } from "@/lib/db";
import type { GmailThreadSummary } from "@/lib/gmail";
import { markContactStatusUpgrade, type Contact } from "@/lib/outreach-contacts";

function parseAddresses(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const angle = part.match(/<([^>]+)>/);
      return (angle ? angle[1] : part).trim().toLowerCase();
    })
    .filter((a) => a.includes("@"));
}

function scanThreads(email: string, threads: GmailThreadSummary[]) {
  let latestOutboundAt: Date | null = null;
  let hasInboundReply = false;
  for (const t of threads) {
    for (const m of t.messages) {
      if (m.isFromMe) {
        if (parseAddresses(m.to).includes(email)) {
          if (!latestOutboundAt || m.date > latestOutboundAt) latestOutboundAt = m.date;
        }
      } else if (parseAddresses(m.from).includes(email)) {
        hasInboundReply = true;
      }
    }
  }
  return { latestOutboundAt, hasInboundReply };
}

/**
 * Inspect Gmail threads for `email` and update the contact row to reflect
 * what we observe: any inbound reply → 'replied', else any outbound →
 * 'contacted'. Sets lastContactedAt to the latest send date. Never downgrades;
 * never overrides 'bounced'. Inserts a row (kind='customer') if `existing` is
 * null and we observed activity.
 *
 * Pass the already-loaded contact (or null) to avoid an extra SELECT. Returns
 * the post-update row, or `existing` unchanged if nothing to do.
 *
 * Best-effort: DB errors are swallowed and logged.
 */
export async function reconcileContactFromThreads(
  email: string,
  threads: GmailThreadSummary[],
  existing: Contact | null,
): Promise<Contact | null> {
  if (threads.length === 0) return existing;
  const target = email.toLowerCase();
  const { latestOutboundAt, hasInboundReply } = scanThreads(target, threads);
  if (!latestOutboundAt && !hasInboundReply) return existing;

  const status = hasInboundReply ? "replied" : "contacted";

  try {
    if (!existing) {
      const [inserted] = await db()
        .insert(schema.contacts)
        .values({
          email: target,
          status,
          kind: "customer",
          lastContactedAt: latestOutboundAt,
        })
        .onConflictDoNothing()
        .returning();
      return inserted ?? null;
    }
    return await markContactStatusUpgrade(existing, status, {
      lastContactedAt: latestOutboundAt ?? undefined,
    });
  } catch (err) {
    console.error("reconcileContactFromThreads failed:", err);
    return existing;
  }
}
