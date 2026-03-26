import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { listAccessibleCustomers } from "@/lib/google-ads";
import { randomBytes } from "crypto";

function redirectWithError(message: string) {
  return NextResponse.redirect(
    `${getAppOrigin()}/connect?error=${encodeURIComponent(message)}`,
  );
}

function describeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return redirectWithError(error || "Missing authorization code");
  }

  const clientId = getEnv("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_ADS_CLIENT_SECRET");
  const redirectUri = `${getAppOrigin()}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return redirectWithError(
      "Server misconfiguration: missing Google OAuth credentials",
    );
  }

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

    if (!tokenResponse.ok || tokenData.error || !tokenData.refresh_token) {
      return redirectWithError(
        tokenData.error_description ||
          tokenData.error ||
          "Failed to get refresh token",
      );
    }

    let customers;
    try {
      // Get accessible Google Ads accounts
      customers = await listAccessibleCustomers(tokenData.refresh_token);
    } catch (error) {
      console.error("[auth] Failed to load Google Ads accounts:", error);
      return redirectWithError(
        `Failed to load Google Ads accounts: ${describeError(error)}`,
      );
    }

    const usableAccounts = customers.filter(
      (c) => !("error" in c) && !c.isManager,
    );

    // No usable accounts — error
    if (usableAccounts.length === 0) {
      return redirectWithError(
        "No Google Ads accounts found. You may only have manager accounts, which aren't supported yet.",
      );
    }

    // If only one account, skip selection
    if (usableAccounts.length === 1) {
      const account = usableAccounts[0];
      const accessToken = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      try {
        await db().insert(schema.mcpSessions).values({
          accessToken,
          refreshToken: tokenData.refresh_token,
          customerId: account.id,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (error) {
        console.error("[auth] Failed to create MCP session:", error);
        return redirectWithError(
          `Failed to create session: ${describeError(error)}`,
        );
      }

      return NextResponse.redirect(
        `${getAppOrigin()}/connect?token=${accessToken}&customer_name=${encodeURIComponent(account.name || "Google Ads Account")}`,
      );
    }

    // Multiple accounts — store pending session for account selection
    const pendingToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    try {
      await db().insert(schema.mcpSessions).values({
        accessToken: pendingToken,
        refreshToken: tokenData.refresh_token,
        customerId: "", // pending selection
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[auth] Failed to create pending MCP session:", error);
      return redirectWithError(
        `Failed to create session: ${describeError(error)}`,
      );
    }

    const accountsParam = encodeURIComponent(
      JSON.stringify(
        usableAccounts.map((a) => ({ id: a.id, name: a.name })),
      ),
    );

    return NextResponse.redirect(
      `${getAppOrigin()}/connect?pending=${pendingToken}&accounts=${accountsParam}`,
    );
  } catch (e) {
    console.error("[auth] Unexpected callback error:", e);
    return redirectWithError(`Authentication failed: ${describeError(e)}`);
  }
}
