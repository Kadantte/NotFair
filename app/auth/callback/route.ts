import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { after } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { setLastAttemptEmailCookie, setProfileCookie, setSessionCookies } from "@/lib/auth-cookies";
import { db, schema } from "@/lib/db";
import { deriveCustomerName, listConnectableAccounts, parseCustomerIds, syncAccountSnapshots, type ConnectableAccount } from "@/lib/google-ads";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/app-url";
import { trackServerEvent, flushServerEvents } from "@/lib/analytics-server";
import { REDDIT_SIGNUP_ID_COOKIE, sendRedditConversion } from "@/lib/reddit-capi";
import { getClientIp } from "@/lib/request-ip";
import { UTM_KEYS, type UtmParams } from "@/lib/utm";
import { verifyOAuthNonce } from "@/lib/oauth-nonce";
import { AUTH_ERROR_REASON, AUTH_ERROR_STEP, AUTH_ERROR_MESSAGES, classifyAccountLoadError, classifyGoogleError } from "@/lib/auth-errors";
import { evaluateScopeGrant } from "@/lib/oauth-scope-retry";

/**
 * Delete all Supabase `sb-*` cookies from the response.
 * Supabase SSR sets large JWT session cookies we don't need — our own
 * `adsagent_token` cookie handles session management.  Leaving the sb-*
 * cookies around pushes total header size past the 8 KB limit, causing
 * HTTP 431 errors.
 */
function clearSupabaseCookies(response: NextResponse, requestCookies: { name: string }[]) {
  for (const { name } of requestCookies) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  }
}

type AuthState = {
  next?: string;
  popup?: boolean;
  utm?: UtmParams;
  scope_retry?: boolean;
  signup_referrer?: string;
};

function getSafeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/")) {
    return "/campaigns";
  }

  return next;
}

/**
 * Decode the OAuth state param and verify it's legitimate.
 * Primary check: nonce matches the cookie (standard CSRF protection).
 * Fallback: if the cookie was lost (browser privacy settings), verify the
 * nonce against the server-side store (single-use, auto-expiring).
 */
async function verifyState(stateParam: string | null, cookieNonce: string | undefined): Promise<AuthState | null> {
  if (!stateParam) return null;

  try {
    const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.nonce) return null;

    // Primary: cookie nonce match
    let verified = false;
    if (cookieNonce && parsed.nonce === cookieNonce) {
      verified = true;
    }

    // Fallback: server-side nonce verification (handles missing cookies)
    if (!verified) {
      verified = await verifyOAuthNonce(parsed.nonce);
      if (verified) {
        console.log("[auth/callback] State verified via server-side nonce (cookie was missing)");
      }
    }

    if (!verified) return null;

    // Extract UTM params if present
    let utm: UtmParams | undefined;
    if (parsed.utm && typeof parsed.utm === "object") {
      const raw = parsed.utm as Record<string, unknown>;
      const cleaned: UtmParams = {};
      for (const key of UTM_KEYS) {
        if (typeof raw[key] === "string") cleaned[key] = raw[key];
      }
      if (Object.keys(cleaned).length > 0) utm = cleaned;
    }

    return {
      next: typeof parsed.next === "string" ? parsed.next : undefined,
      popup: typeof parsed.popup === "boolean" ? parsed.popup : undefined,
      scope_retry: parsed.scope_retry === true ? true : undefined,
      signup_referrer: typeof parsed.signup_referrer === "string" ? parsed.signup_referrer : undefined,
      utm,
    };
  } catch {
    return null;
  }
}

/**
 * Redirect to /connect with a reason code. Connect-page renders copy keyed
 * by reason — keep English out of the URL so it's stable across i18n,
 * shareable in support tickets, and refresh-safe. The optional `message`
 * is a backwards-compat fallback for old links and unmapped reasons.
 *
 * `no_accounts` and `no_client_accounts` route to /manage-ads-accounts so
 * the user can pick a platform (different Google identity, Meta, etc.)
 * instead of being stuck on a Google-Ads-only empty state.
 */
function redirectWithError(origin: string, reason: string, message?: string) {
  if (reason === "no_accounts" || reason === "no_client_accounts") {
    return NextResponse.redirect(`${origin}/manage-ads-accounts`);
  }
  const params = new URLSearchParams({ reason });
  if (message) params.set("error", message);
  return NextResponse.redirect(`${origin}/connect?${params.toString()}`);
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
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      const first = obj.errors[0];
      if (typeof first?.message === "string") return first.message;
    }
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
  accounts: ConnectableAccount[],
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
    .container { max-width: 380px; width: 100%; padding: 24px; text-align: center; }
    h2 { font-size: 20px; margin-bottom: 8px; }
    p { color: #a1a1aa; font-size: 14px; margin-bottom: 16px; }
    .group { margin-bottom: 16px; text-align: left; }
    .group-header { display: flex; align-items: center; gap: 6px; margin: 12px 4px 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #a1a1aa; }
    .group-header.manager { color: #c4c0b6; }
    .badge { display: inline-block; padding: 2px 6px; background: #27272a; border-radius: 6px; font-size: 10px; font-weight: 500; color: #d4d4d8; text-transform: none; letter-spacing: 0; }
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

      // Group accounts: direct first, then by manager
      const groups = new Map();
      for (const a of accounts) {
        const key = a.loginCustomerId || '__direct__';
        const label = a.loginCustomerId ? a.loginCustomerName || ('Manager ' + a.loginCustomerId) : 'Direct access';
        if (!groups.has(key)) groups.set(key, { label, isManager: !!a.loginCustomerId, accounts: [] });
        groups.get(key).accounts.push(a);
      }

      for (const [, group] of groups) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group';

        const header = document.createElement('div');
        header.className = 'group-header' + (group.isManager ? ' manager' : '');
        if (group.isManager) {
          const labelText = document.createElement('span');
          labelText.textContent = 'Via manager:';
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = group.label;
          header.appendChild(labelText);
          header.appendChild(badge);
        } else {
          header.textContent = group.label;
        }
        groupDiv.appendChild(header);

        group.accounts.forEach(a => {
          const div = document.createElement('div');
          div.className = 'account';
          div.dataset.id = a.id;
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          const info = document.createElement('div');
          info.className = 'account-info';
          const nameDiv = document.createElement('div');
          nameDiv.className = 'name';
          nameDiv.textContent = a.name || 'Untitled account';
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
          groupDiv.appendChild(div);
        });

        container.appendChild(groupDiv);
      }

      document.getElementById('connectBtn').onclick = () => {
        const selectedAccounts = accounts.filter(a => selected.has(a.id));
        window.opener.postMessage({
          type: "GOOGLE_ADS_AUTH_SUCCESS",
          pendingToken,
          accounts: selectedAccounts.map(a => ({ id: a.id, name: a.name })),
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

/**
 * Mint an "ads-less" mcp_sessions row + cookie for a user who completed
 * Google OAuth (with the adwords scope) but has no Google Ads customer to
 * connect — either because the Google identity isn't linked to any Ads
 * account, or because their only path was a manager (MCC) with no clients.
 *
 * The row carries the user's refresh token, so when they later create an
 * Ads account on this same Google identity, /manage-ads-accounts/google-ads can
 * reuse the credentials without forcing another OAuth round-trip.
 *
 * The session is loadable by getSession() (with `pendingSetup: true`) but
 * getSessionAuth() and getAuthContext() still throw — Google-Ads-dependent
 * routes bounce back to /connect, which is the right behavior for a user
 * who hasn't picked an Ads customer yet.
 */
async function mintAdsLessSession({
  response,
  refreshToken,
  userId,
  googleEmail,
}: {
  response: NextResponse;
  refreshToken: string;
  userId: string | null;
  googleEmail: string | null;
}) {
  const accessToken = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db().insert(schema.mcpSessions).values({
    accessToken,
    refreshToken,
    customerId: "",
    customerIds: "[]",
    userId,
    googleEmail,
    expiresAt: expiresAt.toISOString(),
  });

  setSessionCookies(response, accessToken, "");
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
  let connectable;

  try {
    connectable = await listConnectableAccounts(refreshToken);
  } catch (error) {
    console.error("[auth] Failed to load Google Ads accounts:", error);
    const raw = describeError(error);
    const msg = classifyAccountLoadError(raw);
    const reason =
      msg === AUTH_ERROR_MESSAGES.SCOPE_INSUFFICIENT
        ? AUTH_ERROR_REASON.SCOPE_DENIED
        : msg === AUTH_ERROR_MESSAGES.NO_ACCOUNTS
          ? "no_accounts"
          : "load_accounts_failed";
    if (popup) return popupErrorResponse(origin, msg);
    const response = redirectWithError(origin, reason);
    if (reason === "no_accounts") {
      setLastAttemptEmailCookie(response, googleEmail);
      // Mint an ads-less session so the user can choose to continue into the
      // app (set up Claude/MCP, connect Meta later, or come back when they
      // have a Google Ads account on this identity). Without this, they'd
      // hit /connect with no session and have nothing to do but retry OAuth.
      await mintAdsLessSession({ response, refreshToken, userId, googleEmail });
    }
    return response;
  }

  const usableAccounts = connectable.accounts;
  const hasManager = connectable.managers.length > 0;

  if (usableAccounts.length === 0) {
    const msg = hasManager
      ? AUTH_ERROR_MESSAGES.NO_CLIENT_ACCOUNTS
      : AUTH_ERROR_MESSAGES.NO_ACCOUNTS;
    const reason = hasManager ? "no_client_accounts" : "no_accounts";
    if (popup) return popupErrorResponse(origin, msg);
    const response = redirectWithError(origin, reason);
    setLastAttemptEmailCookie(response, googleEmail);
    // Same rationale as the catch branch above — mint an ads-less session
    // so the user can keep using NotFair while they sort out Ads access.
    await mintAdsLessSession({ response, refreshToken, userId, googleEmail });
    return response;
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  // Check if this is a first-time user (no prior sessions) for conversion tracking
  const isFirstSignup = userId
    ? (await db()
        .select({ id: schema.mcpSessions.id })
        .from(schema.mcpSessions)
        .where(eq(schema.mcpSessions.userId, userId))
        .limit(1)).length === 0
    : false;

  if (usableAccounts.length === 1) {
    const account = usableAccounts[0];
    const accessToken = randomBytes(32).toString("hex");
    // Emit loginCustomerId explicitly (string | null) so authForAccount can
    // distinguish "direct" from "legacy fallback" for this entry.
    const customerIds = JSON.stringify([
      { id: account.id, name: account.name || "", loginCustomerId: account.loginCustomerId ?? null },
    ]);

    await db().insert(schema.mcpSessions).values({
      accessToken,
      refreshToken,
      customerId: account.id,
      customerIds,
      loginCustomerId: account.loginCustomerId ?? null,
      userId,
      googleEmail,
      expiresAt: expiresAt.toISOString(),
    });

    // Snapshot account budget/info for dev dashboard (runs after response is sent)
    after(async () => {
      syncAccountSnapshots(refreshToken, [account.id]).catch((err) => {
        console.error("[sync-account] Failed to snapshot on connect:", err);
      });
    });

    if (popup) {
      const response = popupPostMessage(origin, {
        type: "GOOGLE_ADS_AUTH_SUCCESS",
        customerId: account.id,
        customerName: account.name || "Google Ads Account",
        ...(googleEmail ? { googleEmail } : {}),
      });
      setSessionCookies(response, accessToken, account.name || "Google Ads Account");
      if (isFirstSignup) {
        response.cookies.set("gads_new_signup", "1", { path: "/", maxAge: 60 });
      }
      response.cookies.set(
        "gads_connect_event",
        JSON.stringify({ count: 1, first: isFirstSignup, destination: next }),
        { path: "/", maxAge: 120 },
      );
      return response;
    }

    const response = NextResponse.redirect(`${origin}${next}`);
    setSessionCookies(response, accessToken, account.name || "Google Ads Account");
    if (isFirstSignup) {
      response.cookies.set("gads_new_signup", "1", { path: "/", maxAge: 60 });
    }
    response.cookies.set(
      "gads_connect_event",
      JSON.stringify({ count: 1, first: isFirstSignup, destination: next }),
      { path: "/", maxAge: 120 },
    );
    return response;
  }

  const pendingToken = randomBytes(32).toString("hex");

  // Pre-validated accounts stored on the pending session so /api/auth/select-account
  // can verify the user's pick without a second round-trip to Google. Always emit
  // loginCustomerId explicitly (string | null) so authForAccount has a clean signal
  // for direct vs manager-routed instead of guessing from key absence.
  const accountsList = usableAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    loginCustomerId: account.loginCustomerId ?? null,
  }));

  await db().insert(schema.mcpSessions).values({
    accessToken: pendingToken,
    refreshToken,
    customerId: "",
    customerIds: JSON.stringify(accountsList),
    userId,
    googleEmail,
    expiresAt: expiresAt.toISOString(),
  });

  if (popup) {
    return popupAccountSelectionResponse(usableAccounts, pendingToken, origin);
  }

  // Land new users on /manage-ads-accounts so they can pick a platform
  // (Google or Meta) before being routed to the Google picker. The pending
  // mcp_sessions row + cookie carry the auth state; /manage-ads-accounts
  // detects pending Google state and forwards to /manage-ads-accounts/google-ads/select
  // with the candidate accounts when the user clicks the Google card.
  // `next` is preserved as a query param so the eventual save lands the
  // user where they originally intended.
  const nextParam = next !== "/connect" ? `?next=${encodeURIComponent(next)}` : "";
  const pendingResponse = NextResponse.redirect(
    `${origin}/manage-ads-accounts${nextParam}`,
  );
  // Surface the user's identity to the navbar while they're picking which
  // accounts to connect — without this they'd appear signed-out on the
  // selection screen because loadSessionRow is keyed on adsagent_token.
  // /api/auth/select-account replaces this row's customerId on submission;
  // setSessionCookies just renames customerName once accounts are picked.
  setSessionCookies(pendingResponse, pendingToken, "");
  return pendingResponse;
}

async function reuseExistingSession({
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
      ...(googleEmail ? { googleEmail } : {}),
      expiresAt: expiresAt.toISOString(),
    })
    .where(eq(schema.mcpSessions.id, existingSession.id));

  const customerName = deriveCustomerName(existingSession.customerIds);

  // Re-sync account snapshots on returning login (runs after response is sent)
  const reusedIds = parseCustomerIds(existingSession.customerIds).map((a) => a.id);
  if (reusedIds.length > 0) {
    after(async () => {
      syncAccountSnapshots(refreshToken, reusedIds).catch((err) => {
        console.error("[sync-account] Failed to snapshot on reuse:", err);
      });
    });
  }

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
  // Flush PostHog events after the response ships — keeps the Lambda alive
  // long enough for trackServerEvent()'s async POST to complete. Fires for
  // every return path including the early auth_error redirects.
  after(flushServerEvents);

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");
  const stateParam = searchParams.get("state");

  // Verify the OAuth state nonce matches the cookie to prevent CSRF
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get("oauth_nonce")?.value;
  const state = await verifyState(stateParam, cookieNonce);
  if (!state) {
    const reason = !stateParam ? "missing_state" : !cookieNonce ? "missing_cookie" : "nonce_mismatch";
    console.error(`[auth/callback] State verification failed: ${reason}`, {
      hasState: !!stateParam,
      hasCookie: !!cookieNonce,
    });
    trackServerEvent(null, "auth_error", { reason, step: AUTH_ERROR_STEP.STATE_VERIFICATION });
    return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${reason}`);
  }

  const popup = state.popup === true || searchParams.get("popup") === "1";
  const next = getSafeNext(state.next ?? explicitNext);

  // Check if Google returned an error (e.g. user clicked Cancel on consent screen)
  const googleError = searchParams.get("error");
  if (googleError) {
    const reason = classifyGoogleError(googleError);
    console.error(`[auth/callback] Google OAuth error: ${googleError}`);
    trackServerEvent(null, "auth_error", { reason, step: AUTH_ERROR_STEP.GOOGLE_CONSENT, google_error: googleError });
    return popup
      ? popupErrorResponse(origin, AUTH_ERROR_MESSAGES.CONSENT_DENIED)
      : NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${reason}`);
  }

  if (!code) {
    console.error("[auth/callback] Missing code param in callback URL");
    trackServerEvent(null, "auth_error", { reason: AUTH_ERROR_REASON.MISSING_CODE, step: AUTH_ERROR_STEP.CODE_CHECK });
    return popup
      ? popupErrorResponse(origin, "Authentication failed. Missing code.")
      : NextResponse.redirect(`${origin}/login?error=auth_failed&reason=missing_code`);
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const redirectUri = `${getAppOrigin()}/auth/callback`;

  if (!clientId || !clientSecret) {
    console.error("[auth/callback] Missing GOOGLE_ADS_CLIENT_ID or CLIENT_SECRET env vars");
    return popup
      ? popupErrorResponse(origin, "Server misconfiguration: missing Google OAuth credentials.")
      : NextResponse.redirect(`${origin}/login?error=auth_failed&reason=server_config`);
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
    console.error("[auth/callback] Token exchange failed:", {
      status: tokenResponse.status,
      error: tokenData.error,
      error_description: tokenData.error_description,
      hasRefreshToken: !!tokenData.refresh_token,
      hasIdToken: !!tokenData.id_token,
    });
    trackServerEvent(null, "auth_error", { reason: AUTH_ERROR_REASON.TOKEN_EXCHANGE, step: AUTH_ERROR_STEP.TOKEN_EXCHANGE, error: tokenData.error });
    return popup
      ? popupErrorResponse(origin, message)
      : NextResponse.redirect(`${origin}/login?error=auth_failed&reason=token_exchange`);
  }

  // Verify the adwords scope was actually granted (Google granular permissions
  // let users uncheck individual scopes on the consent screen). Decision logic
  // is in lib/oauth-scope-retry.ts so it can be unit-tested without standing
  // up Next/Supabase/Google.
  const scopeDecision = evaluateScopeGrant({
    grantedScopesParam: typeof tokenData.scope === "string" ? tokenData.scope : undefined,
    hasScopeRetry: state.scope_retry === true,
    origin,
    next,
    popup,
  });

  if (scopeDecision.outcome === "retry") {
    console.log("[auth/callback] Ads scope denied — auto-retrying once");
    trackServerEvent(null, "auth_error", { reason: AUTH_ERROR_REASON.SCOPE_DENIED_RETRY, step: AUTH_ERROR_STEP.SCOPE_CHECK, is_retry: false });
    const retryResponse = NextResponse.redirect(scopeDecision.retryUrl);
    retryResponse.cookies.set("oauth_nonce", "", { maxAge: 0, path: "/" });
    return retryResponse;
  }

  if (scopeDecision.outcome === "fail") {
    console.error("[auth/callback] Ads scope denied after retry");
    trackServerEvent(null, "auth_error", { reason: AUTH_ERROR_REASON.SCOPE_DENIED, step: AUTH_ERROR_STEP.SCOPE_CHECK, is_retry: true });
    const msg = AUTH_ERROR_MESSAGES.SCOPE_DENIED;
    const scopeResponse = popup
      ? popupErrorResponse(origin, msg)
      : redirectWithError(origin, AUTH_ERROR_REASON.SCOPE_DENIED);
    // Clean up cookies even on scope failure to avoid 431 errors
    scopeResponse.cookies.set("oauth_nonce", "", { maxAge: 0, path: "/" });
    const requestCookiesForCleanup = (await cookies()).getAll();
    for (const { name } of requestCookiesForCleanup) {
      if (name.startsWith("sb-")) {
        scopeResponse.cookies.set(name, "", { maxAge: 0, path: "/" });
      }
    }
    return scopeResponse;
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokenData.id_token,
    access_token: tokenData.access_token,
  });

  if (authError) {
    console.error("[auth/callback] Supabase sign-in failed:", authError);
    trackServerEvent(null, "auth_error", { reason: AUTH_ERROR_REASON.SUPABASE_AUTH, step: AUTH_ERROR_STEP.SUPABASE_SIGNIN, error: authError.message });
    return popup
      ? popupErrorResponse(origin, "Failed to establish app session.")
      : NextResponse.redirect(`${origin}/login?error=auth_failed&reason=supabase_auth`);
  }

  const user = authData.user ?? authData.session?.user ?? null;

  // Save UTM attribution data to user metadata on first sign-up
  if (user && (state.utm || state.signup_referrer)) {
    const existingMeta = user.user_metadata ?? {};
    // Only write UTMs if not already set (don't overwrite on re-auth)
    if (!existingMeta.utm_source) {
      await supabase.auth.updateUser({
        data: {
          ...(state.utm ?? {}),
          signup_referrer: state.signup_referrer ?? undefined,
        },
      });
    }
  }

  // Reuse cookieStore from nonce check above to identify sb-* cookies to clear
  const requestCookies = cookieStore.getAll();

  let response: NextResponse;

  try {
    const reusedResponse = await reuseExistingSession({
      origin,
      userId: user?.id ?? null,
      googleEmail: user?.email ?? null,
      refreshToken: tokenData.refresh_token,
      popup,
      next,
    });

    response = reusedResponse ?? await createOrRedirectGoogleAdsSession({
      origin,
      userId: user?.id ?? null,
      googleEmail: user?.email ?? null,
      refreshToken: tokenData.refresh_token,
      popup,
      next,
    });
  } catch (sessionError) {
    console.error("[auth/callback] Failed to create Google Ads session:", sessionError);
    response = popup
      ? popupErrorResponse(origin, describeError(sessionError))
      : redirectWithError(origin, "session_error", describeError(sessionError));
  }

  // Track signup event with UTM attribution in PostHog
  const isNewSignup = response.cookies.get("gads_new_signup")?.value === "1";
  if (isNewSignup && user?.id) {
    // request.headers.get("referer") is useless here (always accounts.google.com
    // because OAuth redirected through it) — state.signup_referrer carries the
    // real marketing referrer captured before the OAuth bounce.
    const clientIp = getClientIp(request);
    trackServerEvent(user.id, "user_signed_up", {
      ...(state.utm ?? {}),
      signup_referrer: state.signup_referrer ?? undefined,
      google_email: user.email,
      signup_method: "google_oauth",
      ...(clientIp ? { $ip: clientIp } : {}),
    });

    const conversionId = randomUUID();
    response.cookies.set(REDDIT_SIGNUP_ID_COOKIE, conversionId, { path: "/", maxAge: 60 });
    after(
      sendRedditConversion({
        trackingType: "SignUp",
        conversionId,
        email: user.email ?? null,
        externalId: user.id,
        ipAddress: clientIp ?? null,
        userAgent: request.headers.get("user-agent"),
        valueDecimal: 1.0,
        currency: "USD",
      }),
    );
  }

  // Clear the one-time OAuth nonce cookie
  response.cookies.set("oauth_nonce", "", { maxAge: 0, path: "/" });

  // Stash the user's display name + avatar in a small dedicated cookie BEFORE
  // we wipe Supabase's sb-* cookies. The Supabase user object only exists for
  // this request — once sb-* is cleared, supabase.auth.getUser() returns null
  // on every subsequent request, so we can't read user_metadata later.
  if (user) {
    const meta = user.user_metadata as
      | { full_name?: string; name?: string; avatar_url?: string; picture?: string }
      | undefined;
    setProfileCookie(response, {
      name: meta?.full_name ?? meta?.name ?? null,
      picture: meta?.avatar_url ?? meta?.picture ?? null,
    });
  }

  // Supabase SSR sets large JWT cookies we don't use — clear them to
  // avoid HTTP 431 (Request Header Fields Too Large) on subsequent requests.
  clearSupabaseCookies(response, requestCookies);

  return response;
}
