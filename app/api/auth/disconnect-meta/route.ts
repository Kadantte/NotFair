/**
 * Disconnect the user's Meta ad accounts from NotFair.
 *
 * Steps:
 *   1. Look up the user's `ad_platform_connections` row for Meta.
 *   2. Best-effort: revoke the token upstream via DELETE /me/permissions.
 *   3. Cascade-delete every `oauth_access_tokens` and `authorization_codes`
 *      row pointing at this connection (Layer-B tokens are useless without
 *      the backing connection).
 *   4. Delete the `ad_platform_connections` row.
 *
 * After this, /api/mcp/meta_ads will 401 every request from this user until
 * they re-OAuth via /api/oauth/meta/start.
 */

import { NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getEnv } from "@/lib/env";
import { trackServerEvent, flushServerEvents } from "@/lib/analytics-server";

async function revokeUpstream(accessToken: string): Promise<void> {
  // DELETE /v{ver}/me/permissions revokes ALL granted permissions and
  // invalidates the token. Best-effort — we still wipe the local row even
  // if Meta returns an error (e.g. token already expired upstream).
  const version = getEnv("META_GRAPH_API_VERSION") ?? "v21.0";
  const url = `https://graph.facebook.com/${version}/me/permissions?access_token=${encodeURIComponent(accessToken)}`;
  try {
    await fetch(url, { method: "DELETE" });
  } catch (e) {
    console.warn("[disconnect-meta] upstream revoke failed:", e);
  }
}

export async function DELETE() {
  // Use getSession() not getAuthContext() — disconnecting Meta must work for
  // users who have a Meta connection but no Google customer (ads-less Google
  // sessions). Google-strict gates would 403 them otherwise.
  const session = await getSession();
  if (!session.connected || !session.userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 403 });
  }
  const userId = session.userId;

  const [conn] = await db()
    .select({
      id: schema.adPlatformConnections.id,
      accessToken: schema.adPlatformConnections.accessToken,
      refreshToken: schema.adPlatformConnections.refreshToken,
      accountIds: schema.adPlatformConnections.accountIds,
      activeAccountId: schema.adPlatformConnections.activeAccountId,
    })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, userId),
        eq(schema.adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  if (!conn) {
    // Idempotent — disconnecting when nothing's connected is a no-op success.
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  // Best-effort upstream revocation before tearing down local state.
  const tokenToRevoke = conn.accessToken ?? conn.refreshToken;
  if (tokenToRevoke) {
    await revokeUpstream(tokenToRevoke);
  }

  // Cascade: invalidate any oauth_access_tokens / authorization_codes that
  // point at this connection. Without these deletes, an issued oat_meta_ads_*
  // token would 401 (since the JOIN against ad_platform_connections fails)
  // but rows would linger in the DB.
  await db()
    .delete(schema.oauthAccessTokens)
    .where(eq(schema.oauthAccessTokens.connectionId, conn.id));
  await db()
    .delete(schema.authorizationCodes)
    .where(eq(schema.authorizationCodes.connectionId, conn.id));

  await db()
    .delete(schema.adPlatformConnections)
    .where(eq(schema.adPlatformConnections.id, conn.id));

  trackServerEvent(userId, "account_disconnected", {
    platform: "meta_ads",
    account_count: (conn.accountIds ?? []).length,
    had_active_account: conn.activeAccountId != null,
  });
  after(flushServerEvents);

  return NextResponse.json({ ok: true });
}
