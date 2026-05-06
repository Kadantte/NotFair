import { randomUUID } from "crypto";
import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getAppOrigin } from "@/lib/app-url";
import { upsertGoogleConnection } from "@/lib/connections/google";
import { compareForShadowRead, loadGoogleConnection } from "@/lib/connections/google-read";
import { readGoogleFromConnections } from "@/lib/connections/feature-flags";
import { db, schema } from "@/lib/db";
import { eq, and, gte, ne } from "drizzle-orm";
import { listConnectableAccounts, deriveCustomerName, parseCustomerIds, syncAccountSnapshots } from "@/lib/google-ads";
import { COOKIE_NAMES, setSessionCookies } from "@/lib/auth-cookies";
import { createClient } from "@/lib/supabase/server";
import { trackServerEvent, flushServerEvents } from "@/lib/analytics-server";
import {
  REDDIT_SIGNUP_ID_COOKIE,
  sendRedditConversion,
  type RedditConversionInput,
} from "@/lib/reddit-capi";
import { getClientIp } from "@/lib/request-ip";

export async function POST(request: Request) {
  after(flushServerEvents);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pendingToken, accounts, next: rawNext } = body;
  const next = typeof rawNext === 'string' && rawNext.startsWith('/') ? rawNext : '/connect/google-ads?connected=1';

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return NextResponse.json(
      { error: "Missing accounts array" },
      { status: 400 },
    );
  }

  // Validate accounts shape — accept optional loginCustomerId for manager-routed accounts
  const validAccounts = accounts.filter(
    (a: unknown): a is { id: string; name: string; loginCustomerId?: string } => {
      if (typeof a !== "object" || a === null || !("id" in a)) return false;
      return typeof (a as Record<string, unknown>).id === "string";
    },
  );

  if (validAccounts.length === 0) {
    return NextResponse.json(
      { error: "No valid accounts provided" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const currentToken = cookieStore.get(COOKIE_NAMES.token)?.value ?? null;

  const sessionWhere = pendingToken
    ? and(
        eq(schema.mcpSessions.accessToken, pendingToken),
        eq(schema.mcpSessions.customerId, ""),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      )
    : currentToken
      ? and(
          eq(schema.mcpSessions.accessToken, currentToken),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        )
      : null;

  if (!sessionWhere) {
    return NextResponse.json(
      { error: "No active session found" },
      { status: 401 },
    );
  }

  const [session] = await db()
    .select({
      id: schema.mcpSessions.id,
      accessToken: schema.mcpSessions.accessToken,
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      loginCustomerId: schema.mcpSessions.loginCustomerId,
      googleEmail: schema.mcpSessions.googleEmail,
      userId: schema.mcpSessions.userId,
    })
    .from(schema.mcpSessions)
    .where(sessionWhere)
    .limit(1);

  if (!session) {
    return NextResponse.json(
      { error: pendingToken ? "Pending session not found" : "Session not found" },
      { status: 404 },
    );
  }

  // Verify all selected account IDs are accessible AND resolve loginCustomerId
  // for any manager-routed selections.
  //
  // For pending sessions: the OAuth callback stored a pre-validated list
  // (with loginCustomerId per account) in customerIds — trust that.
  //
  // For existing sessions (account switcher / add-account flow): re-query
  // the user's connectable accounts (which expands managers into their
  // clients) so we can validate manager-routed picks too.
  //
  // Phase-2 read split: the pre-validated candidate set lives in *both*
  // mcp_sessions.customerIds and ad_platform_connections.accountIds (phase-1
  // dual-write). Behind READ_GOOGLE_FROM_CONNECTIONS we source it from the
  // connection row; otherwise fall back to mcp_sessions and shadow-read for
  // parity. Either way, the shape (id, name, loginCustomerId?) is identical.
  const conn = session.userId ? await loadGoogleConnection(session.userId) : null;
  if (session.userId) {
    compareForShadowRead({
      userId: session.userId,
      fromSession: {
        refreshToken: session.refreshToken,
        customerId: session.customerId,
        customerIds: session.customerIds ?? "[]",
        loginCustomerId: session.loginCustomerId ?? null,
        googleEmail: session.googleEmail ?? null,
      },
      fromConnection: conn,
      source: "select-account",
    });
  }

  const storedAccountsFromSession = parseCustomerIds(session.customerIds ?? "[]");
  const storedAccounts = readGoogleFromConnections() && conn
    ? conn.customerIds
    : storedAccountsFromSession;
  const isPreValidated = pendingToken && storedAccounts.length > 0;

  type AuthorizedAccount = { id: string; name: string; loginCustomerId?: string };
  let authorized: AuthorizedAccount[];

  if (isPreValidated) {
    authorized = storedAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      // Strip nulls so the AuthorizedAccount shape stays loginCustomerId?: string.
      ...(typeof a.loginCustomerId === "string" ? { loginCustomerId: a.loginCustomerId } : {}),
    }));
  } else {
    const { accounts } = await listConnectableAccounts(session.refreshToken);
    authorized = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      ...(a.loginCustomerId ? { loginCustomerId: a.loginCustomerId } : {}),
    }));
  }

  const authorizedById = new Map(authorized.map((a) => [a.id, a]));
  const inaccessible = validAccounts.filter((a) => !authorizedById.has(a.id));
  if (inaccessible.length > 0) {
    return NextResponse.json(
      {
        error: isPreValidated
          ? `Account(s) not in authorized set: ${inaccessible.map((a) => a.id).join(", ")}`
          : `Account(s) not accessible: ${inaccessible.map((a) => a.id).join(", ")}`,
      },
      { status: 403 },
    );
  }

  // Keep the current primary account if it remains selected; otherwise use the first selected account.
  const primaryAccount =
    validAccounts.find((account) => account.id === session.customerId) ??
    validAccounts[0];

  // Per-account loginCustomerId — always read from server-side authorized data,
  // never trust the request body (a forged loginCustomerId could let a user act
  // as a manager they don't have access to). Persisting it per-account here is
  // what lets `authForAccount` swap the manager context per tool call, so a
  // single session can mix direct-access and manager-routed accounts.
  const customerIds = JSON.stringify(
    validAccounts.map((a) => {
      const authorized = authorizedById.get(a.id);
      return {
        id: a.id,
        name: a.name || "",
        loginCustomerId: authorized?.loginCustomerId ?? null,
      };
    }),
  );

  // Session-level loginCustomerId tracks the primary account so legacy code
  // paths that read `auth.loginCustomerId` directly (without going through
  // `authForAccount`) still work for the default account.
  const loginCustomerId = authorizedById.get(primaryAccount.id)?.loginCustomerId ?? null;

  await db().transaction(async (tx) => {
    await tx
      .update(schema.mcpSessions)
      .set({
        customerId: primaryAccount.id,
        customerIds,
        loginCustomerId,
      })
      .where(eq(schema.mcpSessions.id, session.id));

    if (session.userId) {
      await tx
        .delete(schema.mcpSessions)
        .where(
          and(
            eq(schema.mcpSessions.userId, session.userId),
            ne(schema.mcpSessions.id, session.id),
          ),
        );

      // Phase-1 dual-write: mirror the curated selection onto the connection
      // row. Note we do NOT delete the connection alongside the duplicate
      // mcp_sessions cleanup above — there is one connection per (user,
      // platform) and it represents the user's enduring link to Google Ads.
      await upsertGoogleConnection(
        {
          userId: session.userId,
          refreshToken: session.refreshToken,
          activeAccountId: primaryAccount.id,
          accountIds: validAccounts.map((a) => ({
            id: a.id,
            name: a.name || "",
            loginCustomerId: authorizedById.get(a.id)?.loginCustomerId ?? null,
          })),
        },
        tx,
      );
    }
  });

  // Snapshot account budget/info for dev dashboard (runs after response is sent).
  // Use the server-authorized customerIds JSON so MCC-routed accounts keep loginCustomerId.
  const selectedAccounts = parseCustomerIds(customerIds);
  after(async () => {
    syncAccountSnapshots(session.refreshToken, selectedAccounts).catch((err) => {
      console.error("[sync-account] Failed to snapshot on select:", err);
    });
  });

  const accountNames = deriveCustomerName(customerIds);

  const isNewSignup = pendingToken && !session.customerId;

  // Multi-account signups go through this route rather than the auth callback's
  // single-account path, so fire user_signed_up here — otherwise PostHog misses
  // every multi-account signup entirely (17% of signups as of Apr 2026).
  // UTMs and signup_referrer were written to Supabase user_metadata by the
  // callback before branching; read them back so attribution is preserved.
  let redditConversionPayload: RedditConversionInput | null = null;

  if (isNewSignup && session.userId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
      const clientIp = getClientIp(request);
      trackServerEvent(session.userId, "user_signed_up", {
        utm_source: meta.utm_source,
        utm_medium: meta.utm_medium,
        utm_campaign: meta.utm_campaign,
        utm_term: meta.utm_term,
        utm_content: meta.utm_content,
        signup_referrer: meta.signup_referrer,
        google_email: user?.email,
        signup_method: "google_oauth",
        ...(clientIp ? { $ip: clientIp } : {}),
      });

      redditConversionPayload = {
        trackingType: "SignUp",
        conversionId: randomUUID(),
        email: user?.email ?? null,
        externalId: session.userId,
        ipAddress: clientIp ?? null,
        userAgent: request.headers.get("user-agent"),
        valueDecimal: 1.0,
        currency: "USD",
      };
    } catch (err) {
      console.error("[select-account] Failed to fire user_signed_up:", err);
    }
  }

  // After save we always land on the Google MCP setup page. New-signup
  // flows can override via `next` (e.g. /audit) — they don't get the toast
  // since they're not on /connect/google-ads.
  const response = NextResponse.json({
    redirectUrl: `${getAppOrigin()}${isNewSignup ? next : '/connect/google-ads?connected=1'}`,
  });
  setSessionCookies(response, session.accessToken, accountNames);
  if (isNewSignup) {
    response.cookies.set("gads_new_signup", "1", { path: "/", maxAge: 60 });
  }
  if (redditConversionPayload) {
    response.cookies.set(REDDIT_SIGNUP_ID_COOKIE, redditConversionPayload.conversionId, {
      path: "/",
      maxAge: 60,
    });
    after(sendRedditConversion(redditConversionPayload));
  }
  response.cookies.set(
    "gads_connect_event",
    JSON.stringify({
      count: validAccounts.length,
      first: !!isNewSignup,
      destination: isNewSignup ? next : "/connect/google-ads",
    }),
    { path: "/", maxAge: 120 },
  );
  return response;
}
