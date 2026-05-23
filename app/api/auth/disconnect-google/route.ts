/**
 * Disconnect the user's Google Ads connection from NotFair.
 *
 * Google is special: the Google OAuth grant is what authenticates the user
 * into the app. Disconnecting therefore *also* signs them out — there is no
 * "Meta-only" mode where the user keeps their session without a Google
 * grant. After this completes the cookie session is cleared and the user is
 * bounced to login on next request.
 *
 * Steps:
 *   1. Look up every `mcp_sessions` row for this user, plus the user's
 *      `ad_platform_connections` row for Google (if any).
 *   2. Best-effort: revoke the OAuth grant upstream at Google. Revoking any
 *      refresh token in a grant revokes the whole grant.
 *   3. Cascade-delete every `oauth_access_tokens` and `authorization_codes`
 *      row pointing at any of those mcp_sessions ids OR the connection id.
 *   4. Delete the `ad_platform_connections` (google_ads) row.
 *   5. Delete every `mcp_sessions` row for this user.
 *   6. Clear all session cookies on the response.
 *
 * Refuses when the caller is impersonating — disconnecting a user we're
 * impersonating would log out the *real* dev account silently and
 * permanently destroy the impersonated user's connection from the dev's
 * browser. Both outcomes are surprises we never want.
 */

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { clearSessionCookies } from "@/lib/auth-cookies";
import { createClient } from "@/lib/supabase/server";
import { trackServerEvent, flushServerEvents } from "@/lib/analytics-server";

async function clearAllAuthCookies(response: NextResponse): Promise<void> {
  // App session cookies (token, customer, impersonate, profile, activePlatform).
  clearSessionCookies(response);

  // Best-effort Supabase server-side signout. Without it the user would be
  // left "signed in" to Supabase and a stale sb-* cookie could re-mint a
  // session via /auth/callback before they re-authenticate at Google.
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // App cookies are authoritative — if Supabase fails we still log out locally.
  }

  // Expire any leftover sb-* cookies, mirroring /api/auth/signout.
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  }
}

async function revokeUpstream(refreshToken: string): Promise<void> {
  // https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
  // Best-effort — revoking is nice-to-have but the local teardown is what
  // actually severs NotFair's access to the account.
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
  } catch (e) {
    console.warn("[disconnect-google] upstream revoke failed:", e);
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session.connected || !session.userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 403 });
  }
  if (session.impersonating) {
    return NextResponse.json({ error: "impersonating_refused" }, { status: 403 });
  }
  const userId = session.userId;

  const sessionRows = await db()
    .select({
      id: schema.mcpSessions.id,
      refreshToken: schema.mcpSessions.refreshToken,
    })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.userId, userId));

  const [conn] = await db()
    .select({
      id: schema.adPlatformConnections.id,
      refreshToken: schema.adPlatformConnections.refreshToken,
      accountIds: schema.adPlatformConnections.accountIds,
      activeAccountId: schema.adPlatformConnections.activeAccountId,
    })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, userId),
        eq(schema.adPlatformConnections.platform, "google_ads"),
      ),
    )
    .limit(1);

  if (sessionRows.length === 0 && !conn) {
    // Idempotent — nothing to disconnect, but still clear cookies in case
    // the cookie outlived the rows somehow.
    const response = NextResponse.json({ ok: true, alreadyDisconnected: true });
    await clearAllAuthCookies(response);
    return response;
  }

  const tokenToRevoke = conn?.refreshToken ?? sessionRows[0]?.refreshToken;
  if (tokenToRevoke) {
    await revokeUpstream(tokenToRevoke);
  }

  const sessionIds = sessionRows.map((r) => r.id);

  if (sessionIds.length > 0) {
    await db()
      .delete(schema.oauthAccessTokens)
      .where(inArray(schema.oauthAccessTokens.sessionId, sessionIds));
    await db()
      .delete(schema.authorizationCodes)
      .where(inArray(schema.authorizationCodes.sessionId, sessionIds));
  }

  if (conn) {
    await db()
      .delete(schema.oauthAccessTokens)
      .where(eq(schema.oauthAccessTokens.connectionId, conn.id));
    await db()
      .delete(schema.authorizationCodes)
      .where(eq(schema.authorizationCodes.connectionId, conn.id));
    await db()
      .delete(schema.adPlatformConnections)
      .where(eq(schema.adPlatformConnections.id, conn.id));
  }

  if (sessionIds.length > 0) {
    await db()
      .delete(schema.mcpSessions)
      .where(inArray(schema.mcpSessions.id, sessionIds));
  }

  trackServerEvent(userId, "account_disconnected", {
    platform: "google_ads",
    // Prefer the curated subset on the connection; fall back to mcp_sessions
    // count for legacy users whose ad_platform_connections row hadn't been
    // backfilled yet (rare, but a safer denominator than 0).
    account_count: (conn?.accountIds ?? []).length || sessionRows.length,
    had_active_account: conn?.activeAccountId != null,
  });
  after(flushServerEvents);

  const response = NextResponse.json({ ok: true });
  await clearAllAuthCookies(response);
  return response;
}
