import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { clearSessionCookies, setSessionCookies } from "@/lib/auth-cookies";
import { db, schema } from "@/lib/db";
import { deriveCustomerName, listAccessibleCustomers } from "@/lib/google-ads";
import { createClient } from "@/lib/supabase/server";

type AuthState = {
  next?: string;
  popup?: boolean;
};

function getSafeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/")) {
    return "/campaigns";
  }

  return next;
}

function decodeState(state: string | null): AuthState {
  if (!state) return {};

  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return {};

    return {
      next:
        "next" in parsed && typeof parsed.next === "string"
          ? parsed.next
          : undefined,
      popup:
        "popup" in parsed && typeof parsed.popup === "boolean"
          ? parsed.popup
          : undefined,
    };
  } catch {
    return {};
  }
}

function redirectWithError(origin: string, message: string) {
  return NextResponse.redirect(
    `${origin}/connect?error=${encodeURIComponent(message)}`,
  );
}

function describeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function popupPostMessage(origin: string, payload: Record<string, unknown>) {
  return new NextResponse(
    `<!DOCTYPE html><html><body><script>
      if (window.opener) { window.opener.postMessage(${safeJsonForScript(payload)}, ${safeJsonForScript(origin)}); }
      window.close();
    </script></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

function popupErrorResponse(origin: string, message: string) {
  return popupPostMessage(origin, {
    type: "GOOGLE_ADS_AUTH_ERROR",
    error: message,
  });
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

async function createOrRedirectGoogleAdsSession({
  origin,
  userId,
  googleEmail,
  refreshToken,
  popup,
  next,
}: {
  origin: string;
  userId: string | null;
  googleEmail: string | null;
  refreshToken: string;
  popup: boolean;
  next: string;
}) {
  let customers;

  try {
    customers = await listAccessibleCustomers(refreshToken);
  } catch (error) {
    return popup
      ? popupErrorResponse(
          origin,
          `Failed to load Google Ads accounts: ${describeError(error)}`,
        )
      : redirectWithError(
          origin,
          `Failed to load Google Ads accounts: ${describeError(error)}`,
        );
  }

  const usableAccounts = customers.filter(
    (customer) => !("error" in customer) && !customer.isManager,
  );

  if (usableAccounts.length === 0) {
    const response = popup
      ? popupErrorResponse(
          origin,
          "No Google Ads accounts found. You may only have manager accounts, which aren't supported yet.",
        )
      : redirectWithError(
          origin,
          "No Google Ads accounts found. You may only have manager accounts, which aren't supported yet.",
        );
    if (!popup) {
      clearSessionCookies(response);
    }
    return response;
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  if (usableAccounts.length === 1) {
    const account = usableAccounts[0];
    const accessToken = randomBytes(32).toString("hex");
    const customerIds = JSON.stringify([{ id: account.id, name: account.name || "" }]);

    await db().insert(schema.mcpSessions).values({
      accessToken,
      refreshToken,
      customerId: account.id,
      customerIds,
      userId,
      googleEmail,
      expiresAt: expiresAt.toISOString(),
    });

    if (popup) {
      const response = popupPostMessage(origin, {
        type: "GOOGLE_ADS_AUTH_SUCCESS",
        customerId: account.id,
        customerName: account.name || "Google Ads Account",
        ...(googleEmail ? { googleEmail } : {}),
      });
      setSessionCookies(response, accessToken, account.name || "Google Ads Account");
      return response;
    }

    const response = NextResponse.redirect(`${origin}${next}`);
    setSessionCookies(response, accessToken, account.name || "Google Ads Account");
    return response;
  }

  const pendingToken = randomBytes(32).toString("hex");

  await db().insert(schema.mcpSessions).values({
    accessToken: pendingToken,
    refreshToken,
    customerId: "",
    userId,
    googleEmail,
    expiresAt: expiresAt.toISOString(),
  });

  const accountsList = usableAccounts.map((account) => ({
    id: account.id,
    name: account.name,
  }));

  if (popup) {
    return popupAccountSelectionResponse(accountsList, pendingToken, origin);
  }

  const accountsParam = encodeURIComponent(JSON.stringify(accountsList));
  return NextResponse.redirect(
    `${origin}/connect?pending=${pendingToken}&accounts=${accountsParam}`,
  );
}

async function reuseExistingSession({
  origin,
  userId,
  refreshToken,
  popup,
  next,
}: {
  origin: string;
  userId: string | null;
  refreshToken: string;
  popup: boolean;
  next: string;
}) {
  if (!userId) {
    return null;
  }

  const [existingSession] = await db()
    .select({
      id: schema.mcpSessions.id,
      accessToken: schema.mcpSessions.accessToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.userId, userId),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        sql`${schema.mcpSessions.customerId} <> ''`,
      ),
    )
    .orderBy(desc(schema.mcpSessions.createdAt))
    .limit(1);

  if (!existingSession?.customerId) {
    return null;
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db()
    .update(schema.mcpSessions)
    .set({
      refreshToken,
      userId,
      expiresAt: expiresAt.toISOString(),
    })
    .where(eq(schema.mcpSessions.id, existingSession.id));

  const customerName = deriveCustomerName(existingSession.customerIds);

  if (popup) {
    const response = popupPostMessage(origin, {
      type: "GOOGLE_ADS_AUTH_SUCCESS",
      customerId: existingSession.customerId,
      customerName,
    });
    setSessionCookies(response, existingSession.accessToken, customerName);
    return response;
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  setSessionCookies(response, existingSession.accessToken, customerName);
  return response;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");
  const state = decodeState(searchParams.get("state"));
  const popup = state.popup === true || searchParams.get("popup") === "1";
  const next = getSafeNext(state.next ?? explicitNext);

  if (!code) {
    return popup
      ? popupErrorResponse(origin, "Authentication failed. Missing code.")
      : NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const redirectUri = `${origin}/auth/callback`;

  if (!clientId || !clientSecret) {
    return popup
      ? popupErrorResponse(origin, "Server misconfiguration: missing Google OAuth credentials.")
      : NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

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

  if (
    !tokenResponse.ok ||
    tokenData.error ||
    !tokenData.refresh_token ||
    !tokenData.id_token
  ) {
    const message =
      tokenData.error_description ||
      tokenData.error ||
      "Failed to complete Google authentication";
    return popup
      ? popupErrorResponse(origin, message)
      : NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokenData.id_token,
    access_token: tokenData.access_token,
  });

  if (authError) {
    console.error("[auth/callback] Supabase sign-in failed:", authError);
    return popup
      ? popupErrorResponse(origin, "Failed to establish app session.")
      : NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const user = authData.user ?? authData.session?.user ?? null;

  try {
    const reusedResponse = await reuseExistingSession({
      origin,
      userId: user?.id ?? null,
      refreshToken: tokenData.refresh_token,
      popup,
      next,
    });

    if (reusedResponse) {
      return reusedResponse;
    }

    return await createOrRedirectGoogleAdsSession({
      origin,
      userId: user?.id ?? null,
      googleEmail: user?.email ?? null,
      refreshToken: tokenData.refresh_token,
      popup,
      next,
    });
  } catch (sessionError) {
    console.error("[auth/callback] Failed to create Google Ads session:", sessionError);
    return popup
      ? popupErrorResponse(origin, describeError(sessionError))
      : redirectWithError(origin, describeError(sessionError));
  }
}
