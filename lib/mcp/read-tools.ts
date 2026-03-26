import { z } from "zod";
import {
  getAccountInfo,
  listCampaigns,
  getCampaignPerformance,
  getKeywords,
  getSearchTermReport,
  runSafeGaqlReport,
} from "@/lib/google-ads";
import { jsonResult } from "./types";
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async () => {
    const result = await getAccountInfo(currentAuth());
    return jsonResult(result);
  });

  // ─── Campaigns ──────────────────────────────────────────────────

  server.registerTool("listCampaigns", {
    title: "List Campaigns",
    description:
      "List all campaigns with lifetime metrics (impressions, clicks, cost, conversions). Use to get an overview of account performance.",
    inputSchema: {
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ limit, includeRemoved }) => {
    const result = await listCampaigns(currentAuth(), { limit, includeRemoved });
    return jsonResult(result);
  });

  server.registerTool("getCampaignPerformance", {
    title: "Get Campaign Performance",
    description:
      "Get daily performance metrics and totals for a specific campaign over a date range. Includes impressions, clicks, cost, conversions, CPA, and ROAS.",
    inputSchema: {
      campaignId: z.string().describe("Google Ads campaign ID"),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Number of days to look back (1-365)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ campaignId, days }) => {
    const result = await getCampaignPerformance(currentAuth(), campaignId, days);
    return jsonResult(result);
  });

  // ─── Keywords & Search Terms ────────────────────────────────────

  server.registerTool("getKeywords", {
    title: "Get Keywords",
    description:
      "Get top keywords for a campaign with metrics: impressions, clicks, CTR, CPC, quality score, and conversions.",
    inputSchema: {
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ campaignId, days, limit }) => {
    const result = await getKeywords(currentAuth(), campaignId, days, limit);
    return jsonResult(result);
  });

  server.registerTool("getSearchTermReport", {
    title: "Get Search Terms",
    description:
      "Get actual search queries that triggered your ads, ordered by cost. Use to find irrelevant terms to add as negative keywords.",
    inputSchema: {
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ campaignId, days, limit }) => {
    const result = await getSearchTermReport(currentAuth(), campaignId, days, limit);
    return jsonResult(result);
  });

  // ─── Custom Query ───────────────────────────────────────────────

  server.registerTool("runGaqlQuery", {
    title: "Run GAQL Query",
    description:
      "Run a custom read-only Google Ads Query Language (GAQL) query. Only SELECT statements are allowed. Returns up to 50 rows.",
    inputSchema: {
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
  }, async ({ query }) => {
    const result = await runSafeGaqlReport(currentAuth(), query);
    return jsonResult(result);
  });
};
