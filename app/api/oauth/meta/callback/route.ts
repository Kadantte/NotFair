/**
 * Meta OAuth callback. Meta redirects the user's browser here after consent
 * with `code` (success) or `error` (denial / failure) plus the `state` we
 * sent in /api/oauth/meta/start.
 *
 * Steps:
 *   1. Decode + verify state (base64url JSON), consume the CSRF nonce.
 *   2. If `error`: surface a user-friendly message via /connect query params.
 *   3. Exchange `code` → short-lived token → long-lived (~60 day) token.
 *   4. Enumerate ad accounts the user can target (direct + via BMs).
 *   5. UPSERT into `ad_platform_connections` (one row per user_id+platform).
 *      Active account defaults to the first enumerated account; user can
 *      change in /connect UI.
 *   6. Redirect to /connect with success status.
 */

import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyOAuthNonce } from "@/lib/oauth-nonce";
import { getAppOrigin } from "@/lib/app-url";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  enumerateAdAccounts,
  fetchMetaUser,
  type MetaAdAccount,
} from "@/lib/meta-ads/oauth";

type DecodedState = {
  nonce: string;
  userId: string;
  next: string;
};

function decodeState(raw: string | null): DecodedState | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (
      typeof json !== "object" || json === null
      || typeof json.nonce !== "string"
      || typeof json.userId !== "string"
    ) return null;
    return {
      nonce: json.nonce,
      userId: json.userId,
      next: typeof json.next === "string" && json.next.startsWith("/") ? json.next : "/connect",
    };
  } catch {
    return null;
  }
}

function redirectToConnect(opts: {
  status: "connected" | "error";
  reason?: string;
  next?: string;
}): NextResponse {
  const url = new URL(opts.next ?? "/connect", getAppOrigin());
  // Always set platform=meta_ads so the /connect UI knows which tile to focus.
  url.searchParams.set("platform", "meta_ads");
  url.searchParams.set("status", opts.status);
  if (opts.reason) url.searchParams.set("reason", opts.reason);
  return NextResponse.redirect(url.toString());
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Decode state first so we know where to redirect on error.
  const state = decodeState(stateRaw);
  const next = state?.next;

  // Meta returns `error` when the user denies consent or the request was
  // malformed. Surface a user-friendly status without leaking Meta's prose.
  if (errorParam) {
    const reason = errorParam === "access_denied"
      ? "denied"
      : (errorDescription?.includes("URL Blocked") ? "redirect_uri_invalid" : "meta_error");
    return redirectToConnect({ status: "error", reason, next });
  }

  if (!code) {
    return redirectToConnect({ status: "error", reason: "missing_code", next });
  }

  if (!state) {
    return redirectToConnect({ status: "error", reason: "invalid_state", next });
  }

  // Consume the nonce. Single-use; replay attempts after this fail.
  const nonceOk = await verifyOAuthNonce(state.nonce);
  if (!nonceOk) {
    return redirectToConnect({ status: "error", reason: "nonce_expired", next });
  }

  // Verify the user_id from state still matches an active session — defends
  // against stale state from a logged-out tab.
  const [session] = await db()
    .select({ userId: schema.mcpSessions.userId })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.userId, state.userId),
        sql`${schema.mcpSessions.customerId} <> ''`,
      ),
    )
    .limit(1);

  if (!session) {
    return redirectToConnect({ status: "error", reason: "no_session", next });
  }

  let shortLived: { accessToken: string };
  let longLived: { accessToken: string; expiresIn: number };
  let metaUser: { id: string; email?: string; name?: string };
  let accounts: MetaAdAccount[];
  try {
    const redirectUri = `${getAppOrigin()}/api/oauth/meta/callback`;
    shortLived = await exchangeCodeForShortLivedToken({ code, redirectUri });
    longLived = await exchangeForLongLivedToken(shortLived.accessToken);
    [metaUser, accounts] = await Promise.all([
      fetchMetaUser(longLived.accessToken),
      enumerateAdAccounts(longLived.accessToken),
    ]);
  } catch (e) {
    console.error("[meta-oauth] exchange/enumeration failed:", e);
    return redirectToConnect({ status: "error", reason: "exchange_failed", next });
  }

  const accessTokenExpiresAt = new Date(Date.now() + longLived.expiresIn * 1000);
  const platformMetadata = {
    fb_user_id: metaUser.id,
    fb_user_email: metaUser.email ?? null,
    fb_user_name: metaUser.name ?? null,
    granted_at: new Date().toISOString(),
  };

  // Preserve the user's existing active-account pick if it's still in the
  // newly-enumerated list (re-OAuth shouldn't reset their selection just
  // because they granted access to *more* accounts). Otherwise default to
  // the first enumerated account, or null if the user has none.
  const [existing] = await db()
    .select({ activeAccountId: schema.adPlatformConnections.activeAccountId })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, state.userId),
        eq(schema.adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  const accountIdSet = new Set(accounts.map((a) => a.id));
  const activeAccountId =
    existing?.activeAccountId && accountIdSet.has(existing.activeAccountId)
      ? existing.activeAccountId
      : (accounts[0]?.id ?? null);

  // UPSERT — re-OAuth for the same (user, platform) overwrites the existing
  // row rather than creating a duplicate. Drizzle's `onConflictDoUpdate`
  // matches the unique index `ad_platform_connections_user_platform_idx`.
  await db()
    .insert(schema.adPlatformConnections)
    .values({
      userId: state.userId,
      platform: "meta_ads",
      refreshToken: longLived.accessToken,
      accessToken: longLived.accessToken,
      accessTokenExpiresAt,
      accountIds: accounts,
      activeAccountId,
      platformMetadata,
    })
    .onConflictDoUpdate({
      target: [schema.adPlatformConnections.userId, schema.adPlatformConnections.platform],
      set: {
        refreshToken: longLived.accessToken,
        accessToken: longLived.accessToken,
        accessTokenExpiresAt,
        accountIds: accounts,
        activeAccountId,
        platformMetadata,
        updatedAt: new Date(),
      },
    });

  return redirectToConnect({ status: "connected", next });
}
