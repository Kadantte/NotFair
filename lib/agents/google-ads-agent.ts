import { InferAgentUIMessage, stepCountIs, ToolLoopAgent, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  getKeywords,
  getCampaignPerformance,
  getAccountInfo,
  listAccessibleCustomers,
  listCampaigns,
  runSafeGaqlReport,
  pauseKeyword,
  enableKeyword,
  updateBid,
  addNegativeKeyword,
  removeNegativeKeyword,
  updateCampaignBudget,
  pauseCampaign,
  enableCampaign,
  toMicros,
} from "@/lib/google-ads";
import { logChange, getChanges, getUndoableChange, markRolledBack } from "@/lib/db/tracking";
import type { WriteResult } from "@/lib/google-ads";

type AgentAuth = {
  refreshToken: string;
  customerId: string;
  userId?: string | null;
};

/** Execute a write operation and log the change. Returns the result with changeId attached. */
async function execAndLog(
  auth: AgentAuth,
  campaignId: string | null,
  fn: () => Promise<WriteResult>,
) {
  const result = await fn();
  if (!result.success) return result;
  const change = await logChange(auth.customerId, auth.userId, campaignId, result);
  return { ...result, changeId: change?.id ?? null };
}

export function createGoogleAdsAgent(auth: AgentAuth) {
  return new ToolLoopAgent({
    model: openai("gpt-5.4"),
    stopWhen: stepCountIs(8),
    instructions: `You are AdsAgent, a Google Ads copilot in a chat interface.

You are currently operating on one connected Google Ads account chosen by the user.
Be precise, commercial, and action-oriented.

Rules:
- Use tools whenever the user asks about account data, campaigns, keywords, metrics, or reporting.
- When the user asks for analysis, inspect the account first instead of making assumptions.
- Explain metrics in plain English and include exact numbers from tool results.
- Never invent campaign performance. If data is missing, say so.
- Prefer concise answers unless the user explicitly asks for a deeper audit.
- Never make write changes without explicit user confirmation. Always show what you plan to change, the current value, and the new value before executing.
- After every write, tell the user the changeId so they can undo within 7 days.
- Guardrails are server-side: bid changes >25% and budget changes >50% will be rejected.`,
    tools: {
      getConnectedAccount: tool({
        description: "Get the currently connected Google Ads customer context.",
        inputSchema: z.object({}),
        execute: async () => getAccountInfo(auth),
      }),
      listAccessibleCustomers: tool({
        description:
          "List all Google Ads customers accessible with the connected refresh token.",
        inputSchema: z.object({}),
        execute: async () => listAccessibleCustomers(auth.refreshToken),
      }),
      listCampaigns: tool({
        description:
          "List campaigns in the currently connected Google Ads account with top-line metrics.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(100).default(20),
          includeRemoved: z.boolean().default(false),
        }),
        execute: async ({ limit, includeRemoved }) =>
          listCampaigns(auth, { limit, includeRemoved }),
      }),
      getCampaignPerformance: tool({
        description:
          "Get daily performance and rolled-up totals for a campaign over a recent date range.",
        inputSchema: z.object({
          campaignId: z.string().describe("Google Ads campaign ID"),
          days: z.number().int().min(1).max(365).default(30),
        }),
        execute: async ({ campaignId, days }) =>
          getCampaignPerformance(auth, campaignId, days),
      }),
      getCampaignKeywords: tool({
        description:
          "Get top keywords and keyword metrics for a campaign over a recent date range.",
        inputSchema: z.object({
          campaignId: z.string().describe("Google Ads campaign ID"),
          days: z.number().int().min(1).max(365).default(30),
          limit: z.number().int().min(1).max(100).default(20),
        }),
        execute: async ({ campaignId, days, limit }) =>
          getKeywords(auth, campaignId, days, limit),
      }),
      runGaqlReport: tool({
        description:
          "Run a safe read-only GAQL SELECT query against the connected account for advanced reporting.",
        inputSchema: z.object({
          query: z
            .string()
            .min(10)
            .describe("A GAQL SELECT query. Mutating statements are not allowed."),
        }),
        execute: async ({ query }) => runSafeGaqlReport(auth, query),
      }),

      // ─── Write Tools ─────────────────────────────────────────
      pauseKeyword: tool({
        description: "Pause an active keyword to stop it from triggering ads. Returns a changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          criterionId: z.string(),
        }),
        execute: ({ campaignId, adGroupId, criterionId }) =>
          execAndLog(auth, campaignId, () => pauseKeyword(auth, campaignId, adGroupId, criterionId)),
      }),
      enableKeyword: tool({
        description: "Re-enable a paused keyword. Returns a changeId for undo.",
        inputSchema: z.object({
          adGroupId: z.string(),
          criterionId: z.string(),
        }),
        execute: ({ adGroupId, criterionId }) =>
          execAndLog(auth, null, () => enableKeyword(auth, adGroupId, criterionId)),
      }),
      updateBid: tool({
        description: "Change the CPC bid for a keyword (max 25% change per adjustment). Returns a changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          criterionId: z.string(),
          newBidDollars: z.number().positive().describe("New bid in dollars (e.g. 1.50)"),
        }),
        execute: ({ campaignId, adGroupId, criterionId, newBidDollars }) =>
          execAndLog(auth, campaignId, () => updateBid(auth, campaignId, adGroupId, criterionId, toMicros(newBidDollars))),
      }),
      addNegativeKeyword: tool({
        description: "Add a negative keyword (phrase match) to block irrelevant search terms. Returns a changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
          keywordText: z.string().min(1),
        }),
        execute: ({ campaignId, keywordText }) =>
          execAndLog(auth, campaignId, () => addNegativeKeyword(auth, campaignId, keywordText)),
      }),
      removeNegativeKeyword: tool({
        description: "Remove a negative keyword from a campaign. Returns a changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
          keywordText: z.string().min(1),
        }),
        execute: ({ campaignId, keywordText }) =>
          execAndLog(auth, campaignId, () => removeNegativeKeyword(auth, campaignId, keywordText)),
      }),
      updateCampaignBudget: tool({
        description: "Change the daily budget for a campaign (max 50% change, min $1/day). Returns a changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
          newDailyBudgetDollars: z.number().positive().describe("New daily budget in dollars"),
        }),
        execute: ({ campaignId, newDailyBudgetDollars }) =>
          execAndLog(auth, campaignId, () => updateCampaignBudget(auth, campaignId, toMicros(newDailyBudgetDollars))),
      }),
      pauseCampaign: tool({
        description: "Pause an active campaign to stop all its ads. Returns a changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
        }),
        execute: ({ campaignId }) =>
          execAndLog(auth, campaignId, () => pauseCampaign(auth, campaignId)),
      }),
      enableCampaign: tool({
        description: "Re-enable a paused campaign to resume all its ads. Returns a changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
        }),
        execute: ({ campaignId }) =>
          execAndLog(auth, campaignId, () => enableCampaign(auth, campaignId)),
      }),

      // ─── Change History & Undo ────────────────────────────────
      getChanges: tool({
        description: "Get recent changes made via AdsAgent. Each change has a changeId for use with undoChange.",
        inputSchema: z.object({
          campaignId: z.string().optional().describe("Filter to a specific campaign"),
          limit: z.number().int().min(1).max(100).default(20),
        }),
        execute: async ({ campaignId, limit }) =>
          getChanges(auth.customerId, { limit, campaignId }),
      }),
      undoChange: tool({
        description: "Undo a previous write by changeId. Works within 7 days if entity hasn't been modified since.",
        inputSchema: z.object({
          changeId: z.number().int().positive(),
        }),
        execute: async ({ changeId }) => {
          const check = await getUndoableChange(auth.customerId, changeId);
          if ("error" in check) return { success: false, error: check.error };

          const { change } = check;
          const eid = change.entityId ?? "";
          const bv = change.beforeValue ?? "";
          let undoResult;

          switch (change.toolName) {
            case "update_budget":
              undoResult = await updateCampaignBudget(auth, eid, Number(bv), { maxBidChangePct: 1.0, maxBudgetChangePct: 1.0, maxKeywordPausePct: 1.0 });
              break;
            case "add_negative_keyword":
              undoResult = await removeNegativeKeyword(auth, change.campaignId ?? "", eid);
              break;
            case "remove_negative_keyword":
              undoResult = await addNegativeKeyword(auth, change.campaignId ?? "", eid);
              break;
            case "pause_campaign":
              undoResult = await enableCampaign(auth, eid);
              break;
            case "enable_campaign":
              undoResult = await pauseCampaign(auth, eid);
              break;
            default:
              return { success: false, error: `Cannot undo "${change.toolName}" from chat. Use the MCP undoChange tool for keyword operations.` };
          }

          if (undoResult.success) {
            await markRolledBack(changeId);
            await logChange(auth.customerId, auth.userId, change.campaignId ?? null, undoResult, `Undo of change #${changeId}`);
          }

          return { ...undoResult, undoneChangeId: changeId, originalAction: change.toolName };
        },
      }),
    },
  });
}

export type GoogleAdsAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createGoogleAdsAgent>
>;
