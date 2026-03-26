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
  authForAccount,
} from "@/lib/google-ads";
import { jsonResult, accountIdParam, WRITE_ANNOTATIONS } from "./types";
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
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      adGroupId: z.string().describe("Ad group ID containing the keyword"),
      criterionId: z.string().describe("Keyword criterion ID to pause"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, criterionId }) => {
    const result = await pauseKeyword(authForAccount(currentAuth(), accountId), campaignId, adGroupId, criterionId);
    return jsonResult(result);
  });

  server.registerTool("enableKeyword", {
    title: "Enable Keyword",
    description:
      "Re-enable a previously paused keyword so it can trigger ads again.",
    inputSchema: {
      accountId: accountIdParam,
      adGroupId: z.string().describe("Ad group ID"),
      criterionId: z.string().describe("Keyword criterion ID to enable"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, adGroupId, criterionId }) => {
    const result = await enableKeyword(authForAccount(currentAuth(), accountId), adGroupId, criterionId);
    return jsonResult(result);
  });

  // ─── Bid Management ─────────────────────────────────────────────

  server.registerTool("updateBid", {
    title: "Update Keyword Bid",
    description:
      "Change the CPC bid for a keyword. Only works with MANUAL_CPC or ENHANCED_CPC bidding strategies. Bid change is limited to 25% per adjustment.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      adGroupId: z.string().describe("Ad group ID"),
      criterionId: z.string().describe("Keyword criterion ID"),
      newBidDollars: z
        .number()
        .positive()
        .describe("New bid amount in dollars (e.g. 1.50)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, criterionId, newBidDollars }) => {
    const result = await updateBid(
      authForAccount(currentAuth(), accountId),
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
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      keywordText: z
        .string()
        .min(1)
        .describe("Keyword text to add as negative (phrase match)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, keywordText }) => {
    const result = await addNegativeKeyword(authForAccount(currentAuth(), accountId), campaignId, keywordText);
    return jsonResult(result);
  });

  // ─── Budget Management ──────────────────────────────────────────

  server.registerTool("updateCampaignBudget", {
    title: "Update Campaign Budget",
    description:
      "Change the daily budget for a campaign. Budget change is limited to 50% per adjustment with a minimum of $1/day.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      newDailyBudgetDollars: z
        .number()
        .positive()
        .describe("New daily budget in dollars (e.g. 25.00)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, newDailyBudgetDollars }) => {
    const result = await updateCampaignBudget(
      authForAccount(currentAuth(), accountId),
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
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID to pause"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ accountId, campaignId }) => {
    const result = await pauseCampaign(authForAccount(currentAuth(), accountId), campaignId);
    return jsonResult(result);
  });

  server.registerTool("enableCampaign", {
    title: "Enable Campaign",
    description:
      "Re-enable a paused campaign to resume all ads.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID to enable"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId }) => {
    const result = await enableCampaign(authForAccount(currentAuth(), accountId), campaignId);
    return jsonResult(result);
  });
};
