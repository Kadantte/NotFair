/**
 * Platform-explicit Meta Ads MCP at `/api/mcp/meta_ads`.
 *
 * STAGE 2 SKELETON: route serves valid MCP protocol with an empty tool list
 * so connectors can complete the OAuth dance end-to-end before any tools are
 * wired up. Real Graph API tools land in Stage 4 (see
 * docs/multi-platform-mcp-design.md).
 *
 * Tokens issued for this resource carry the `oat_meta_ads_` prefix and an
 * audience binding to this URL — they cannot authenticate at the legacy
 * `/api/mcp` (Google) resource because the platform-scoped audience check
 * compares `findResource(token.resource_url).platform` to `config.platform`.
 *
 * Direct bearer tokens (`mcp_sessions.access_token`) are refused here. They
 * predate multi-platform and are platform-bound to Google sessions; only
 * `oat_meta_ads_*` tokens issued through the new OAuth flow authenticate
 * against this route.
 */

import { createPlatformMcpHandler } from "@/lib/mcp/handler-factory";
import { findResource } from "@/lib/mcp/resources";
import {
  META_MCP_INSTRUCTIONS,
  registerMetaAdsTools,
} from "@/lib/mcp/platforms/meta";

const RESOURCE_URL_PATH = "/api/mcp/meta_ads";
const resource = findResource(RESOURCE_URL_PATH);
if (!resource) {
  throw new Error(`MCP resource ${RESOURCE_URL_PATH} not registered in lib/mcp/resources.ts`);
}

const handler = createPlatformMcpHandler({
  platform: resource.platform,
  resourceUrlPath: RESOURCE_URL_PATH,
  tokenPrefix: resource.tokenPrefix,
  legacyTokenPrefixes: resource.legacyTokenPrefixes,
  // Direct bearers (mcp_sessions session tokens) are Google-bound; refuse
  // them here. Meta connections live in `ad_platform_connections` (Stage 2.5
  // migration) and are accessed via `oat_meta_ads_*` tokens only.
  acceptDirectBearer: false,
  instructions: META_MCP_INSTRUCTIONS,
  registerTools: registerMetaAdsTools,
});

export { handler as GET, handler as POST, handler as DELETE };
