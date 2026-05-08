import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type AudienceUser = { userId: string; email: string };

/**
 * Returns one row per user eligible for marketing/product-update emails.
 *
 * Source-of-truth join:
 *   1. Distinct user_ids from `mcp_sessions` (anyone who connected Google Ads)
 *      — this is the canonical "existing users" set for the product today.
 *   2. Email preference: `user_attribution.email` (set at signup) wins;
 *      fall back to most-recent `mcp_sessions.google_email` if missing.
 *   3. Anyone in `email_preferences` with `unsubscribed_marketing_at IS NOT NULL`
 *      is filtered out.
 *   4. Final dedupe by lowercased email — same-email-multiple-userIds (rare,
 *      but possible during account merges) only gets one send.
 *
 * Returns userIds (so the broadcast script can write per-recipient unsubscribe
 * tokens that scope to the right user).
 */
export async function getActiveUserAudience(): Promise<AudienceUser[]> {
  const [sessionUserIds, sessionEmails, attributionRows, optedOut] = await Promise.all([
    db()
      .selectDistinct({ userId: schema.mcpSessions.userId })
      .from(schema.mcpSessions)
      .where(sql`${schema.mcpSessions.userId} IS NOT NULL`),
    db()
      .selectDistinctOn([schema.mcpSessions.userId], {
        userId: schema.mcpSessions.userId,
        googleEmail: schema.mcpSessions.googleEmail,
      })
      .from(schema.mcpSessions)
      .where(
        sql`${schema.mcpSessions.userId} IS NOT NULL AND ${schema.mcpSessions.googleEmail} IS NOT NULL`,
      )
      .orderBy(schema.mcpSessions.userId, sql`${schema.mcpSessions.createdAt} DESC`),
    db()
      .select({
        userId: schema.userAttribution.userId,
        email: schema.userAttribution.email,
      })
      .from(schema.userAttribution),
    db()
      .select({ userId: schema.emailPreferences.userId })
      .from(schema.emailPreferences)
      .where(sql`${schema.emailPreferences.unsubscribedMarketingAt} IS NOT NULL`),
  ]);
  const optedOutUserIds = new Set(optedOut.map((r) => r.userId));

  const emailByUser = new Map<string, string>();
  for (const r of sessionEmails) {
    if (r.userId && r.googleEmail) {
      emailByUser.set(r.userId, r.googleEmail.toLowerCase());
    }
  }
  for (const r of attributionRows) {
    if (r.userId && r.email) emailByUser.set(r.userId, r.email.toLowerCase());
  }

  const audience: AudienceUser[] = [];
  const seenEmails = new Set<string>();
  for (const { userId } of sessionUserIds) {
    if (!userId) continue;
    if (optedOutUserIds.has(userId)) continue;
    const email = emailByUser.get(userId);
    if (!email) continue;
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    audience.push({ userId, email });
  }
  return audience;
}
