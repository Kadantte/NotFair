import { InferAgentUIMessage, stepCountIs, ToolLoopAgent, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  getCampaignKeywords,
  getCampaignPerformance,
  getCustomerOverview,
  listAccessibleCustomers,
  listCampaigns,
  runSafeGaqlReport,
} from "@/lib/google-ads-chat";

type AgentAuth = {
  refreshToken: string;
  customerId: string;
};

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
- The current toolset is read-only. If the user asks to create, edit, pause, or remove Google Ads entities, explain that execution is not wired yet and provide the exact change plan you would apply.
- Never invent campaign performance. If data is missing, say so.
- Prefer concise answers unless the user explicitly asks for a deeper audit.`,
    tools: {
      getConnectedAccount: tool({
        description: "Get the currently connected Google Ads customer context.",
        inputSchema: z.object({}),
        execute: async () => getCustomerOverview(auth),
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
          getCampaignKeywords(auth, campaignId, days, limit),
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
    },
  });
}

export type GoogleAdsAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createGoogleAdsAgent>
>;
