import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEMO_OAUTH_CLIENT_ID } from "@/lib/demo/constants";
import { ensureDemoOAuthClient } from "@/lib/demo/seed";

/**
 * OAuth 2.0 Authorization Endpoint for Claude Connector.
 *
 * Claude redirects users here with the client_id they configured.
 * We look up the client_id → find the linked MCP session → generate
 * an authorization code → redirect back to Claude.
 *
 * No browser login is needed because the client_id already identifies
 * the user (they generated it on adsagent.org while logged in).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

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

  // Look up the OAuth client → linked MCP session
  const [client] = await db()
    .select({
      sessionId: schema.oauthClients.sessionId,
    })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, clientId))
    .limit(1);

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id. Generate credentials at www.adsagent.org." },
      { status: 401 },
    );
  }

  // Verify the linked MCP session is still valid
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

  // Generate authorization code
  const authCode = randomBytes(32).toString("hex");
  const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db().insert(schema.authorizationCodes).values({
    code: authCode,
    sessionId: session.id,
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
