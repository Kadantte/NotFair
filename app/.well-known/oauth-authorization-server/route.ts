import { NextResponse } from "next/server";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * The issuer + endpoint URLs are built from the request's Host header so
 * Claude's OAuth audience lines up with whichever hostname the connector
 * is configured against. A hardcoded origin would force Claude to redirect
 * between www and bare mid-flow, which breaks the token exchange.
 */
export async function GET(request: Request) {
  const origin = originFromRequest(request);

  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
  });
}

function originFromRequest(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (url.protocol ? url.protocol.replace(":", "") : "https");
  return `${proto}://${host}`;
}
