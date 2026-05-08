import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";
import { redirectUriEquivalent } from "@/lib/oauth/redirect-uri";
import { DEFAULT_RESOURCE_PATH, findResource, resolveResourceFromUrl } from "@/lib/mcp/resources";
import { readGoogleFromConnections } from "@/lib/connections/feature-flags";

/**
 * OAuth 2.0 Token Endpoint for Claude Connector.
 *
 * Exchanges an authorization code for an access token.
 * Validates client_secret and supports PKCE.
 */
export async function POST(request: Request) {
  let params: URLSearchParams;

  // Accept both form-encoded and JSON bodies
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    params = new URLSearchParams(body);
  } else {
    const text = await request.text();
    params = new URLSearchParams(text);
  }

  const grantType = params.get("grant_type");
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  let clientId = params.get("client_id");
  let clientSecret = params.get("client_secret");
  const codeVerifier = params.get("code_verifier");

  // RFC 6749 §2.3.1 — client may also authenticate via HTTP Basic.
  // Codex CLI defaults to this for confidential clients. If the body
  // didn't include client_id/client_secret, fall back to the Authorization
  // header.
  if (!clientId || !clientSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    if (authHeader.toLowerCase().startsWith("basic ")) {
      try {
        const decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
        const idx = decoded.indexOf(":");
        if (idx >= 0) {
          const basicId = decodeURIComponent(decoded.slice(0, idx));
          const basicSecret = decodeURIComponent(decoded.slice(idx + 1));
          if (!clientId) clientId = basicId;
          if (!clientSecret) clientSecret = basicSecret;
        }
      } catch {
        // fall through — invalid base64 will be caught by the missing-cred check below
      }
    }
  }


  if (grantType !== "authorization_code") {
    return NextResponse.json(
      { error: "unsupported_grant_type", error_description: "Only authorization_code is supported" },
      { status: 400 },
    );
  }

  if (!code || !clientId) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing code or client_id" },
      { status: 400 },
    );
  }

  // Validate client_secret
  if (!clientSecret) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Missing client_secret" },
      { status: 401 },
    );
  }

  const [client] = await db()
    .select({ clientSecretHash: schema.oauthClients.clientSecretHash })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, clientId))
    .limit(1);

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 401 },
    );
  }

  const providedHash = createHash("sha256").update(clientSecret).digest("hex");
  if (providedHash !== client.clientSecretHash) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Invalid client_secret" },
      { status: 401 },
    );
  }

  // Look up the authorization code
  const [authCode] = await db()
    .select()
    .from(schema.authorizationCodes)
    .where(
      and(
        eq(schema.authorizationCodes.code, code),
        eq(schema.authorizationCodes.used, false),
        gte(schema.authorizationCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!authCode) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid, expired, or already used authorization code" },
      { status: 400 },
    );
  }

  // Validate client_id matches the code
  if (authCode.clientId !== clientId) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "client_id mismatch" },
      { status: 400 },
    );
  }

  // Validate redirect_uri (required per RFC 6749 §4.1.3 when included in authorization request)
  if (!redirectUri) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing redirect_uri" },
      { status: 400 },
    );
  }
  if (!redirectUriEquivalent(authCode.redirectUri, redirectUri)) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400 },
    );
  }

  // Validate PKCE if code_challenge was provided during authorization
  if (authCode.codeChallenge) {
    if (!codeVerifier) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Missing code_verifier" },
        { status: 400 },
      );
    }

    let computedChallenge: string;
    if (authCode.codeChallengeMethod === "S256") {
      computedChallenge = createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");
    } else {
      computedChallenge = codeVerifier;
    }

    if (computedChallenge !== authCode.codeChallenge) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "code_verifier validation failed" },
        { status: 400 },
      );
    }
  }

  // Mark code as used
  await db()
    .update(schema.authorizationCodes)
    .set({ used: true })
    .where(eq(schema.authorizationCodes.code, code));

  // LOAD-BEARING: validate the bound target still exists. /authorize will
  // pass with as little as 1s of validity left, so a session/connection can
  // tick past expiry between authorize and this token exchange. Without the
  // check we silently issue a token whose connection is gone; the request
  // handler then 401s every MCP call, the client treats that as "token bad"
  // and re-runs OAuth — tight 401 → re-authorize retry loop.
  //
  // Returning invalid_grant (400) instead of issuing the dud token is what
  // surfaces a real error to the client so it stops retrying.
  //
  // Polymorphic dispatch: the auth code carries either session_id (Google,
  // → mcp_sessions) or connection_id (Meta+, → ad_platform_connections).
  // Exactly one is non-null per the XOR CHECK constraint.
  //
  // Phase-2 dual-aware token binding for Google: when the auth code carries
  // session_id AND READ_GOOGLE_FROM_CONNECTIONS is on, translate the binding
  // to the user's ad_platform_connections row at exchange time. The auth code
  // itself is left alone (short-lived, expires in 10 min). The token row gets
  // connectionId set / sessionId NULL — same shape Meta tokens use today.
  let expiresInSeconds: number;
  // Set to a non-null value when phase-2 translation produces a connection
  // binding for a sessionId-bound code; the INSERT below uses these instead
  // of authCode.sessionId / authCode.connectionId.
  let translatedSessionId: number | null = authCode.sessionId;
  let translatedConnectionId: number | null = authCode.connectionId;
  if (authCode.sessionId !== null) {
    const [session] = await db()
      .select({ expiresAt: schema.mcpSessions.expiresAt, userId: schema.mcpSessions.userId })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.id, authCode.sessionId),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);
    if (!session) {
      return NextResponse.json(
        {
          error: "invalid_grant",
          error_description:
            "The session bound to this authorization code has expired. Sign in again at notfair.co/connect to mint a new session.",
        },
        { status: 400 },
      );
    }
    expiresInSeconds = Math.max(
      0,
      Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
    );

    // Phase-2 Google translator: only run when the auth code's resource is
    // google_ads. Design tokens also carry sessionId (they bind to
    // mcp_sessions, not ad_platform_connections), so we must NOT translate
    // them — a design user who also has Google Ads would otherwise have their
    // design token silently rewritten to a Google connection binding.
    const codeResource = resolveResourceFromUrl(authCode.resourceUrl ?? DEFAULT_RESOURCE_PATH);
    if (readGoogleFromConnections() && session.userId && codeResource?.platform === "google_ads") {
      const [conn] = await db()
        .select({ id: schema.adPlatformConnections.id })
        .from(schema.adPlatformConnections)
        .where(
          and(
            eq(schema.adPlatformConnections.userId, session.userId),
            eq(schema.adPlatformConnections.platform, "google_ads"),
          ),
        )
        .limit(1);
      if (conn) {
        // Successful translation: bind the new token to the connection row,
        // not the session row. Defer-fall-through if the connection lookup
        // fails (phase-1 dual-write should have populated one for every live
        // mcp_sessions user; the missing row is a backfill gap, not a reason
        // to block token exchange).
        translatedSessionId = null;
        translatedConnectionId = conn.id;
      }
    }
  } else if (authCode.connectionId !== null) {
    const [conn] = await db()
      .select({ expiresAt: schema.adPlatformConnections.accessTokenExpiresAt })
      .from(schema.adPlatformConnections)
      .where(eq(schema.adPlatformConnections.id, authCode.connectionId))
      .limit(1);
    if (!conn) {
      return NextResponse.json(
        {
          error: "invalid_grant",
          error_description:
            "The platform connection bound to this authorization code no longer exists. Reconnect via /connect.",
        },
        { status: 400 },
      );
    }
    // Meta long-lived tokens are valid for ~60 days; use the connection's
    // accessTokenExpiresAt as a proxy for token validity. If the connection
    // hasn't refreshed yet, default to 60 days from now.
    const exp = conn.expiresAt ? new Date(conn.expiresAt).getTime() : Date.now() + 60 * 24 * 60 * 60 * 1000;
    expiresInSeconds = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  } else {
    // Should never happen — XOR CHECK at INSERT time enforces exactly one.
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Authorization code has no bound target." },
      { status: 400 },
    );
  }

  // LOAD-BEARING: INSERT into oauth_access_tokens, do NOT UPDATE a column
  // on oauth_clients. Two parallel code exchanges for the same client_id
  // (Claude Desktop reconnect, shared pre-bound creds, etc.) both land
  // here; the previous design rotated a single column so the second
  // exchange silently invalidated the first issued token. Independent
  // rows keep each issued token alive until its session expires.
  //
  // See lib/db/schema.ts → oauthAccessTokens for the invariant.
  //
  // Token prefix is derived from the resource the auth code was issued
  // against (RFC 8707). Auth codes minted by pre-multi-platform clients
  // have NULL `resource_url` — those default to /api/mcp + legacy `oat_`
  // prefix so existing Claude registrations keep working unchanged.
  const resourceUrlPath = authCode.resourceUrl ?? DEFAULT_RESOURCE_PATH;
  const resource = findResource(resourceUrlPath);
  const tokenPrefix = resource && resourceUrlPath !== DEFAULT_RESOURCE_PATH
    // Platform-explicit resource — stamp the new prefix.
    ? resource.tokenPrefix
    // Default `/api/mcp` keeps the legacy `oat_` prefix indefinitely so old
    // tokens and new tokens issued at this path are indistinguishable to
    // existing connectors. New Google connections that want the explicit
    // prefix should request `resource=/api/mcp/google` at /authorize time.
    : "oat_";
  const oauthAccessToken = `${tokenPrefix}${randomBytes(32).toString("hex")}`;

  await db().insert(schema.oauthAccessTokens).values({
    token: oauthAccessToken,
    clientId,
    // Polymorphic FK: exactly one of these is non-null per the XOR CHECK.
    // For Google sessionId-bound codes, phase-2 may have translated to a
    // connection binding above; otherwise these match the auth code 1:1.
    sessionId: translatedSessionId,
    connectionId: translatedConnectionId,
    resourceUrl: resourceUrlPath,
  });

  // For Google DCR clients (RFC 7591), record the session binding on the
  // client row so subsequent /authorize calls can short-circuit through the
  // pre-bound path instead of re-prompting for sign-in. Pre-bound clients
  // already have session_id set; this UPDATE is a no-op for them.
  //
  // SKIPPED when:
  // - Meta tokens (authCode.connectionId set): oauth_clients.session_id is
  //   FK-pointing at mcp_sessions only; writing an ad_platform_connections.id
  //   would corrupt the table.
  // - Phase-2 translated Google tokens (translatedSessionId === null but
  //   authCode.sessionId !== null): same reason — the column is mcp_sessions-
  //   only. The pre-bound short-circuit retires alongside mcp_sessions in
  //   phase 5; until then, leaving the client row untouched is safe (the
  //   /authorize DCR path will re-resolve via cookie next time).
  if (translatedSessionId !== null) {
    await db()
      .update(schema.oauthClients)
      .set({ sessionId: translatedSessionId })
      .where(eq(schema.oauthClients.clientId, clientId));
  }

  const expiresIn = expiresInSeconds;

  return NextResponse.json({
    access_token: oauthAccessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
  });
}
