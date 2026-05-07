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
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { storeOAuthNonce } from "@/lib/oauth-nonce";
import { getAppOrigin } from "@/lib/app-url";
import { buildMetaAuthorizeUrl } from "@/lib/meta-ads/oauth";
import { isWaitlistApproved } from "@/lib/waitlist";
import { identifyUser } from "@/lib/auth/identify-user";

function getSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/connect?platform=meta_ads&status=connected";
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = getSafeNext(requestUrl.searchParams.get("next"));

  // Resolve the NotFair user (Supabase first, adsagent_token cookie fallback).
  // Meta connections are keyed on user_id; ads-less Supabase users still need
  // to be able to start Meta OAuth (Meta is one of the explicit "set up later"
  // paths for users with no Google Ads account).
  const identity = await identifyUser({ source: "meta-oauth-start" });
  if (!identity) {
    // Send through Google sign-in, then bounce back here.
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
        eq(schema.adPlatformConnections.userId, identity.userId),
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
      userId: identity.userId,
      next,
    }),
  ).toString("base64url");

  const redirectUri = `${getAppOrigin()}/api/oauth/meta/callback`;
  const dialogUrl = buildMetaAuthorizeUrl({ state, redirectUri });

  return NextResponse.redirect(dialogUrl);
}
