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
import { getChanges, logRead } from "@/lib/db/tracking";
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
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getAccountInfo(authForAccount(auth, accountId));
    void logRead(targetId, auth.userId, "get_account_info");
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
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await listCampaigns(authForAccount(auth, accountId), { limit, includeRemoved });
    void logRead(targetId, auth.userId, "list_campaigns");
    return jsonResult(result);
  });

  server.registerTool("getCampaignPerformance", {
    title: "Get Campaign Performance",
    description:
      "Get daily performance metrics and totals for a specific campaign. Supports flexible date ranges and period-over-period comparison. Use startDate/endDate for exact ranges (e.g., 'since we made changes on March 27'), or days for relative lookback. Enable comparePreviousPeriod to see % changes vs the prior period of equal length.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Google Ads campaign ID"),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Number of days to look back (1-365). Ignored when both startDate and endDate are provided."),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
        .optional()
        .describe("Start date in YYYY-MM-DD format. Use with endDate for exact date ranges."),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
        .optional()
        .describe("End date in YYYY-MM-DD format. Use with startDate for exact date ranges."),
      comparePreviousPeriod: z
        .boolean()
        .default(false)
        .describe("Compare with previous period of equal length. Returns % changes for all metrics."),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days, startDate, endDate, comparePreviousPeriod }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getCampaignPerformance(authForAccount(auth, accountId), campaignId, {
      days,
      startDate,
      endDate,
      comparePreviousPeriod,
    });
    void logRead(targetId, auth.userId, "get_campaign_performance", campaignId);
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
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getKeywords(authForAccount(auth, accountId), campaignId, days, limit);
    void logRead(targetId, auth.userId, "get_keywords", campaignId);
    return jsonResult(result);
  });

  server.registerTool("getNegativeKeywords", {
    title: "Get Negative Keywords",
    description:
      "List all negative keywords for a campaign. Use before adding negatives to avoid duplicates, or to audit existing exclusions.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Google Ads campaign ID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe("Max negative keywords to return (1-500)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getNegativeKeywords(authForAccount(auth, accountId), campaignId, limit);
    void logRead(targetId, auth.userId, "get_negative_keywords", campaignId);
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
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getSearchTermReport(authForAccount(auth, accountId), campaignId, days, limit);
    void logRead(targetId, auth.userId, "get_search_term_report", campaignId);
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
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await runSafeGaqlReport(authForAccount(auth, accountId), query);
    void logRead(targetId, auth.userId, "run_gaql_query");
    return jsonResult(result);
  });

  // ─── Tracking Templates ──────────────────────────────────────────

  server.registerTool("getTrackingTemplate", {
    title: "Get Tracking Template",
    description:
      "Get the current tracking template (URL suffix used for click tracking) at the account, campaign, ad group, or ad level. Returns null if no template is set at that level.",
    inputSchema: {
      accountId: accountIdParam,
      level: z
        .enum(["account", "campaign", "ad_group", "ad"])
        .describe("The level at which to read the tracking template"),
      entityId: z
        .string()
        .optional()
        .describe("Required for campaign (campaignId), ad_group (adGroupId), and ad (adId) levels. Not needed for account level."),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, level, entityId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getTrackingTemplate(authForAccount(auth, accountId), level, entityId);
    void logRead(targetId, auth.userId, "get_tracking_template");
    return jsonResult(result);
  });

  // ─── Ad Groups & Ads ────────────────────────────────────────────

  server.registerTool("listAdGroups", {
    title: "List Ad Groups",
    description:
      "List all ad groups in a campaign with performance metrics (impressions, clicks, cost, conversions). Use to understand campaign structure before creating or editing ads.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max ad groups to return (1-100)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await listAdGroups(authForAccount(auth, accountId), campaignId, limit);
    void logRead(targetId, auth.userId, "list_ad_groups", campaignId);
    return jsonResult(result);
  });

  server.registerTool("listAds", {
    title: "List Ads",
    description:
      "List all ads in a campaign (optionally filtered to one ad group). Returns RSA headlines, descriptions, final URLs, status, and performance metrics. Use to audit ad copy, find broken URLs, or identify ads to pause/edit.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      adGroupId: z
        .string()
        .optional()
        .describe("Filter to a specific ad group (optional)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max ads to return (1-100)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, limit }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await listAds(authForAccount(auth, accountId), campaignId, adGroupId, limit);
    void logRead(targetId, auth.userId, "list_ads", campaignId);
    return jsonResult(result);
  });

  // ─── Competitive Intelligence ────────────────────────────────────

  server.registerTool("getImpressionShare", {
    title: "Get Impression Share",
    description:
      "Get impression share metrics for a campaign: search IS, absolute top IS, top IS, budget-lost IS, and rank-lost IS. Use to understand competitive position and diagnose whether lost impressions are due to budget or Quality Score.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .default(30)
        .describe("Number of days to look back (1-90)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId, days }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getImpressionShare(authForAccount(auth, accountId), campaignId, days);
    void logRead(targetId, auth.userId, "get_impression_share", campaignId);
    return jsonResult(result);
  });

  // ─── Conversion Tracking ─────────────────────────────────────────

  server.registerTool("getConversionActions", {
    title: "Get Conversion Actions",
    description:
      "List all conversion actions in the account with their type, status, counting method, and value settings. Use to understand what conversions are tracked and their IDs before importing offline conversions or setting up campaigns.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getConversionActions(authForAccount(auth, accountId));
    void logRead(targetId, auth.userId, "get_conversion_actions");
    return jsonResult(result);
  });

  // ─── Account & Campaign Settings ────────────────────────────────

  server.registerTool("getAccountSettings", {
    title: "Get Account Settings",
    description:
      "Get account-level settings including auto-tagging status, tracking URL template, and conversion tracking IDs. Use to diagnose UTM tracking issues or verify auto-tagging is enabled.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getAccountSettings(authForAccount(auth, accountId));
    void logRead(targetId, auth.userId, "get_account_settings");
    return jsonResult(result);
  });

  server.registerTool("getCampaignSettings", {
    title: "Get Campaign Settings",
    description:
      "Get detailed campaign settings including bidding strategy, network targeting (Search Partners, Display), location targeting, and ad schedule. Use to audit campaign configuration or plan optimizations.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getCampaignSettings(authForAccount(auth, accountId), campaignId);
    void logRead(targetId, auth.userId, "get_campaign_settings", campaignId);
    return jsonResult(result);
  });

  // ─── Recommendations ─────────────────────────────────────────────

  server.registerTool("getRecommendations", {
    title: "Get Recommendations",
    description:
      "Get Google Ads optimization recommendations with estimated impact (impressions, clicks, conversions). Optionally filter to a specific campaign. Use to find optimization opportunities suggested by Google.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z
        .string()
        .optional()
        .describe("Filter to a specific campaign (optional)"),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ accountId, campaignId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await getRecommendations(authForAccount(auth, accountId), campaignId);
    void logRead(targetId, auth.userId, "get_recommendations", campaignId);
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
    void logRead(targetId, auth.userId, "get_changes");
    return jsonResult(result);
  });
};
