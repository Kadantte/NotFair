import { NextResponse } from "next/server";
import { DEFAULT_RESOURCE_PATH, KNOWN_RESOURCE_PATHS } from "@/lib/mcp/resources";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728 / MCP 2025-06-18).
 *
 * One document per protected resource. The catch-all path lets a single
 * route serve every MCP resource we expose:
 *
 *   /.well-known/oauth-protected-resource              → /api/mcp        (default)
 *   /.well-known/oauth-protected-resource/api/mcp      → /api/mcp        (path-appended form)
 *   /.well-known/oauth-protected-resource/api/mcp/google → /api/mcp/google
 *   /.well-known/oauth-protected-resource/api/mcp/meta → /api/mcp/meta   (when activated)
 *
 * Soft allowlist: unknown paths fall back to the legacy `/api/mcp` body
 * rather than 404, so existing clients that probed odd sub-paths keep
 * discovering a valid resource. This preserves the pre-multi-platform
 * behavior where every well-known path returned the same document.
 *
 * The resource/issuer URLs are built from the request's Host header so the
 * values match whichever hostname the connector is configured against
 * (www.notfair.co vs notfair.co). A hardcoded origin breaks Claude's
 * OAuth audience validation when the client URL and discovery URL disagree.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const origin = originFromRequest(request);
  const requestedPath = path && path.length > 0 ? `/${path.join("/")}` : null;
  const resourcePath = resolveResourcePath(requestedPath);

  return NextResponse.json({
    resource: `${origin}${resourcePath}`,
    authorization_servers: [origin],
    resource_name: "NotFair",
    resource_documentation: `${origin}/google-ads-claude-connector-setup-guide`,
    resource_policy_uri: `${origin}/privacy`,
    resource_tos_uri: `${origin}/terms`,
    logo_uri: `${origin}/icon.svg`,
  });
}

function resolveResourcePath(requestedPath: string | null): string {
  if (!requestedPath) return DEFAULT_RESOURCE_PATH;
  if (KNOWN_RESOURCE_PATHS.includes(requestedPath)) return requestedPath;
  // Soft fallback: pre-multi-platform clients sometimes probe unusual
  // sub-paths. Return the legacy resource rather than 404 so they keep
  // discovering a valid auth server.
  return DEFAULT_RESOURCE_PATH;
}

function originFromRequest(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (url.protocol ? url.protocol.replace(":", "") : "https");
  return `${proto}://${host}`;
}
