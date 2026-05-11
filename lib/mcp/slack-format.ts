import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUserEmail } from "@/lib/auth/get-user-email";

export function truncate(s: string | undefined | null, max: number): string | null {
  if (s == null) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Neutralize Slack control sequences in user-supplied text. Slack's webhook
 * parser interprets `<!channel>`, `<!here>`, `<@USERID>`, `<#CHANNEL>`, and
 * `<URL>` patterns as real notifications/links — an adversarial agent (or one
 * under prompt injection) could otherwise mass-ping the team via the feedback
 * channel. Per Slack's docs we escape `&`, `<`, `>` in user content; static
 * formatting tokens we control (mrkdwn, blockquote `>`) are interpolated
 * around the escaped values, so they remain intact.
 */
export function escapeSlack(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Wrap text in Slack block-quote `>` prefixes. Truncates to maxLen first.
 */
export function quoteBlock(text: string, maxLen = 600): string {
  const t = truncate(text, maxLen) ?? "";
  return escapeSlack(t)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/**
 * Resolve the user's email so triage can reach the affected user. Tries
 * sources in order of reliability:
 *   1. `mcp_sessions.google_email` — the Google account the agent is acting
 *      on behalf of. Authoritative for OAuth/MCP paths and the dev bypass.
 *   2. `subscriptions.email` — Stripe billing email. Covers chat-only paths
 *      where the user has no MCP session yet but did pay.
 *
 * Returns null when neither lookup matches (anon/seed/test flows). Failures
 * are swallowed — Slack/PostHog enrichment is never load-bearing on the
 * tool's primary success.
 */
export async function resolveUserEmail(
  sessionId: number | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  try {
    // Phase-4 step 2: prefer auth.users via userId — that's the canonical
    // identity for every active user. The legacy mcp_sessions lookup by
    // sessionId is kept as a fallback for OAuth tokens still bound via
    // sessionId; once those age out (phase 5), this can drop the branch.
    if (userId) {
      const email = await getUserEmail(userId);
      if (email) return email;
      const [row] = await db()
        .select({ email: schema.subscriptions.email })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.env, "live")))
        .limit(1);
      if (row?.email) return row.email;
    }
    if (sessionId != null) {
      const [row] = await db()
        .select({ email: schema.mcpSessions.googleEmail })
        .from(schema.mcpSessions)
        .where(eq(schema.mcpSessions.id, sessionId))
        .limit(1);
      if (row?.email) return row.email;
    }
  } catch (err) {
    console.error("[resolveUserEmail] email lookup failed:", err);
  }
  return null;
}
