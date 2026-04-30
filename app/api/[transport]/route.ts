/**
 * Legacy MCP entry point at `/api/mcp` — preserved permanently for backward
 * compatibility with already-registered Claude.ai connectors and existing
 * `oat_*` tokens. The new platform-explicit URL is at
 * `/api/mcp/google/mcp` (see app/api/mcp/google/[transport]/route.ts).
 *
 * Both routes share the same Google Ads tool surface via the multi-platform
 * handler factory. The only differences are:
 *   - resourceUrlPath (`/api/mcp` here, `/api/mcp/google/mcp` on the new
 *     route). Audience-checked against `oauth_access_tokens.resource_url`.
 *   - new tokens issued for `/api/mcp` keep the legacy `oat_` prefix; the
 *     new route stamps `oat_google_ads_`.
 */

import { createPlatformMcpHandler } from "@/lib/mcp/handler-factory";
import { findResource } from "@/lib/mcp/resources";
import {
  GOOGLE_MCP_INSTRUCTIONS,
  registerGoogleAdsTools,
} from "@/lib/mcp/platforms/google";

const RESOURCE_URL_PATH = "/api/mcp";
const resource = findResource(RESOURCE_URL_PATH);
if (!resource) {
  // Defensive — should never trigger unless the resources registry is misconfigured.
  throw new Error(`MCP resource ${RESOURCE_URL_PATH} not registered in lib/mcp/resources.ts`);
}

const handler = createPlatformMcpHandler({
  platform: resource.platform,
  resourceUrlPath: RESOURCE_URL_PATH,
  // Legacy `oat_` is the *primary* prefix at this resource — every token
  // issued at /api/mcp pre-multi-platform carries it, and the token
  // endpoint continues to stamp `oat_` for codes minted at the default
  // resource. Treating it as "primary" (not "legacy") keeps behavior
  // identical to the pre-refactor handler.
  tokenPrefix: "oat_",
  legacyTokenPrefixes: [],
  // Pre-multi-platform direct Bearer tokens (mcp_sessions.access_token) only
  // authenticate here — platform-explicit routes refuse them.
  acceptDirectBearer: true,
  instructions: GOOGLE_MCP_INSTRUCTIONS,
  registerTools: registerGoogleAdsTools,
});

export { handler as GET, handler as POST, handler as DELETE };
