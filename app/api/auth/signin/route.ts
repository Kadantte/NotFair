import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";

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

  // Generate a random nonce and store it in the DB with the payload.
  // The callback will verify this nonce exists before proceeding.
  const nonce = randomBytes(16).toString("hex");
  const payload = JSON.stringify({ next, popup });
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db().insert(schema.oauthStates).values({ nonce, payload, expiresAt });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(nonce)}`;

  return NextResponse.redirect(url);
}
