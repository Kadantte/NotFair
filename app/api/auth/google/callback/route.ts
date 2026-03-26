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

/** Escape JSON for safe embedding inside <script> tags (prevents </script> breakout). */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function popupPostMessage(json: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><body><script>
      if (window.opener) { window.opener.postMessage(${json}, window.location.origin); }
      window.close();
    </script></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

function popupResponse(data: Record<string, string>) {
  return popupPostMessage(safeJsonForScript({ type: "GOOGLE_ADS_AUTH_SUCCESS", ...data }));
}

function popupErrorResponse(message: string) {
  return popupPostMessage(safeJsonForScript({ type: "GOOGLE_ADS_AUTH_ERROR", error: message }));
}

/** Return the right error response based on whether we're in a popup or full-page flow. */
function errorResponse(message: string, isPopup: boolean) {
  return isPopup ? popupErrorResponse(message) : redirectWithError(message);
}

function popupAccountSelectionResponse(
  accounts: { id: string; name: string }[],
  refreshToken: string,
  origin: string,
) {
  const accountsJson = safeJsonForScript(accounts);
  const refreshTokenJson = safeJsonForScript(refreshToken);
  const originJson = safeJsonForScript(origin);
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; background: #09090b; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .container { max-width: 360px; width: 100%; padding: 24px; text-align: center; }
    h2 { font-size: 20px; margin-bottom: 8px; }
    p { color: #a1a1aa; font-size: 14px; margin-bottom: 24px; }
    button { display: block; width: 100%; padding: 14px 16px; margin-bottom: 8px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; color: #fff; text-align: left; cursor: pointer; font-size: 14px; }
    button:hover { background: #27272a; border-color: #3f3f46; }
    .name { font-weight: 600; }
    .id { color: #71717a; font-size: 12px; font-family: monospace; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Pick an account</h2>
    <p>Which Google Ads account do you want to manage?</p>
    <div id="accounts"></div>
  </div>
  <script>
    const accounts = ${accountsJson};
    const refreshToken = ${refreshTokenJson};
    const origin = ${originJson};
    if (!window.opener) { document.querySelector('p').textContent = 'This page must be opened from the app.'; }
    else {
      const container = document.getElementById('accounts');
      accounts.forEach(a => {
        const btn = document.createElement('button');
        const nameDiv = document.createElement('div');
        nameDiv.className = 'name';
        nameDiv.textContent = a.name;
        const idDiv = document.createElement('div');
        idDiv.className = 'id';
        idDiv.textContent = a.id;
        btn.appendChild(nameDiv);
        btn.appendChild(idDiv);
        btn.onclick = () => {
          window.opener.postMessage({
            type: "GOOGLE_ADS_AUTH_SUCCESS",
            refreshToken,
            customerId: a.id,
            customerName: a.name,
          }, origin);
          window.close();
        };
        container.appendChild(btn);
      });
    }
  </script>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const isPopup = searchParams.get("state") === "popup";

  if (error || !code) {
    const msg = error || "Missing authorization code";
    return errorResponse(msg, isPopup);
  }

  const clientId = getEnv("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_ADS_CLIENT_SECRET");
  const redirectUri = `${getAppOrigin()}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    const msg = "Server misconfiguration: missing Google OAuth credentials";
    return errorResponse(msg, isPopup);
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
      const msg =
        tokenData.error_description ||
        tokenData.error ||
        "Failed to get refresh token";
      return errorResponse(msg, isPopup);
    }

    let customers;
    try {
      // Get accessible Google Ads accounts
      customers = await listAccessibleCustomers(tokenData.refresh_token);
    } catch (error) {
      console.error("[auth] Failed to load Google Ads accounts:", error);
      const msg = `Failed to load Google Ads accounts: ${describeError(error)}`;
      return errorResponse(msg, isPopup);
    }

    const usableAccounts = customers.filter(
      (c) => !("error" in c) && !c.isManager,
    );

    // No usable accounts — error
    if (usableAccounts.length === 0) {
      const msg =
        "No Google Ads accounts found. You may only have manager accounts, which aren't supported yet.";
      return errorResponse(msg, isPopup);
    }

    // If only one account, skip selection
    if (usableAccounts.length === 1) {
      const account = usableAccounts[0];

      if (isPopup) {
        return popupResponse({
          refreshToken: tokenData.refresh_token,
          customerId: account.id,
          customerName: account.name || "Google Ads Account",
        });
      }

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

    // Multiple accounts — show account selection
    const accountsList = usableAccounts.map((a) => ({ id: a.id, name: a.name }));

    if (isPopup) {
      return popupAccountSelectionResponse(
        accountsList,
        tokenData.refresh_token,
        getAppOrigin(),
      );
    }

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
      JSON.stringify(accountsList),
    );

    return NextResponse.redirect(
      `${getAppOrigin()}/connect?pending=${pendingToken}&accounts=${accountsParam}`,
    );
  } catch (e) {
    console.error("[auth] Unexpected callback error:", e);
    const msg = `Authentication failed: ${describeError(e)}`;
    return errorResponse(msg, isPopup);
  }
}
