import { InferAgentUIMessage, stepCountIs, ToolLoopAgent, tool, type Tool } from "ai";
import { z, type ZodTypeAny } from "zod";
import type { AuthContext } from "@/lib/google-ads";
import { collectMetaAdsTools } from "@/lib/mcp/collect-meta";
import type { CollectedTool } from "@/lib/mcp/collect";
import { chatModel } from "@/lib/agents/model";
import {
  defaultModeFor,
  type ToolPermissionMode,
} from "@/lib/tool-permissions";

type AgentAuth = {
  /** Long-lived Meta access token from `ad_platform_connections.refresh_token`. */
  refreshToken: string;
  /** Active Meta ad account id (numeric, no `act_` prefix). */
  customerId: string;
  /** Every account the connection has rights to — drives the resolveAccountId allow-list. */
  customerIds?: { id: string; name: string }[];
  userId?: string | null;
  authMethod?: string | null;
  toolPermissions?: Record<string, ToolPermissionMode>;
};

const MAX_STEPS = 8;

type McpToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

function unwrapMcpResult(result: McpToolResult): unknown {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (text === undefined) return null;
  if (result.isError) return { error: text };
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toolError(error: unknown): { error: string } {
  if (error instanceof Error) return { error: error.message };
  return { error: String(error) };
}

function adaptCollectedTool(collected: CollectedTool, mode: ToolPermissionMode): Tool {
  // Strip `accountId` — chat is single-account, the MCP handler resolves to
  // the session's active Meta ad account when accountId is undefined.
  const { accountId: _accountId, ...inputShape } = collected.inputShape as Record<
    string,
    ZodTypeAny
  >;

  return tool({
    description: collected.description,
    inputSchema: z.object(inputShape),
    needsApproval: mode === "needs_approval",
    execute: async (args) => {
      try {
        const result = await collected.handler({
          ...(args as Record<string, unknown>),
          accountId: undefined,
        });
        return unwrapMcpResult(result);
      } catch (error) {
        return toolError(error);
      }
    },
  });
}

export function createMetaAdsAgent(agentAuth: AgentAuth) {
  const authContext: AuthContext = {
    refreshToken: agentAuth.refreshToken,
    customerId: agentAuth.customerId,
    customerIds:
      agentAuth.customerIds && agentAuth.customerIds.length > 0
        ? agentAuth.customerIds
        : [{ id: agentAuth.customerId, name: "" }],
    userId: agentAuth.userId ?? null,
    authMethod: agentAuth.authMethod ?? "chat",
    clientName: "adsagent-chat",
  };

  const collected = collectMetaAdsTools(() => authContext);
  const overrides = agentAuth.toolPermissions ?? {};
  const tools: Record<string, Tool> = {};
  for (const t of collected) {
    const readOnly = Boolean((t.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint);
    const mode = overrides[t.name] ?? defaultModeFor(readOnly);
    if (mode === "blocked") continue;
    tools[t.name] = adaptCollectedTool(t, mode);
  }

  return new ToolLoopAgent({
    model: chatModel,
    stopWhen: stepCountIs(MAX_STEPS),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber >= MAX_STEPS - 1) {
        return { toolChoice: "none" as const };
      }
      return {};
    },
    instructions: `You are NotFair, a Meta Ads (Facebook + Instagram) copilot in a chat interface.

You are currently operating on one connected Meta ad account chosen by the user.
Be precise, commercial, and action-oriented.

Rules:
- Use tools whenever the user asks about account data, campaigns, ad sets, ads, creatives, or performance.
- For analytical questions ("how is X performing", "audit my account", "find waste") prefer ONE \`runScript\` call that fans out via \`ads.graphParallel\` (up to 20 Graph API calls in parallel). Reads are runScript-first; the per-surface read tools (listCampaigns, listAdSets, listAds, getInsights, getAdAccount) are for narrow point queries when correlation isn't needed.
- Explain metrics in plain English and include exact numbers from tool results. Spend / budget values come from Meta in the account's MINOR currency units (cents for USD); convert before showing the user.
- Never invent campaign performance. If data is missing, say so.
- Never make write changes without explicit user confirmation. Always show what you plan to change, the current value, and the new value before executing.
- Writes available, full life cycle:
  • Status: pauseCampaign / enableCampaign, pauseAdSet / enableAdSet, pauseAd / enableAd
  • Budget / rename: updateCampaignBudget, updateAdSetBudget, renameCampaign, renameAd
  • Create: createCampaign, createAdSet, createAdCreative, createAd (creation order: campaign → ad set → creative → ad). Use \`listPages\` to surface the user's Page id for object_story_spec.page_id when minting a creative. Default new entities to status=PAUSED so the user can review before launching.
  • Comprehensive updates: updateCampaign (bid strategy, schedule, special_ad_categories, …), updateAdSet (targeting, optimization_goal, billing_event, bid, schedule, …), updateAdCreative (swap creative on existing ad).
- Boosted page-post ads cannot have their status mutated through pauseAd (Meta returns code 100). For those, use \`pauseAdSet\` on the parent ad set; pausing the underlying Page post is out of scope for this MCP and the user must use Ads Manager.
- For boosted Page posts, the user may want to compare paid vs organic. Use \`getPagePostInsights(postId)\` with the post id from \`creative.effective_object_story_id\` (format: <page_id>_<post_id>). Returns aggregate impressions, reach, reactions, like / comment / share counts only — never individual user data.
- Ad-set-level budget updates fail under Campaign Budget Optimization (CBO) — if updateAdSetBudget returns a CBO rejection, fall back to updateCampaignBudget on the parent.
- IMPORTANT: Always end your response with a text summary. Never stop after tool calls without explaining the results to the user.`,
    tools,
  });
}

export type MetaAdsAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createMetaAdsAgent>
>;
