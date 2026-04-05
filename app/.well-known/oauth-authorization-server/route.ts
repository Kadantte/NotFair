import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Tells Claude (and other OAuth clients) where our authorization
 * and token endpoints are.
 */
export async function GET() {
  const origin = getAppOrigin();

  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
  });
}
