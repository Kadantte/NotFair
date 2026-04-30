import { NextResponse } from "next/server";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Two response shapes from this catch-all route:
 *
 * 1. **Root** (`/.well-known/oauth-authorization-server`) — standard AS
 *    metadata with the shared `/api/oauth/{authorize,token,register}`
 *    endpoints. This is what every spec-compliant client uses (Claude.ai,
 *    mcp-remote, etc.). It's the back-compat default — already-registered
 *    clients keep working unchanged.
 *
 * 2. **Path-suffixed for platform-explicit MCPs** (`/api/mcp/google_ads`,
 *    `/api/mcp/meta_ads`) — workaround for clients (notably Codex's rmcp)
 *    that skip RFC 9728 protected-resource discovery and therefore never
 *    send `resource=` on /authorize. Without this hint the server defaults
 *    to the legacy `/api/mcp` (Google) resource — which works for Google
 *    by accident but mis-binds Meta. By advertising a platform-specific
 *    `authorization_endpoint` here, those clients pick up the right binding
 *    via their fallback path-suffixed AS probe.
 *
 *    rmcp probes this path before falling back to the root URL — see the
 *    sequence in dev logs (`/.well-known/oauth-authorization-server/api/mcp/<platform>`
 *    → 200 returns platform metadata, otherwise 404 → root fallback).
 *
 * Legacy `/api/mcp` (no platform suffix) intentionally 404s — preserves
 * existing Codex behavior of falling back to root metadata, which keeps
 * the Google-default binding stable for legacy connections that registered
 * before the multi-platform shape existed.
 *
 * The [[...path]] catch-all handles:
 *   /.well-known/oauth-authorization-server                    → root metadata
 *   /.well-known/oauth-authorization-server/api/mcp/google_ads → Google metadata
 *   /.well-known/oauth-authorization-server/api/mcp/meta_ads   → Meta metadata
 *   /.well-known/oauth-authorization-server/<anything else>    → 404
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const origin = originFromRequest(request);
  const requestedPath = path && path.length > 0 ? `/${path.join("/")}` : null;

  if (!requestedPath) {
    return NextResponse.json(rootMetadata(origin));
  }

  if (requestedPath === "/api/mcp/meta_ads") {
    return NextResponse.json(platformMetadata(origin, "meta_ads"));
  }

  if (requestedPath === "/api/mcp/google_ads") {
    return NextResponse.json(platformMetadata(origin, "google_ads"));
  }

  // Other path-suffixed probes (e.g. legacy /api/mcp) 404.
  // Clients that probe these paths fall back to the root metadata, which
  // is the existing back-compat default.
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

function rootMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    service_documentation: `${origin}/google-ads-claude-connector-setup-guide`,
    op_policy_uri: `${origin}/privacy`,
    op_tos_uri: `${origin}/terms`,
    logo_uri: `${origin}/icon.svg`,
  };
}

function platformMetadata(origin: string, platform: "google_ads" | "meta_ads") {
  return {
    ...rootMetadata(origin),
    // Platform-scoped authorize endpoint that injects resource= for clients
    // that don't implement RFC 8707 / RFC 9728. The wrapper at this path
    // delegates to the standard /api/oauth/authorize after stamping the
    // platform-specific resource indicator.
    authorization_endpoint: `${origin}/api/oauth/${platform}/authorize`,
  };
}

function originFromRequest(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (url.protocol ? url.protocol.replace(":", "") : "https");
  return `${proto}://${host}`;
}
