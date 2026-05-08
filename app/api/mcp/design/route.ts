/**
 * Hosted Design MCP at `/api/mcp/design`.
 *
 * Unlike the Google Ads / Meta Ads MCPs, Design requires no ad-platform
 * account — any authenticated NotFair user can connect. Auth resolves to a
 * userId via an `oat_design_*`-prefixed OAuth token bound to an mcp_sessions
 * row. The token is minted by the standard DCR → /authorize → /token OAuth
 * flow; no customerId or ad-platform connection is needed.
 *
 * Tools:
 *   - generate_image — Gemini image generation, server-side quota-gated,
 *     result uploaded to Vercel Blob and returned as a public URL.
 *   - get_usage     — read-only quota snapshot for this month.
 */

import { createSimpleMcpHandler } from "@/lib/mcp/handler-factory";
import { findResource } from "@/lib/mcp/resources";
import {
  DESIGN_MCP_INSTRUCTIONS,
  registerDesignTools,
} from "@/lib/mcp/platforms/design";

const RESOURCE_URL_PATH = "/api/mcp/design";
const resource = findResource(RESOURCE_URL_PATH);
if (!resource) {
  throw new Error(`MCP resource ${RESOURCE_URL_PATH} not registered in lib/mcp/resources.ts`);
}

const handler = createSimpleMcpHandler({
  platform: resource.platform,
  resourceUrlPath: RESOURCE_URL_PATH,
  tokenPrefix: resource.tokenPrefix,
  legacyTokenPrefixes: resource.legacyTokenPrefixes,
  instructions: DESIGN_MCP_INSTRUCTIONS,
  registerTools: registerDesignTools,
});

export { handler as GET, handler as POST, handler as DELETE };
