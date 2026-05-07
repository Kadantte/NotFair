import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import {
  ATTRIBUTION_PARAM_KEYS,
  type FirstTouchAttribution,
  UTM_KEYS,
  isInternalAttributionReferrer,
  parseAttributionCookie,
  sanitizeAttribution,
} from "@/lib/utm";
import { storeOAuthNonce } from "@/lib/oauth-nonce";

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith("/")) {
    return "/connect";
  }

  return next;
}

// Narrow allowlist — anything outside this falls back to "consent" so a
// crafted ?prompt= can't smuggle arbitrary values into Google's OAuth URL.
const ALLOWED_PROMPTS = new Set([
  "consent",
  "select_account",
  "select_account consent",
]);

function getSafePrompt(prompt: string | null): string {
  if (!prompt) return "consent";
  const normalized = prompt.replace(/\+/g, " ").trim();
  return ALLOWED_PROMPTS.has(normalized) ? normalized : "consent";
}

function attributionFromRequest(
  request: Request,
  searchParams: URLSearchParams,
): FirstTouchAttribution | null {
  const requestUrl = new URL(request.url);
  const raw: Record<string, unknown> = {
    ...(parseAttributionCookie(request.headers.get("cookie")) ?? {}),
  };

  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const val = searchParams.get(key);
    if (val) raw[key] = val;
  }

  const signupReferrer = searchParams.get("signup_referrer") ?? raw.signup_referrer;
  if (
    typeof signupReferrer === "string" &&
    !isInternalAttributionReferrer(signupReferrer, requestUrl.hostname)
  ) {
    raw.signup_referrer = signupReferrer;
  } else {
    delete raw.signup_referrer;
    delete raw.signup_referrer_domain;
  }

  return sanitizeAttribution(raw);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const popup = searchParams.get("popup") === "1";
  const next = getSafeNext(searchParams.get("next"));

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const redirectUri = `${getAppOrigin()}/auth/callback`;
  const scope = "openid email profile https://www.googleapis.com/auth/adwords";

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing Google Ads Client ID" },
      { status: 500 },
    );
  }

  const attribution = attributionFromRequest(request, searchParams);

  // Capture UTM params to thread through the OAuth round-trip
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const val = attribution?.[key] ?? searchParams.get(key);
    if (val) utm[key] = val;
  }

  // The caller passes the original marketing referrer (e.g. github.com) so we
  // can attribute it on user_signed_up — the HTTP Referer header on the
  // callback is always accounts.google.com, which is useless for attribution.
  const signupReferrer = attribution?.signup_referrer;

  // Generate a random nonce for CSRF protection.
  // The nonce goes into both the OAuth state param and a short-lived cookie.
  // The callback verifies they match before proceeding.
  const scopeRetry = searchParams.get("scope_retry") === "1";

  const nonce = randomBytes(16).toString("hex");
  await storeOAuthNonce(nonce);
  const state = Buffer.from(JSON.stringify({
    nonce,
    next,
    popup,
    ...(scopeRetry ? { scope_retry: true } : {}),
    ...(Object.keys(utm).length > 0 ? { utm } : {}),
    ...(signupReferrer ? { signup_referrer: signupReferrer } : {}),
    ...(attribution ? { attribution } : {}),
  })).toString("base64url");

  const prompt = getSafePrompt(searchParams.get("prompt"));
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=${encodeURIComponent(prompt)}&state=${encodeURIComponent(state)}`;

  const response = NextResponse.redirect(url);
  response.cookies.set("oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  return response;
}
