import { NextResponse } from "next/server";

/**
 * Reusable factory for the platform-specific authorize wrappers under
 * `/api/oauth/<platform>/authorize`. Each wrapper:
 *
 *   1. Receives the OAuth authorize GET from a client that arrived here via
 *      path-suffixed AS metadata (`/.well-known/oauth-authorization-server/api/mcp/<platform>`).
 *   2. Carries every original query param through.
 *   3. Injects `resource=https://<host>/api/mcp/<platform>` into the request
 *      so the standard handler binds the auth code to the right platform.
 *   4. 307s to `/api/oauth/authorize`.
 *
 * Used by clients (notably Codex's rmcp) that skip RFC 9728 protected-
 * resource discovery and never send `resource=` themselves. Spec-compliant
 * clients (Claude.ai, mcp-remote with explicit resource indicators) bypass
 * the wrapper entirely — they discover the standard /api/oauth/authorize via
 * root AS metadata and send `resource=` directly.
 */
export function createPlatformAuthorizeHandler(opts: {
  resourceUrlPath: string;
}) {
  return async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const target = new URL("/api/oauth/authorize", requestUrl);

    // Carry every original query param through.
    for (const [key, value] of requestUrl.searchParams) {
      target.searchParams.set(key, value);
    }

    // Inject the resource indicator. We overwrite any pre-existing value —
    // the wrapper's contract is "this URL always means <platform>," so a
    // client sending a different resource= here is at best confused, at
    // worst adversarial.
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("host") ?? requestUrl.host;
    target.searchParams.set("resource", `${proto}://${host}${opts.resourceUrlPath}`);

    return NextResponse.redirect(target.toString(), { status: 307 });
  };
}
