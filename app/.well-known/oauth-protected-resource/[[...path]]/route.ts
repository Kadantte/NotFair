import { NextResponse } from "next/server";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9470).
 *
 * The resource/issuer URLs are built from the request's Host header so the
 * values match whichever hostname the connector is configured against
 * (www.notfair.co vs notfair.co). A hardcoded origin breaks Claude's
 * OAuth audience validation when the client URL and discovery URL disagree.
 *
 * The [[...path]] catch-all handles both:
 *   /.well-known/oauth-protected-resource          (root)
 *   /.well-known/oauth-protected-resource/api/mcp  (path-appended)
 */
export async function GET(request: Request) {
  const origin = originFromRequest(request);

  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    resource_name: "NotFair",
    resource_documentation: `${origin}/google-ads-claude-connector-setup-guide`,
    resource_policy_uri: `${origin}/privacy`,
    resource_tos_uri: `${origin}/terms`,
    logo_uri: `${origin}/icon.svg`,
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
