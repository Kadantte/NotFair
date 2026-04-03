import { z } from "zod";
import {
  getAccountInfo,
  listCampaigns,
  getCampaignPerformance,
  getKeywords,
  getSearchTermReport,
  runSafeGaqlReport,
  getTrackingTemplate,
  listAdGroups,
  listAds,
  getImpressionShare,
  getConversionActions,
  getAccountSettings,
  getCampaignSettings,
  getRecommendations,
  getNegativeKeywords,
  authForAccount,
  resolveAccountId,
} from "@/lib/google-ads";
import { getChanges } from "@/lib/db/tracking";
import { execRead } from "@/lib/tools/execute";
import { jsonResult, accountIdParam, READ_ANNOTATIONS } from "./types";
import type { ToolRegistrar } from "./types";

/**
 * Read-only tools for querying Google Ads data.
 * These tools never modify account state.
 */
export const registerReadTools: ToolRegistrar = (server, currentAuth) => {
  // ─── Account ────────────────────────────────────────────────────

  server.registerTool("getAccountInfo", {
    description: "Get connected Google Ads account details: name, currency, timezone, and test account status.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_account_info", () => getAccountInfo(authForAccount(auth, accountId)));
    return jsonResult(result);
  });

  // ─── Campaigns ──────────────────────────────────────────────────

  server.registerTool("listCampaigns", {
    description: "List all campaigns with lifetime metrics (impressions, clicks, cost, conversions).",
    inputSchema: {
      accountId: accountIdParam,
      limit: z.number().int().min(1).max(100).default(20),
      includeRemoved: z.boolean().default(false),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, limit, includeRemoved }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "list_campaigns", () => listCampaigns(authForAccount(auth, accountId), { limit, includeRemoved }));
    return jsonResult(result);
  });

  server.registerTool("getCampaignPerformance", {
    description:
      "Daily performance metrics for a campaign. Use startDate+endDate for exact date ranges or days for relative lookback; set comparePreviousPeriod to see % changes vs the prior period of equal length.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Lookback days; ignored when startDate+endDate are provided"),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
        .optional()
        .describe("YYYY-MM-DD; use with endDate for exact date ranges"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
        .optional()
        .describe("YYYY-MM-DD; use with startDate for exact date ranges"),
      comparePreviousPeriod: z.boolean().default(false),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days, startDate, endDate, comparePreviousPeriod }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_campaign_performance", () =>
      getCampaignPerformance(authForAccount(auth, accountId), campaignId, { days, startDate, endDate, comparePreviousPeriod }),
    campaignId);
    return jsonResult(result);
  });

  // ─── Keywords & Search Terms ────────────────────────────────────

  server.registerTool("getKeywords", {
    description: "Top keywords for a campaign with metrics: impressions, clicks, CTR, CPC, quality score, and conversions.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      days: z.number().int().min(1).max(365).default(30),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_keywords", () => getKeywords(authForAccount(auth, accountId), campaignId, days, limit), campaignId);
    return jsonResult(result);
  });

  server.registerTool("getNegativeKeywords", {
    description: "List negative keywords for a campaign. Check before adding new negatives to avoid duplicates.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      limit: z.number().int().min(1).max(500).default(100),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_negative_keywords", () => getNegativeKeywords(authForAccount(auth, accountId), campaignId, limit), campaignId);
    return jsonResult(result);
  });

  server.registerTool("getSearchTermReport", {
    description: "Actual search queries that triggered ads, ordered by cost. Use to find irrelevant terms to add as negative keywords.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      days: z.number().int().min(1).max(365).default(30),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_search_term_report", () => getSearchTermReport(authForAccount(auth, accountId), campaignId, days, limit), campaignId);
    return jsonResult(result);
  });

  // ─── Custom Query ───────────────────────────────────────────────

  server.registerTool("runGaqlQuery", {
    description: "Run a read-only GAQL SELECT query. Returns up to 50 rows.",
    inputSchema: {
      accountId: accountIdParam,
      query: z
        .string()
        .min(1)
        .describe("GAQL SELECT query (e.g. 'SELECT campaign.id, campaign.name FROM campaign')"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  }, async ({ accountId, query }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "run_gaql_query", () => runSafeGaqlReport(authForAccount(auth, accountId), query));
    return jsonResult(result);
  });

  // ─── Tracking Templates ──────────────────────────────────────────

  server.registerTool("getTrackingTemplate", {
    description: "Get the tracking template (click-tracking URL suffix) at the account, campaign, ad group, or ad level. Returns null if not set at that level.",
    inputSchema: {
      accountId: accountIdParam,
      level: z.enum(["account", "campaign", "ad_group", "ad"]),
      entityId: z
        .string()
        .optional()
        .describe("Required for campaign, ad_group, and ad levels; omit for account level"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, level, entityId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_tracking_template", () => getTrackingTemplate(authForAccount(auth, accountId), level, entityId));
    return jsonResult(result);
  });

  // ─── Ad Groups & Ads ────────────────────────────────────────────

  server.registerTool("listAdGroups", {
    description: "List ad groups in a campaign with performance metrics (impressions, clicks, cost, conversions).",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "list_ad_groups", () => listAdGroups(authForAccount(auth, accountId), campaignId, limit), campaignId);
    return jsonResult(result);
  });

  server.registerTool("listAds", {
    description: "List ads in a campaign with RSA headlines, descriptions, final URLs, status, and performance metrics for a given date range. Optionally filter to one ad group.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string().optional(),
      days: z.number().int().min(1).max(365).default(30),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, days, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "list_ads", () => listAds(authForAccount(auth, accountId), campaignId, adGroupId, days, limit), campaignId);
    return jsonResult(result);
  });

  // ─── Competitive Intelligence ────────────────────────────────────

  server.registerTool("getImpressionShare", {
    description: "Impression share metrics for a campaign: search IS, absolute top IS, top IS, budget-lost IS, and rank-lost IS.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      days: z.number().int().min(1).max(90).default(30),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_impression_share", () => getImpressionShare(authForAccount(auth, accountId), campaignId, days), campaignId);
    return jsonResult(result);
  });

  // ─── Conversion Tracking ─────────────────────────────────────────

  server.registerTool("getConversionActions", {
    description: "List conversion actions with type, status, counting method, and value settings.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_conversion_actions", () => getConversionActions(authForAccount(auth, accountId)));
    return jsonResult(result);
  });

  // ─── Account & Campaign Settings ────────────────────────────────

  server.registerTool("getAccountSettings", {
    description: "Account-level settings: auto-tagging status, tracking URL template, and conversion tracking IDs.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_account_settings", () => getAccountSettings(authForAccount(auth, accountId)));
    return jsonResult(result);
  });

  server.registerTool("getCampaignSettings", {
    description: "Campaign configuration: bidding strategy, network targeting (Search Partners, Display), location targeting, and ad schedule.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_campaign_settings", () => getCampaignSettings(authForAccount(auth, accountId), campaignId), campaignId);
    return jsonResult(result);
  });

  // ─── Recommendations ─────────────────────────────────────────────

  server.registerTool("getRecommendations", {
    description: "Google Ads optimization recommendations with estimated impact (impressions, clicks, conversions). Optionally filter to a specific campaign.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional(),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_recommendations", () => getRecommendations(authForAccount(auth, accountId), campaignId), campaignId);
    return jsonResult(result);
  });

  // ─── Change History ───────────────────────────────────────────

  server.registerTool("getChanges", {
    description: "Recent changes made to the account via AdsAgent. Each change has a changeId usable with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await execRead(auth, targetId, "get_changes", () => getChanges(targetId, { limit, campaignId }));
    return jsonResult(result);
  });
};
