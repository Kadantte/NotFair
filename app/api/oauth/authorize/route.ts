import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { DEMO_OAUTH_CLIENT_ID } from "@/lib/demo/constants";
import { ensureDemoOAuthClient } from "@/lib/demo/seed";

/**
 * OAuth 2.0 Authorization Endpoint.
 *
 * Two flavors of client land here:
 *
 * 1. **Pre-bound clients** (in-app Claude Connector flow via
 *    `/api/oauth/clients`): `oauth_clients.session_id` is set at registration
 *    time, so we just resolve that session and skip user authentication.
 *    The user already proved who they were when they minted the credentials.
 *
 * 2. **DCR clients** (RFC 7591 via `/api/oauth/register`, e.g. Codex CLI):
 *    `session_id` is null. We must authenticate the user mid-flow via the
 *    `adsagent_token` cookie and bind the auth code to that session. If
 *    there's no cookie, we redirect to sign-in with `next` set so the user
 *    lands back here after Google OAuth completes.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");
  const responseType = searchParams.get("response_type");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");

  if (responseType !== "code") {
    return NextResponse.json(
      { error: "unsupported_response_type", error_description: "Only response_type=code is supported" },
      { status: 400 },
    );
  }

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing client_id or redirect_uri" },
      { status: 400 },
    );
  }

  // Lazy-bootstrap the permanent demo client on first use so external
  // reviewers (Anthropic's MCP review team) can pair without any setup.
  if (clientId === DEMO_OAUTH_CLIENT_ID) {
    await ensureDemoOAuthClient();
  }

  // Look up the OAuth client
  const [client] = await db()
    .select({
      sessionId: schema.oauthClients.sessionId,
      redirectUris: schema.oauthClients.redirectUris,
    })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, clientId))
    .limit(1);

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id. Register via /api/oauth/register or generate credentials at www.adsagent.org." },
      { status: 401 },
    );
  }

  // For DCR clients, the requested redirect_uri must match one that was
  // registered. (Pre-bound clients skip this — they trust whatever the
  // in-app form posted at registration time.)
  if (client.sessionId === null) {
    if (!client.redirectUris || !redirectUriMatches(redirectUri, client.redirectUris)) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri is not registered for this client" },
        { status: 400 },
      );
    }
  }

  // Resolve which mcp_session the auth code should be bound to.
  let resolvedSessionId: number | null = null;

  if (client.sessionId !== null) {
    // Pre-bound (Claude Connector) flow: trust the registration-time binding.
    const [session] = await db()
      .select({ id: schema.mcpSessions.id })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.id, client.sessionId),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
          sql`${schema.mcpSessions.customerId} <> ''`,
        ),
      )
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { error: "access_denied", error_description: "Session expired. Reconnect your Google Ads account at www.adsagent.org and generate new credentials." },
        { status: 403 },
      );
    }
    resolvedSessionId = session.id;
  } else {
    // DCR flow: identify the user from the cookie and bind to their session.
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(COOKIE_NAMES.token)?.value;

    if (!sessionToken) {
      // Send the user through Google sign-in, then back to this exact URL.
      const signinUrl = new URL("/api/auth/signin", requestUrl);
      signinUrl.searchParams.set(
        "next",
        `${requestUrl.pathname}${requestUrl.search}`,
      );
      return NextResponse.redirect(signinUrl.toString());
    }

    const [session] = await db()
      .select({ id: schema.mcpSessions.id })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.accessToken, sessionToken),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
          sql`${schema.mcpSessions.customerId} <> ''`,
        ),
      )
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { error: "access_denied", error_description: "No active Google Ads session. Reconnect at www.adsagent.org and try again." },
        { status: 403 },
      );
    }
    resolvedSessionId = session.id;
  }

  // Generate authorization code
  const authCode = randomBytes(32).toString("hex");
  const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db().insert(schema.authorizationCodes).values({
    code: authCode,
    sessionId: resolvedSessionId,
    redirectUri,
    clientId,
    codeChallenge,
    codeChallengeMethod,
    expiresAt: codeExpiresAt,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", authCode);
  if (state) url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}

/**
 * RFC 8252 §7.3 — for loopback redirect URIs (`127.0.0.1`, `::1`), the
 * authorization server MUST allow any port. Native OAuth clients like Codex
 * bind to an ephemeral port at flow time, so the port registered via DCR
 * almost never matches what comes back on /authorize. Match scheme + host +
 * path for loopback registrations; require an exact match otherwise.
 */
function redirectUriMatches(requested: string, registered: string[]): boolean {
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }

  for (const candidate of registered) {
    if (candidate === requested) return true;

    let reg: URL;
    try {
      reg = new URL(candidate);
    } catch {
      continue;
    }

    if (!isLoopbackHost(reg.hostname) || !isLoopbackHost(req.hostname)) continue;

    if (
      reg.protocol === req.protocol &&
      reg.hostname === req.hostname &&
      reg.pathname === req.pathname &&
      reg.search === req.search
    ) {
      return true;
    }
  }

  return false;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}
