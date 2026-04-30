import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "@/lib/google-ads";
import { typedResult } from "@/lib/mcp/types";

/**
 * Server-level routing heuristic for the Meta Ads MCP. Same shape as the
 * Google instructions — "which tool do I pick?" guidance the agent reads at
 * `initialize`. Tools are NOT prefixed; Claude.ai (and other clients)
 * namespace by server before showing them to the model, so platform identity
 * is already disambiguated by the server name + resource URL.
 *
 * STAGE 2 SKELETON: tool list is empty. The instructions describe the
 * intended `runScript` shape (Graph API + Insights + batch) so the route
 * is honest about what it will offer once Stage 4 lands. Real tool
 * registrations land in lib/mcp/code-mode-meta/ + read/write modules.
 */
export const META_MCP_INSTRUCTIONS = `NotFair is an MCP for the Meta Marketing API (Facebook + Instagram Ads). You are an expert paid-social practitioner whose goal is to help the user understand and manage their Meta ad accounts.

Tool-selection heuristic — pick ONE path per user question:

1. Read-only questions (audits, performance analysis, diagnostics) → \`runScript\`.
   Examples: "how is my campaign doing", "audit my account", "find ad sets with poor ROAS",
   "why did CPM spike last week", "rank my ad sets by spend efficiency".

   \`runScript\` runs a JS sandbox with \`ads.graph(path, params)\` and
   \`ads.graphParallel([calls])\` — fan out up to 20 Graph API calls in one
   request and correlate surfaces (insights, ad set deliveries, account
   balance, recent edits) in a single pass. Cast a wide net on the first
   call; filtering happens in-script for free.

   Sandbox API surface:
   - \`ads.graph(path, params)\` — single Graph API call (e.g. \`/{adAccountId}/insights\`).
   - \`ads.graphParallel([{name, path, params, limit?}, ...])\` — batched fan-out.
   - \`ads.insights(adAccountId, options)\` — pre-built insights helper with
     date-range and breakdown defaults.
   - \`ads.batch([requests])\` — Graph API batch endpoint for bulk operations.

   Follow-up rule: after a \`runScript\` pass, don't chain \`runScript\` calls
   unless the next one has a fundamentally different shape. If you catch
   yourself about to call it a second time, ask whether the batch could
   have been in the first call.

2. Mutations (pause, budget change, creative update, audience edit) → individual
   write tools (\`pauseCampaign\`, \`pauseAdSet\`, \`pauseAd\`, etc.). Never wrap
   mutations in \`runScript\` — writes happen through dedicated tools with
   guardrails and change-tracking.

3. Specialized non-Graph reads → dedicated tools:
   - \`listAdAccounts\` — accounts the user has access to via Business Manager.
   - \`getInsights\` — pre-built insights pull with sensible defaults.

(Stage 2 skeleton: most tools above are not yet registered. The route serves
valid MCP protocol so connectors can complete OAuth, but tool calls are
limited until Stage 4.)`;

/**
 * Register every Meta Ads MCP tool. STAGE 2: only a placeholder
 * `_skeleton_status` tool so the server advertises the `tools` capability
 * (mcp-handler only enables `tools/list` after at least one registration).
 * Real Graph-API-backed tools land in Stage 4.
 */
export function registerMetaAdsTools(server: McpServer, _currentAuth: () => AuthContext): void {
  server.registerTool(
    "_skeleton_status",
    {
      description:
        "Stage 2 skeleton: this Meta Ads MCP route serves valid MCP protocol but has no real tools yet. " +
        "OAuth, account selection, and Graph API tools land in Stages 3 and 4. " +
        "See docs/multi-platform-mcp-design.md for the rollout plan.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () =>
      typedResult({
        status: "skeleton",
        stage: 2,
        message:
          "The Meta Ads MCP is a skeleton. The route, audience binding, and resource registry are wired up, " +
          "but Meta OAuth, ad-account enumeration, and Graph API tools are not yet implemented. " +
          "Track progress in docs/multi-platform-mcp-design.md.",
      }),
  );
}
