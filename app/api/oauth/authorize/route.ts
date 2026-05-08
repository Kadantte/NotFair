import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEMO_OAUTH_CLIENT_ID } from "@/lib/demo/constants";
import { ensureDemoOAuthClient } from "@/lib/demo/seed";
import { redirectUriMatches } from "@/lib/oauth/redirect-uri";
import { DEFAULT_RESOURCE_PATH, resolveResourceFromUrl } from "@/lib/mcp/resources";
import { identifyUser } from "@/lib/auth/identify-user";

/**
 * OAuth 2.0 Authorization Endpoint.
 *
 * Three branches based on the requested resource and the OAuth client shape:
 *
 * 1. **Google pre-bound clients** (legacy in-app Claude Connector flow):
 *    rows where `oauth_clients.session_id` is set at registration time. We
 *    resolve that session and skip user authentication. The route that
 *    minted these (`/api/oauth/clients`) was removed in 2026-04 when the
 *    in-app UI switched to RFC 7591 DCR; this branch is kept so any pre-
 *    bound rows already in the DB continue to authenticate. Pre-bound
 *    clients are Google-only by definition — Meta resources always require
 *    DCR.
 *
 * 2. **Google DCR clients** (RFC 7591 via `/api/oauth/register`, e.g. Codex
 *    CLI hitting /api/mcp or /api/mcp/google_ads): identify the user from
 *    the `adsagent_token` cookie, bind the auth code to their `mcp_sessions`
 *    row via `session_id`.
 *
 * 3. **Meta DCR clients** (resource = /api/mcp/meta_ads): identify the user
 *    via cookie, look up their `ad_platform_connections` row for
 *    platform='meta_ads', bind the auth code via `connection_id`. If they
 *    don't yet have a Meta connection, bounce through /api/oauth/meta/start
 *    (Layer A) first — they'll come back here after consenting.
 *
 * In all three cases the auth code carries `resource_url` so the token
 *  endpoint can stamp the right prefix and audience.
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
  // RFC 8707 resource indicator. Tells us which MCP resource the requested
  // token will be presented to. Absent → default to /api/mcp so already-
  // registered Claude clients (which predate the multi-platform shape) keep
  // working without modification.
  const resourceParam = searchParams.get("resource");
  const resolvedResource = resolveResourceFromUrl(resourceParam);
  if (resourceParam && !resolvedResource) {
    return NextResponse.json(
      { error: "invalid_target", error_description: `Unknown resource: ${resourceParam}` },
      { status: 400 },
    );
  }
  const resourceUrlPath = resolvedResource?.path ?? DEFAULT_RESOURCE_PATH;
  const isMetaResource = resolvedResource?.platform === "meta_ads";
  const isDesignResource = resolvedResource?.platform === "design";

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
      { error: "invalid_client", error_description: "Unknown client_id. Register via /api/oauth/register." },
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

  // Pre-bound clients are Google-only — `oauth_clients.session_id` points
  // at an `mcp_sessions` row. Refusing them at the Meta and Design resources
  // avoids mismatched-target tokens (a Google session_id getting stamped onto
  // a Meta- or Design-audience auth code, which would then violate the XOR CHECK).
  if (client.sessionId !== null && (isMetaResource || isDesignResource)) {
    return NextResponse.json(
      {
        error: "invalid_target",
        error_description:
          "Pre-bound OAuth clients are Google-only. Re-register via /api/oauth/register to use this resource.",
      },
      { status: 400 },
    );
  }

  // Resolve which target the auth code binds to. Polymorphic: exactly one
  // of (resolvedSessionId, resolvedConnectionId) is non-null. Enforced by
  // the `authorization_codes_target_xor` CHECK constraint at INSERT time.
  let resolvedSessionId: number | null = null;
  let resolvedConnectionId: number | null = null;

  if (client.sessionId !== null) {
    // 1. Google pre-bound flow: trust the registration-time binding.
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
        { error: "access_denied", error_description: "Session expired. Reconnect your Google Ads account and try again." },
        { status: 403 },
      );
    }
    resolvedSessionId = session.id;
  } else {
    // 2 + 3. DCR flow — identify the user. Phase-4 step 2: shared identifyUser
    // helper handles Supabase-first / cookie-fallback dispatch + telemetry.
    const identity = await identifyUser({ source: "oauth-authorize" });

    if (!identity) {
      // No identity at all — send through Google sign-in, then back here.
      const signinUrl = new URL("/api/auth/signin", requestUrl);
      signinUrl.searchParams.set(
        "next",
        `${requestUrl.pathname}${requestUrl.search}`,
      );
      return NextResponse.redirect(signinUrl.toString());
    }

    const userId = identity.userId;
    const legacyMcpSessionId = identity.legacySessionId;

    if (isDesignResource) {
      // 4. Design DCR: any authenticated NotFair user can connect. Bind the
      // auth code to the user's most-recent non-expired mcp_sessions row via
      // sessionId (no customerId requirement). The design MCP does not need
      // Google Ads credentials — it uses the user's server-side Gemini quota.
      const [designSession] = await db()
        .select({ id: schema.mcpSessions.id })
        .from(schema.mcpSessions)
        .where(
          and(
            eq(schema.mcpSessions.userId, userId),
            gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
          ),
        )
        .orderBy(sql`${schema.mcpSessions.createdAt} DESC`)
        .limit(1);

      if (!designSession) {
        // User has no session yet — bounce to sign-in, then back here.
        const signinUrl = new URL("/api/auth/signin", requestUrl);
        signinUrl.searchParams.set(
          "next",
          `${requestUrl.pathname}${requestUrl.search}`,
        );
        return NextResponse.redirect(signinUrl.toString());
      }
      resolvedSessionId = designSession.id;
    } else if (isMetaResource) {
      // 3. Meta DCR: bind to ad_platform_connections row.
      const [conn] = await db()
        .select({ id: schema.adPlatformConnections.id, activeAccountId: schema.adPlatformConnections.activeAccountId })
        .from(schema.adPlatformConnections)
        .where(
          and(
            eq(schema.adPlatformConnections.userId, userId),
            eq(schema.adPlatformConnections.platform, "meta_ads"),
          ),
        )
        .limit(1);

      if (!conn) {
        // No Meta connection yet — bounce through Layer A. /api/oauth/meta/start
        // will return the user here after the upstream Meta consent.
        const metaStartUrl = new URL("/api/oauth/meta/start", requestUrl);
        metaStartUrl.searchParams.set(
          "next",
          `${requestUrl.pathname}${requestUrl.search}`,
        );
        return NextResponse.redirect(metaStartUrl.toString());
      }
      if (!conn.activeAccountId) {
        // Meta connection exists but no active ad account selected. The user
        // probably has zero ad accounts on Meta, or the picker was bypassed.
        return NextResponse.json(
          {
            error: "access_denied",
            error_description:
              "No active Meta ad account selected. Visit /connect to pick one and try again.",
          },
          { status: 403 },
        );
      }
      resolvedConnectionId = conn.id;
    } else {
      // 2. Google DCR: prefer connection-bound auth codes when the user has
      // a Google connection (post-phase-1 backfill, this is every live
      // user). Falls back to mcp_sessions binding only for the unusual case
      // where we resolved via cookie but the connection is absent — keeps
      // mid-onboarding flows working until phase-1 dual-write covers them.
      const [googleConn] = await db()
        .select({ id: schema.adPlatformConnections.id, activeAccountId: schema.adPlatformConnections.activeAccountId })
        .from(schema.adPlatformConnections)
        .where(
          and(
            eq(schema.adPlatformConnections.userId, userId),
            eq(schema.adPlatformConnections.platform, "google_ads"),
          ),
        )
        .limit(1);

      if (googleConn?.activeAccountId) {
        resolvedConnectionId = googleConn.id;
      } else if (legacyMcpSessionId !== null) {
        // Cookie path + no usable connection. Auth code carries sessionId;
        // /token's phase-2 translator promotes it to connectionId at
        // exchange time.
        resolvedSessionId = legacyMcpSessionId;
      } else {
        // Supabase-resolved + no Google connection (or no active account).
        // No legitimate way to mint a Google MCP token — bounce to setup.
        return NextResponse.json(
          {
            error: "access_denied",
            error_description:
              "No Google Ads account connected. Visit notfair.co/connect to finish setup and try again.",
          },
          { status: 403 },
        );
      }
    }
  }

  // Generate authorization code. Exactly one of sessionId / connectionId is
  // non-null per the XOR CHECK; we assert that here defensively.
  if ((resolvedSessionId === null) === (resolvedConnectionId === null)) {
    // Both null or both set — shouldn't happen given the branches above,
    // but the CHECK constraint would also catch it.
    return NextResponse.json(
      { error: "server_error", error_description: "Internal binding error." },
      { status: 500 },
    );
  }

  const authCode = randomBytes(32).toString("hex");
  const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db().insert(schema.authorizationCodes).values({
    code: authCode,
    sessionId: resolvedSessionId,
    connectionId: resolvedConnectionId,
    redirectUri,
    clientId,
    codeChallenge,
    codeChallengeMethod,
    resourceUrl: resourceUrlPath,
    expiresAt: codeExpiresAt,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", authCode);
  if (state) url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
