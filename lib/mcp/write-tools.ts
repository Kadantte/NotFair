import { z } from "zod";
import {
  pauseKeyword,
  enableKeyword,
  updateBid,
  addNegativeKeyword,
  updateCampaignBudget,
  pauseCampaign,
  enableCampaign,
  toMicros,
} from "@/lib/google-ads";
import { jsonResult } from "./types";
import type { ToolRegistrar } from "./types";

/**
 * Write tools that mutate Google Ads account state.
 * All tools include guardrails to prevent excessive changes.
 */
export const registerWriteTools: ToolRegistrar = (server, currentAuth) => {
  // ─── Keyword Management ─────────────────────────────────────────

  server.registerTool("pauseKeyword", {
    title: "Pause Keyword",
    description:
      "Pause an active keyword to stop it from triggering ads. Use when a keyword is wasting spend with poor or no conversions.",
    inputSchema: {
      campaignId: z.string().describe("Campaign ID"),
      adGroupId: z.string().describe("Ad group ID containing the keyword"),
      criterionId: z.string().describe("Keyword criterion ID to pause"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ campaignId, adGroupId, criterionId }) => {
    const result = await pauseKeyword(currentAuth(), campaignId, adGroupId, criterionId);
    return jsonResult(result);
  });

  server.registerTool("enableKeyword", {
    title: "Enable Keyword",
    description:
      "Re-enable a previously paused keyword so it can trigger ads again.",
    inputSchema: {
      adGroupId: z.string().describe("Ad group ID"),
      criterionId: z.string().describe("Keyword criterion ID to enable"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ adGroupId, criterionId }) => {
    const result = await enableKeyword(currentAuth(), adGroupId, criterionId);
    return jsonResult(result);
  });

  // ─── Bid Management ─────────────────────────────────────────────

  server.registerTool("updateBid", {
    title: "Update Keyword Bid",
    description:
      "Change the CPC bid for a keyword. Only works with MANUAL_CPC or ENHANCED_CPC bidding strategies. Bid change is limited to 25% per adjustment.",
    inputSchema: {
      campaignId: z.string().describe("Campaign ID"),
      adGroupId: z.string().describe("Ad group ID"),
      criterionId: z.string().describe("Keyword criterion ID"),
      newBidDollars: z
        .number()
        .positive()
        .describe("New bid amount in dollars (e.g. 1.50)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ campaignId, adGroupId, criterionId, newBidDollars }) => {
    const result = await updateBid(
      currentAuth(),
      campaignId,
      adGroupId,
      criterionId,
      toMicros(newBidDollars),
    );
    return jsonResult(result);
  });

  // ─── Negative Keywords ──────────────────────────────────────────

  server.registerTool("addNegativeKeyword", {
    title: "Add Negative Keyword",
    description:
      "Add a negative keyword (phrase match) to a campaign to block irrelevant search terms from triggering your ads.",
    inputSchema: {
      campaignId: z.string().describe("Campaign ID"),
      keywordText: z
        .string()
        .min(1)
        .describe("Keyword text to add as negative (phrase match)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ campaignId, keywordText }) => {
    const result = await addNegativeKeyword(currentAuth(), campaignId, keywordText);
    return jsonResult(result);
  });

  // ─── Budget Management ──────────────────────────────────────────

  server.registerTool("updateCampaignBudget", {
    title: "Update Campaign Budget",
    description:
      "Change the daily budget for a campaign. Budget change is limited to 50% per adjustment with a minimum of $1/day.",
    inputSchema: {
      campaignId: z.string().describe("Campaign ID"),
      newDailyBudgetDollars: z
        .number()
        .positive()
        .describe("New daily budget in dollars (e.g. 25.00)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ campaignId, newDailyBudgetDollars }) => {
    const result = await updateCampaignBudget(
      currentAuth(),
      campaignId,
      toMicros(newDailyBudgetDollars),
    );
    return jsonResult(result);
  });

  // ─── Campaign Status ────────────────────────────────────────────

  server.registerTool("pauseCampaign", {
    title: "Pause Campaign",
    description:
      "Pause an active campaign to stop all ads in the campaign from running.",
    inputSchema: {
      campaignId: z.string().describe("Campaign ID to pause"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ campaignId }) => {
    const result = await pauseCampaign(currentAuth(), campaignId);
    return jsonResult(result);
  });

  server.registerTool("enableCampaign", {
    title: "Enable Campaign",
    description:
      "Re-enable a paused campaign to resume all ads.",
    inputSchema: {
      campaignId: z.string().describe("Campaign ID to enable"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ campaignId }) => {
    const result = await enableCampaign(currentAuth(), campaignId);
    return jsonResult(result);
  });
};
