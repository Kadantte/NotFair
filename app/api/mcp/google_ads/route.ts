/**
 * Platform-explicit Google Ads MCP at `/api/mcp/google_ads`.
 *
 * Protocol-first URL shape: every NotFair MCP server lives under `/api/mcp/*`,
 * with the platform identifier as the sub-path. Mirrors the legacy `/api/mcp`
 * convention and matches how MCP servers in the wild are conventionally
 * namespaced (e.g. GitHub's `api.githubcopilot.com/mcp/`).
 *
 * New connector registrations are directed here so the connector entry in
 * Claude.ai surfaces as "NotFair Google Ads" naturally. Tokens issued for
 * this resource carry the `oat_google_ads_` prefix and an audience binding
 * to this URL — they cannot authenticate at the legacy `/api/mcp` resource.
 *
 * Same Google Ads tool surface as the legacy route — they share the platform
 * config in `lib/mcp/platforms/google.ts`. Adding new tools or instructions
 * once propagates to both URLs.
 */

import { createPlatformMcpHandler } from "@/lib/mcp/handler-factory";
import { findResource } from "@/lib/mcp/resources";
import {
  GOOGLE_MCP_INSTRUCTIONS,
  registerGoogleAdsTools,
} from "@/lib/mcp/platforms/google";

const RESOURCE_URL_PATH = "/api/mcp/google_ads";
const resource = findResource(RESOURCE_URL_PATH);
if (!resource) {
  throw new Error(`MCP resource ${RESOURCE_URL_PATH} not registered in lib/mcp/resources.ts`);
}

const handler = createPlatformMcpHandler({
  platform: resource.platform,
  resourceUrlPath: RESOURCE_URL_PATH,
  tokenPrefix: resource.tokenPrefix,
  legacyTokenPrefixes: resource.legacyTokenPrefixes,
  // Direct bearer tokens (mcp_sessions.access_token) are accepted here too —
  // they're already platform-bound (each session points at one Google Ads
  // customer), so the audience-scoping the OAuth `oat_*` prefix provides is
  // already implicit for direct bearers. Lets users connect with the same
  // session token they already have at /api/mcp without re-running OAuth.
  acceptDirectBearer: true,
  instructions: GOOGLE_MCP_INSTRUCTIONS,
  registerTools: registerGoogleAdsTools,
});

export { handler as GET, handler as POST, handler as DELETE };
