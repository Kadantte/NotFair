import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { listAccessibleCustomers, listClientAccountsUnderManager } from "@/lib/google-ads";
import { randomBytes } from "crypto";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { setSessionCookies } from "@/lib/auth-cookies";

function redirectWithError(message: string) {
  return NextResponse.redirect(
    `${getAppOrigin()}/connect?error=${encodeURIComponent(message)}`,
  );
}

function describeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  // gRPC / Google Ads errors are sometimes plain objects
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.details === "string") return obj.details;
    // GoogleAdsFailure — has an `errors` array
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      const first = obj.errors[0];
      if (typeof first?.message === "string") return first.message;
    }
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

function popupResponse(data: Record<string, unknown>) {
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
  pendingToken: string,
  origin: string,
) {
  const accountsJson = safeJsonForScript(accounts);
  const pendingTokenJson = safeJsonForScript(pendingToken);
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
    p { color: #a1a1aa; font-size: 14px; margin-bottom: 16px; }
    .account { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; margin-bottom: 8px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; color: #fff; text-align: left; cursor: pointer; font-size: 14px; transition: all 0.15s; }
    .account:hover { background: #27272a; border-color: #3f3f46; }
    .account.selected { border-color: #22c55e; background: #052e16; }
    .account input[type="checkbox"] { width: 18px; height: 18px; accent-color: #22c55e; cursor: pointer; flex-shrink: 0; }
    .account-info { flex: 1; min-width: 0; }
    .name { font-weight: 600; }
    .id { color: #71717a; font-size: 12px; font-family: monospace; margin-top: 4px; }
    .connect-btn { display: block; width: 100%; padding: 14px; margin-top: 16px; background: #fff; color: #000; border: none; border-radius: 9999px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .connect-btn:hover:not(:disabled) { background: #e4e4e7; }
    .connect-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .count { color: #a1a1aa; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Select accounts</h2>
    <p>Which Google Ads accounts do you want to manage?</p>
    <div id="accounts"></div>
    <div class="count" id="count"></div>
    <button class="connect-btn" id="connectBtn" disabled>Connect</button>
  </div>
  <script>
    const accounts = ${accountsJson};
    const pendingToken = ${pendingTokenJson};
    const origin = ${originJson};
    const selected = new Set();

    function updateUI() {
      const btn = document.getElementById('connectBtn');
      const count = document.getElementById('count');
      btn.disabled = selected.size === 0;
      btn.textContent = selected.size === 0 ? 'Connect' : 'Connect ' + selected.size + ' account' + (selected.size > 1 ? 's' : '');
      count.textContent = selected.size > 0 ? selected.size + ' of ' + accounts.length + ' selected' : '';
      document.querySelectorAll('.account').forEach(el => {
        const id = el.dataset.id;
        el.classList.toggle('selected', selected.has(id));
        el.querySelector('input').checked = selected.has(id);
      });
    }

    if (!window.opener) { document.querySelector('p').textContent = 'This page must be opened from the app.'; }
    else {
      const container = document.getElementById('accounts');
      accounts.forEach(a => {
        const div = document.createElement('div');
        div.className = 'account';
        div.dataset.id = a.id;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        const info = document.createElement('div');
        info.className = 'account-info';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'name';
        nameDiv.textContent = a.name;
        const idDiv = document.createElement('div');
        idDiv.className = 'id';
        idDiv.textContent = a.id;
        info.appendChild(nameDiv);
        info.appendChild(idDiv);
        div.appendChild(cb);
        div.appendChild(info);
        div.onclick = (e) => {
          if (e.target === cb) return;
          cb.checked = !cb.checked;
          if (cb.checked) selected.add(a.id); else selected.delete(a.id);
          updateUI();
        };
        cb.onchange = () => {
          if (cb.checked) selected.add(a.id); else selected.delete(a.id);
          updateUI();
        };
        container.appendChild(div);
      });

      document.getElementById('connectBtn').onclick = () => {
        const selectedAccounts = accounts.filter(a => selected.has(a.id));
        window.opener.postMessage({
          type: "GOOGLE_ADS_AUTH_SUCCESS",
          pendingToken,
          accounts: selectedAccounts,
          customerId: selectedAccounts[0].id,
          customerName: selectedAccounts[0].name,
        }, origin);
        window.close();
      };
    }
  </script>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

async function getSupabaseUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
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
    // Get Supabase user ID if logged in (for linking MCP session to user)
    const userId = await getSupabaseUserId();

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

    // Verify the adwords scope was actually granted (Google granular permissions
    // let users uncheck individual scopes on the consent screen).
    // Per RFC 6749 §5.1, scope may be omitted when it matches the request — treat that as granted.
    if (typeof tokenData.scope === "string") {
      const grantedScopes = tokenData.scope.split(" ");
      if (!grantedScopes.includes("https://www.googleapis.com/auth/adwords")) {
        return errorResponse(
          "Google Ads permission was not granted. Please try again and make sure the Google Ads checkbox is enabled on the consent screen.",
          isPopup,
        );
      }
    }

    // Fetch Google email from userinfo endpoint
    let googleEmail: string | null = null;
    try {
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();
        googleEmail = userinfo.email ?? null;
      }
    } catch (e) {
      console.warn("[auth] Failed to fetch Google email:", e);
    }

    let customers;
    try {
      // Get accessible Google Ads accounts
      customers = await listAccessibleCustomers(tokenData.refresh_token);
    } catch (error) {
      console.error("[auth] Failed to load Google Ads accounts:", error);
      const raw = describeError(error);
      const msg = raw.includes("PERMISSION_DENIED") || raw.includes("insufficient authentication scopes")
        ? "Google Ads access was not granted. Please try again and make sure to approve all permissions on the Google consent screen."
        : "Failed to load Google Ads accounts. Please try again.";
      return errorResponse(msg, isPopup);
    }

    const directAccounts = customers.filter(
      (c) => !("error" in c) && !c.isManager,
    );
    const managerAccounts = customers.filter(
      (c) => !("error" in c) && c.isManager,
    );

    // If there are no direct accounts, try fetching client accounts from manager accounts
    type AccountEntry = { id: string; name: string; loginCustomerId?: string };
    let usableAccounts: AccountEntry[];

    if (directAccounts.length > 0) {
      usableAccounts = directAccounts.map((a) => ({ id: a.id, name: a.name || "" }));
    } else if (managerAccounts.length > 0) {
      // Cap concurrent Google API calls to avoid rate-limit / quota exhaustion
      const managersToQuery = managerAccounts.slice(0, 10);
      const clientResults = await Promise.all(
        managersToQuery.map(async (mgr) => {
          try {
            const clients = await listClientAccountsUnderManager(
              tokenData.refresh_token,
              mgr.id,
            );
            return clients.map((c) => ({ ...c, loginCustomerId: mgr.id }));
          } catch (err) {
            console.warn(`[auth] Failed to list clients under manager ${mgr.id}:`, err);
            return [];
          }
        }),
      );
      usableAccounts = clientResults.flat();
    } else {
      usableAccounts = [];
    }

    // No usable accounts — error
    if (usableAccounts.length === 0) {
      const msg = managerAccounts.length > 0
        ? "No client accounts found under your manager account. Make sure you have at least one active Google Ads client account."
        : "No Google Ads accounts found. Connect a Google account that has access to at least one Google Ads account.";
      return errorResponse(msg, isPopup);
    }

    // Helper to create a session for a single confirmed account
    async function createSession(account: AccountEntry) {
      const accessToken = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      const customerIds = JSON.stringify([{ id: account.id, name: account.name }]);
      await db().insert(schema.mcpSessions).values({
        accessToken,
        refreshToken: tokenData.refresh_token,
        customerId: account.id,
        customerIds,
        loginCustomerId: account.loginCustomerId ?? null,
        userId,
        googleEmail,
        expiresAt: expiresAt.toISOString(),
      });
      return accessToken;
    }

    // If only one account, skip selection
    if (usableAccounts.length === 1) {
      const account = usableAccounts[0];
      let accessToken: string;
      try {
        accessToken = await createSession(account);
      } catch (error) {
        console.error("[auth] Failed to create MCP session:", error);
        return redirectWithError(`Failed to create session: ${describeError(error)}`);
      }

      if (isPopup) {
        const response = popupResponse({
          customerId: account.id,
          customerName: account.name || "Google Ads Account",
          ...(googleEmail ? { googleEmail } : {}),
        });
        setSessionCookies(response, accessToken, account.name || "Google Ads Account");
        return response;
      }

      const redirectResponse = NextResponse.redirect(`${getAppOrigin()}/connect`);
      setSessionCookies(redirectResponse, accessToken, account.name || "Google Ads Account");
      return redirectResponse;
    }

    // Multiple accounts — show account selection.
    // Store pre-validated accounts (including loginCustomerId) in customerIds so
    // select-account can verify selections without re-querying Google.
    const accountsList = usableAccounts.map((a) => ({ id: a.id, name: a.name, loginCustomerId: a.loginCustomerId }));
    const pendingToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    try {
      await db().insert(schema.mcpSessions).values({
        accessToken: pendingToken,
        refreshToken: tokenData.refresh_token,
        customerId: "", // pending selection
        customerIds: JSON.stringify(accountsList), // pre-validated options
        userId,
        googleEmail,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[auth] Failed to create pending MCP session:", error);
      return redirectWithError(`Failed to create session: ${describeError(error)}`);
    }

    if (isPopup) {
      return popupAccountSelectionResponse(
        accountsList.map((a) => ({ id: a.id, name: a.name })),
        pendingToken,
        getAppOrigin(),
      );
    }

    const accountsParam = encodeURIComponent(JSON.stringify(
      accountsList.map((a) => ({ id: a.id, name: a.name })),
    ));

    return NextResponse.redirect(
      `${getAppOrigin()}/connect?pending=${pendingToken}&accounts=${accountsParam}`,
    );
  } catch (e) {
    console.error("[auth] Unexpected callback error:", e);
    const msg = `Authentication failed: ${describeError(e)}`;
    return errorResponse(msg, isPopup);
  }
}
