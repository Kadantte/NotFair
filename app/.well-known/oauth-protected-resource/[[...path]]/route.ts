import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9470).
 *
 * mcp-remote discovers this before connecting. Without it,
 * it throws "Resource server does not implement OAuth 2.0
 * Protected Resource Metadata" and the connection fails.
 *
 * The [[...path]] catch-all handles both:
 *   /.well-known/oauth-protected-resource          (root)
 *   /.well-known/oauth-protected-resource/api/mcp  (path-appended)
 */
export async function GET() {
  const origin = getAppOrigin();

  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  });
}
