import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";

type AuthState = {
  next: string;
  popup: boolean;
};

function encodeState(state: AuthState) {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

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

  const state = encodeState({ next, popup });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(url);
}
