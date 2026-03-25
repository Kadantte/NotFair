import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";
import { listAccessibleCustomers } from "@/lib/google-ads";
import { randomBytes } from "crypto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    const origin = getAppOrigin();
    return NextResponse.redirect(
      `${origin}/connect?error=${encodeURIComponent(error || "Missing authorization code")}`,
    );
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET!;
  const redirectUri = `${getAppOrigin()}/api/auth/mcp/callback`;

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.refresh_token) {
      return NextResponse.redirect(
        `${getAppOrigin()}/connect?error=${encodeURIComponent(tokenData.error_description || "Failed to get refresh token")}`,
      );
    }

    // Get accessible Google Ads accounts
    const customers = await listAccessibleCustomers(tokenData.refresh_token);
    const firstCustomer = customers.find((c) => !("error" in c) && !c.isManager);
    const customerId = firstCustomer?.id || customers[0]?.id || "";

    // Generate access token for MCP
    const accessToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year expiry

    // Store session
    await db().insert(schema.mcpSessions).values({
      accessToken,
      refreshToken: tokenData.refresh_token,
      customerId,
      expiresAt: expiresAt.toISOString(),
    });

    // Redirect to connect page with token
    return NextResponse.redirect(
      `${getAppOrigin()}/connect?token=${accessToken}&customer_id=${customerId}&customer_name=${encodeURIComponent(firstCustomer?.name || "Google Ads Account")}`,
    );
  } catch (e) {
    console.error("[mcp-auth] Error:", e);
    return NextResponse.redirect(
      `${getAppOrigin()}/connect?error=${encodeURIComponent("Authentication failed")}`,
    );
  }
}
