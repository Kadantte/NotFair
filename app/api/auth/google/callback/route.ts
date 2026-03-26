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
  const redirectUri = `${getAppOrigin()}/api/auth/google/callback`;

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
    const usableAccounts = customers.filter(
      (c) => !("error" in c) && !c.isManager,
    );

    // No usable accounts — error
    if (usableAccounts.length === 0) {
      return NextResponse.redirect(
        `${getAppOrigin()}/connect?error=${encodeURIComponent("No Google Ads accounts found. You may only have manager accounts, which aren't supported yet.")}`,
      );
    }

    // If only one account, skip selection
    if (usableAccounts.length === 1) {
      const account = usableAccounts[0];
      const accessToken = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      await db().insert(schema.mcpSessions).values({
        accessToken,
        refreshToken: tokenData.refresh_token,
        customerId: account.id,
        expiresAt: expiresAt.toISOString(),
      });

      return NextResponse.redirect(
        `${getAppOrigin()}/connect?token=${accessToken}&customer_name=${encodeURIComponent(account.name || "Google Ads Account")}`,
      );
    }

    // Multiple accounts — store pending session for account selection
    const pendingToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await db().insert(schema.mcpSessions).values({
      accessToken: pendingToken,
      refreshToken: tokenData.refresh_token,
      customerId: "", // pending selection
      expiresAt: expiresAt.toISOString(),
    });

    const accountsParam = encodeURIComponent(
      JSON.stringify(
        usableAccounts.map((a) => ({ id: a.id, name: a.name })),
      ),
    );

    return NextResponse.redirect(
      `${getAppOrigin()}/connect?pending=${pendingToken}&accounts=${accountsParam}`,
    );
  } catch (e) {
    console.error("[auth] Error:", e);
    return NextResponse.redirect(
      `${getAppOrigin()}/connect?error=${encodeURIComponent("Authentication failed")}`,
    );
  }
}
