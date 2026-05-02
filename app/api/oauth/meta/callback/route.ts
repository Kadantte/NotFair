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
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyOAuthNonce } from "@/lib/oauth-nonce";
import { getAppOrigin } from "@/lib/app-url";
import { setActivePlatformCookie } from "@/lib/auth-cookies";
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
  // Successful Meta connects always land on /connect/meta-ads so the user
  // sees the MCP setup flow next — the in-page toast (read from
  // ?connected=1) confirms the connection. The `next` param is honored
  // only for error redirects so error UIs can re-render in their original
  // context.
  if (opts.status === "connected") {
    const url = new URL("/connect/meta-ads", getAppOrigin());
    url.searchParams.set("connected", "1");
    return NextResponse.redirect(url.toString());
  }
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
  // against stale state from a logged-out tab. We don't require customerId
  // here because ads-less sessions (user has no Google Ads account yet) are
  // a supported entry point for Meta connection.
  const [session] = await db()
    .select({ userId: schema.mcpSessions.userId })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.userId, state.userId))
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

  // Two-tier account state (mirrors Google's mcp_sessions pattern):
  //   - platform_metadata.available_account_ids = full Meta-side enumeration
  //   - account_ids                              = user's curated subset
  //   - active_account_id                        = default within the subset
  //
  // First-connect default: subset = full enumeration. On re-OAuth, preserve
  // the user's curation by intersecting their existing subset with the new
  // enumeration (keep what's still accessible, drop what they've lost
  // access to upstream, surface newly-available accounts in the UI for them
  // to opt into).
  const [existing] = await db()
    .select({
      activeAccountId: schema.adPlatformConnections.activeAccountId,
      accountIds: schema.adPlatformConnections.accountIds,
    })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, state.userId),
        eq(schema.adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  const enumeratedIdSet = new Set(accounts.map((a) => a.id));
  const accountIdsForRow = existing?.accountIds && existing.accountIds.length > 0
    // Re-OAuth: preserve the user's curated subset, but drop any ids that no
    // longer appear in the upstream enumeration (revoked access, etc.).
    ? existing.accountIds.filter((a) => enumeratedIdSet.has(a.id))
    // First-connect: default subset = full enumeration. User can curate later
    // on /connect-meta.
    : accounts;

  const subsetIdSet = new Set(accountIdsForRow.map((a) => a.id));
  const activeAccountId =
    existing?.activeAccountId && subsetIdSet.has(existing.activeAccountId)
      ? existing.activeAccountId
      : (accountIdsForRow[0]?.id ?? null);

  const platformMetadata = {
    fb_user_id: metaUser.id,
    fb_user_email: metaUser.email ?? null,
    fb_user_name: metaUser.name ?? null,
    granted_at: new Date().toISOString(),
    // Full Meta-side enumeration. Stored as the canonical "available
    // accounts" set so the picker UI doesn't need to re-call Graph API
    // every time the user lands on /connect-meta. Refreshed by re-OAuth.
    available_account_ids: accounts,
  };

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
      accountIds: accountIdsForRow,
      activeAccountId,
      platformMetadata,
    })
    .onConflictDoUpdate({
      target: [schema.adPlatformConnections.userId, schema.adPlatformConnections.platform],
      set: {
        refreshToken: longLived.accessToken,
        accessToken: longLived.accessToken,
        accessTokenExpiresAt,
        accountIds: accountIdsForRow,
        activeAccountId,
        platformMetadata,
        updatedAt: new Date(),
      },
    });

  const response = redirectToConnect({ status: "connected", next });
  // Promote Meta to the active platform once a connection lands with at
  // least one usable account — without this, the navbar dropdown would
  // still highlight Google (or the empty default) and the sidebar gate
  // for Google-only features wouldn't kick in for Meta-first users.
  if (activeAccountId) {
    setActivePlatformCookie(response, "meta_ads");
  }
  return response;
}
