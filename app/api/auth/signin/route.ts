import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { UTM_KEYS } from "@/lib/utm";

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith("/")) {
    return "/connect";
  }

  return next;
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

  // Capture UTM params to thread through the OAuth round-trip
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const val = searchParams.get(key);
    if (val) utm[key] = val;
  }

  // Generate a random nonce for CSRF protection.
  // The nonce goes into both the OAuth state param and a short-lived cookie.
  // The callback verifies they match before proceeding.
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({
    nonce,
    next,
    popup,
    ...(Object.keys(utm).length > 0 ? { utm } : {}),
  })).toString("base64url");

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

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
