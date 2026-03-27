import { z } from "zod";
import {
  getAccountInfo,
  listCampaigns,
  getCampaignPerformance,
  getKeywords,
  getSearchTermReport,
  runSafeGaqlReport,
  authForAccount,
  resolveAccountId,
} from "@/lib/google-ads";
import { getChanges } from "@/lib/db/tracking";
import { jsonResult, accountIdParam, READ_ANNOTATIONS } from "./types";
import type { ToolRegistrar } from "./types";

/**
 * Read-only tools for querying Google Ads data.
 * These tools never modify account state.
 */
export const registerReadTools: ToolRegistrar = (server, currentAuth) => {
  // ─── Account ────────────────────────────────────────────────────

  server.registerTool("getAccountInfo", {
    title: "Get Account Info",
    description:
      "Get the connected Google Ads account details including name, currency, timezone, and test account status.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId }) => {
    const result = await getAccountInfo(authForAccount(currentAuth(), accountId));
    return jsonResult(result);
  });

  // ─── Campaigns ──────────────────────────────────────────────────

  server.registerTool("listCampaigns", {
    title: "List Campaigns",
    description:
      "List all campaigns with lifetime metrics (impressions, clicks, cost, conversions). Use to get an overview of account performance.",
    inputSchema: {
      accountId: accountIdParam,
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Max campaigns to return (1-100)"),
      includeRemoved: z
        .boolean()
        .default(false)
        .describe("Include removed campaigns"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, limit, includeRemoved }) => {
    const result = await listCampaigns(authForAccount(currentAuth(), accountId), { limit, includeRemoved });
    return jsonResult(result);
  });

  server.registerTool("getCampaignPerformance", {
    title: "Get Campaign Performance",
    description:
      "Get daily performance metrics and totals for a specific campaign over a date range. Includes impressions, clicks, cost, conversions, CPA, and ROAS.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Google Ads campaign ID"),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Number of days to look back (1-365)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days }) => {
    const result = await getCampaignPerformance(authForAccount(currentAuth(), accountId), campaignId, days);
    return jsonResult(result);
  });

  // ─── Keywords & Search Terms ────────────────────────────────────

  server.registerTool("getKeywords", {
    title: "Get Keywords",
    description:
      "Get top keywords for a campaign with metrics: impressions, clicks, CTR, CPC, quality score, and conversions.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Google Ads campaign ID"),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Number of days to look back (1-365)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max keywords to return (1-100)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days, limit }) => {
    const result = await getKeywords(authForAccount(currentAuth(), accountId), campaignId, days, limit);
    return jsonResult(result);
  });

  server.registerTool("getSearchTermReport", {
    title: "Get Search Terms",
    description:
      "Get actual search queries that triggered your ads, ordered by cost. Use to find irrelevant terms to add as negative keywords.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Google Ads campaign ID"),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Number of days to look back (1-365)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max search terms to return (1-100)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days, limit }) => {
    const result = await getSearchTermReport(authForAccount(currentAuth(), accountId), campaignId, days, limit);
    return jsonResult(result);
  });

  // ─── Custom Query ───────────────────────────────────────────────

  server.registerTool("runGaqlQuery", {
    title: "Run GAQL Query",
    description:
      "Run a custom read-only Google Ads Query Language (GAQL) query. Only SELECT statements are allowed. Returns up to 50 rows.",
    inputSchema: {
      accountId: accountIdParam,
      query: z
        .string()
        .min(1)
        .describe("A read-only GAQL SELECT query (e.g. 'SELECT campaign.id, campaign.name FROM campaign')"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  }, async ({ accountId, query }) => {
    const result = await runSafeGaqlReport(authForAccount(currentAuth(), accountId), query);
    return jsonResult(result);
  });

  // ─── Change History ───────────────────────────────────────────

  server.registerTool("getChanges", {
    title: "Get Change History",
    description:
      "Get recent changes made to the account via AdsAgent (bid updates, keyword pauses, budget changes, etc). Each change has a changeId that can be used with undoChange to reverse it.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z
        .string()
        .optional()
        .describe("Filter changes to a specific campaign"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Max changes to return (1-100)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getChanges(targetId, { limit, campaignId });
    return jsonResult(result);
  });
};
