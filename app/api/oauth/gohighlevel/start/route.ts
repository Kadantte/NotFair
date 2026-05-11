import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { storeOAuthNonce } from "@/lib/oauth-nonce";
import { getAppOrigin } from "@/lib/app-url";
import { getGoHighLevelClientId, getGoHighLevelInstallUrl, getGoHighLevelRedirectUri } from "@/lib/gohighlevel/oauth";
import { GOHIGHLEVEL_SCOPES } from "@/lib/gohighlevel/scopes";
import { identifyUser } from "@/lib/auth/identify-user";

const STATE_COOKIE = "nf_ghl_oauth_state";

function getSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/connect/gohighlevel?status=connected";
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = getSafeNext(requestUrl.searchParams.get("next"));

  // Phase-4 step 2: Supabase-first identity, cookie fallback. We previously
  // also gated on `mcp_sessions.customerId <> ''` (i.e. user must have a
  // Google connection); the connection-check moves to /connect UI surfaces
  // since GHL is platform-agnostic and doesn't strictly require Google Ads.
  const identity = await identifyUser({ source: "gohighlevel-oauth-start" });
  if (!identity) {
    const signinUrl = new URL("/api/auth/signin", requestUrl);
    signinUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
    return NextResponse.redirect(signinUrl.toString());
  }

  const nonce = randomBytes(16).toString("hex");
  await storeOAuthNonce(nonce);

  const state = Buffer.from(JSON.stringify({ nonce, userId: identity.userId, next })).toString("base64url");
  const installUrl = new URL(getGoHighLevelInstallUrl());
  installUrl.searchParams.set("client_id", getGoHighLevelClientId());
  installUrl.searchParams.set("redirect_uri", getGoHighLevelRedirectUri(getAppOrigin()));
  installUrl.searchParams.set("scope", GOHIGHLEVEL_SCOPES.join(" "));
  // HighLevel's Marketplace install link is generated in their UI. If it
  // preserves unknown query params, this gives us normal OAuth CSRF `state`.
  // If it drops them, the callback still verifies the httpOnly cookie below.
  installUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(installUrl.toString());
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
