/**
 * Initiates the upstream Meta OAuth flow.
 *
 * Flow:
 *   1. User clicks "Connect Meta" on /connect (Stage 3.5 UI) → browser hits
 *      this route.
 *   2. We require a NotFair session (cookie). Without one, redirect through
 *      Google sign-in first (so the Meta connection has a `user_id` to
 *      attach to).
 *   3. Generate a CSRF nonce, persist it server-side in `oauth_nonces`,
 *      encode {nonce, userId, next} into the OAuth `state` parameter.
 *   4. Redirect to Meta's dialog URL (built via `buildMetaAuthorizeUrl`).
 *
 * Meta posts back to /api/oauth/meta/callback after consent.
 */

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { storeOAuthNonce } from "@/lib/oauth-nonce";
import { getAppOrigin } from "@/lib/app-url";
import { buildMetaAuthorizeUrl } from "@/lib/meta-ads/oauth";
import { isWaitlistApproved } from "@/lib/waitlist";

function getSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/connect?platform=meta_ads&status=connected";
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = getSafeNext(requestUrl.searchParams.get("next"));

  // Resolve the NotFair user from the session cookie. Meta connections are
  // keyed on user_id, so the user has to be signed into NotFair first.
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!sessionToken) {
    // Send through Google sign-in, then bounce back here.
    const signinUrl = new URL("/api/auth/signin", requestUrl);
    signinUrl.searchParams.set(
      "next",
      `${requestUrl.pathname}${requestUrl.search}`,
    );
    return NextResponse.redirect(signinUrl.toString());
  }

  // Don't filter on `customerId <> ''` here: ads-less sessions (user signed
  // in via Google but has no Google Ads account yet) need to be able to
  // start Meta OAuth — connecting Meta is one of the explicit "set up
  // later" paths offered to those users.
  const [session] = await db()
    .select({ id: schema.mcpSessions.id, userId: schema.mcpSessions.userId })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, sessionToken),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!session || !session.userId) {
    // Session row gone or doesn't have a user_id (shouldn't happen for any
    // post-2026 sign-in, but guard anyway). Fall back to sign-in.
    const signinUrl = new URL("/api/auth/signin", requestUrl);
    signinUrl.searchParams.set(
      "next",
      `${requestUrl.pathname}${requestUrl.search}`,
    );
    return NextResponse.redirect(signinUrl.toString());
  }

  const [existingMetaConnection] = await db()
    .select({ id: schema.adPlatformConnections.id })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, session.userId),
        eq(schema.adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  // The waitlist wall is UX only unless the OAuth start endpoint enforces the
  // same policy. Existing connected users may still re-authorize; unconnected
  // users need approval (granted from /dev/waitlist) before we create a Meta
  // OAuth state.
  if (!existingMetaConnection && !(await isWaitlistApproved("meta_ads"))) {
    return NextResponse.redirect(new URL("/manage-ads-accounts/meta-ads", requestUrl));
  }

  const nonce = randomBytes(16).toString("hex");
  await storeOAuthNonce(nonce);

  // Encode the state we need on callback. base64url so it round-trips through
  // Meta's redirect without query-string escaping issues.
  const state = Buffer.from(
    JSON.stringify({
      nonce,
      userId: session.userId,
      next,
    }),
  ).toString("base64url");

  const redirectUri = `${getAppOrigin()}/api/oauth/meta/callback`;
  const dialogUrl = buildMetaAuthorizeUrl({ state, redirectUri });

  return NextResponse.redirect(dialogUrl);
}
