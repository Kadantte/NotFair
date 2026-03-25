import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";

export async function GET() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const redirectUri = `${getAppOrigin()}/api/auth/mcp/callback`;
  const scope = "https://www.googleapis.com/auth/adwords";

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing Google Ads Client ID" },
      { status: 500 },
    );
  }

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

  return NextResponse.redirect(url);
}
