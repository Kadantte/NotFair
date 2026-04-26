import { randomBytes, createHash } from "crypto";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

/**
 * RFC 7591 Dynamic Client Registration.
 *
 * Anonymous endpoint — used by MCP clients like Codex CLI that auto-register
 * themselves before running the OAuth flow. The resulting client_id is NOT
 * pre-bound to an mcp_session; /api/oauth/authorize resolves the session
 * from the user's cookie at flow time.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON" },
      { status: 400 },
    );
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris is required and must be a non-empty array" },
      { status: 400 },
    );
  }

  const cleanRedirectUris: string[] = [];
  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      return NextResponse.json(
        { error: "invalid_redirect_uri", error_description: "redirect_uris entries must be strings" },
        { status: 400 },
      );
    }
    try {
      // eslint-disable-next-line no-new
      new URL(uri);
    } catch {
      return NextResponse.json(
        { error: "invalid_redirect_uri", error_description: `redirect_uri is not a valid URL: ${uri}` },
        { status: 400 },
      );
    }
    cleanRedirectUris.push(uri);
  }

  const tokenAuthMethod = typeof body.token_endpoint_auth_method === "string"
    ? body.token_endpoint_auth_method
    : "client_secret_post";
  if (tokenAuthMethod !== "client_secret_post" && tokenAuthMethod !== "none") {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Only client_secret_post and none are supported" },
      { status: 400 },
    );
  }

  const clientName = typeof body.client_name === "string" && body.client_name.length <= 200
    ? body.client_name
    : null;

  const clientId = `adsagent_${randomBytes(16).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("hex");
  const clientSecretHash = createHash("sha256").update(clientSecret).digest("hex");

  await db().insert(schema.oauthClients).values({
    clientId,
    clientSecret,
    clientSecretHash,
    sessionId: null,
    redirectUris: cleanRedirectUris,
    clientName,
  });

  return NextResponse.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // Secret never expires server-side; surface 0 per RFC 7591 to mean "no expiry".
      client_secret_expires_at: 0,
      redirect_uris: cleanRedirectUris,
      token_endpoint_auth_method: tokenAuthMethod,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      ...(clientName ? { client_name: clientName } : {}),
    },
    { status: 201 },
  );
}
