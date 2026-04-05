import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";

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
  const clientId = params.get("client_id");
  const clientSecret = params.get("client_secret");
  const codeVerifier = params.get("code_verifier");

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

  // Validate redirect_uri
  if (redirectUri && authCode.redirectUri !== redirectUri) {
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

  // Look up the MCP session to check it's still valid
  const [session] = await db()
    .select({
      expiresAt: schema.mcpSessions.expiresAt,
    })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.id, authCode.sessionId))
    .limit(1);

  if (!session) {
    return NextResponse.json(
      { error: "server_error", error_description: "Session not found" },
      { status: 500 },
    );
  }

  // Issue a dedicated OAuth access token (independent of the MCP session token)
  const oauthAccessToken = `oat_${randomBytes(32).toString("hex")}`;

  await db()
    .update(schema.oauthClients)
    .set({ oauthAccessToken })
    .where(eq(schema.oauthClients.clientId, clientId));

  const expiresIn = Math.max(
    0,
    Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
  );

  return NextResponse.json({
    access_token: oauthAccessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
  });
}
