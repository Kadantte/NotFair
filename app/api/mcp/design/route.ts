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
 *   - generate_image — OpenAI GPT Image 2 generation, server-side
 *     quota-gated, result uploaded to S3 and returned as a public URL.
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

// gpt-image-2 at quality="high" can take 150–250s; allow the function the
// full Vercel maximum so the upstream AbortSignal timeout (280s) is the one
// that fires first and surfaces a structured error.
export const maxDuration = 300;

export { handler as GET, handler as POST, handler as DELETE };
