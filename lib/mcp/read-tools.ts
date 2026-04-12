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
  getResourceMetadata,
  listQueryableResources,
  searchGeoTargets,
  getPmaxAssetGroups,
  getPmaxAssets,
  getKeywordIdeas,
  type AuthContext,
} from "@/lib/google-ads";
import { getChanges } from "@/lib/db/tracking";
import { execRead } from "@/lib/tools/execute";
import { getEnv } from "@/lib/env";
import { jsonResult, safeHandler, accountIdParam, READ_ANNOTATIONS } from "./types";
import type { ToolRegistrar } from "./types";
import { resolveToolAuth } from "./helpers";

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
  }, safeHandler(async ({ accountId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_account_info", () => getAccountInfo(targetAuth));
    return jsonResult(result);
  }));

  // ─── Campaigns ──────────────────────────────────────────────────

  server.registerTool("listCampaigns", {
    description: "List all campaigns with lifetime metrics (impressions, clicks, cost, conversions).",
    inputSchema: {
      accountId: accountIdParam,
      limit: z.number().int().min(1).max(100).default(100),
      includeRemoved: z.boolean().default(false),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, limit, includeRemoved }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_campaigns", () => listCampaigns(targetAuth, { limit, includeRemoved }));
    return jsonResult(result);
  }));

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
  }, safeHandler(async ({ accountId, campaignId, days, startDate, endDate, comparePreviousPeriod }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_campaign_performance", () =>
      getCampaignPerformance(targetAuth, campaignId, { days, startDate, endDate, comparePreviousPeriod }),
    campaignId);
    return jsonResult(result);
  }));

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
  }, safeHandler(async ({ accountId, campaignId, days, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_keywords", () => getKeywords(targetAuth, campaignId, days, limit), campaignId);
    return jsonResult(result);
  }));

  server.registerTool("getNegativeKeywords", {
    description: "List negative keywords for a campaign. Check before adding new negatives to avoid duplicates.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      limit: z.number().int().min(1).max(500).default(100),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_negative_keywords", () => getNegativeKeywords(targetAuth, campaignId, limit), campaignId);
    return jsonResult(result);
  }));

  server.registerTool("getSearchTermReport", {
    description: "Actual search queries that triggered ads, ordered by cost. Use to find irrelevant terms to add as negative keywords.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      days: z.number().int().min(1).max(365).default(30),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, days, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_search_term_report", () => getSearchTermReport(targetAuth, campaignId, days, limit), campaignId);
    return jsonResult(result);
  }));

  // ─── Custom Query ───────────────────────────────────────────────

  server.registerTool("runGaqlQuery", {
    description:
      "Run a read-only GAQL SELECT query against the Google Ads API. Returns up to 50 rows. " +
      "GAQL tips: (1) Use getResourceMetadata to discover valid fields before querying — never guess field names. " +
      "(2) Dates must be literal YYYY-MM-DD strings (e.g. segments.date >= '2024-01-01'), no date functions or relative dates. " +
      "(3) The change_event resource requires LIMIT <= 10000. " +
      "(4) Customer IDs are plain numbers without hyphens. " +
      "(5) Use listQueryableResources to see all available resources.",
    inputSchema: {
      accountId: accountIdParam,
      query: z
        .string()
        .min(1)
        .describe("GAQL SELECT query (e.g. 'SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = 'ENABLED'')"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  }, safeHandler(async ({ accountId, query }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "run_gaql_query", () => runSafeGaqlReport(targetAuth, query));
    return jsonResult(result);
  }));

  // ─── Tracking Templates ──────────────────────────────────────────

  server.registerTool("getTrackingTemplate", {
    description: "Get the tracking template (click-tracking URL suffix) at the account, campaign, ad group, or ad level. Returns null if not set at that level.",
    inputSchema: {
      accountId: accountIdParam,
      level: z.enum(["account", "campaign", "ad_group", "ad"]),
      campaignId: z
        .string()
        .optional()
        .describe("The campaign ID. Required when level is 'campaign'."),
      adGroupId: z
        .string()
        .optional()
        .describe("The ad group ID. Required when level is 'ad_group'."),
      adId: z
        .string()
        .optional()
        .describe("The ad ID. Required when level is 'ad'."),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, level, campaignId, adGroupId, adId }) => {
    const entityId = level === "campaign" ? campaignId
      : level === "ad_group" ? adGroupId
      : level === "ad" ? adId
      : undefined;
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_tracking_template", () => getTrackingTemplate(targetAuth, level, entityId));
    return jsonResult(result);
  }));

  // ─── Ad Groups & Ads ────────────────────────────────────────────

  server.registerTool("listAdGroups", {
    description: "List ad groups in a campaign with performance metrics (impressions, clicks, cost, conversions).",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_ad_groups", () => listAdGroups(targetAuth, campaignId, limit), campaignId);
    return jsonResult(result);
  }));

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
  }, safeHandler(async ({ accountId, campaignId, adGroupId, days, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_ads", () => listAds(targetAuth, campaignId, adGroupId, days, limit), campaignId);
    return jsonResult(result);
  }));

  // ─── Competitive Intelligence ────────────────────────────────────

  server.registerTool("getImpressionShare", {
    description: "Impression share metrics for a campaign: search IS, absolute top IS, top IS, budget-lost IS, and rank-lost IS. Max 90 days (unlike most tools which support 365).",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      days: z.number().int().min(1).max(90).default(30),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, days }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_impression_share", () => getImpressionShare(targetAuth, campaignId, days), campaignId);
    return jsonResult(result);
  }));

  // ─── Conversion Tracking ─────────────────────────────────────────

  server.registerTool("getConversionActions", {
    description: "List conversion actions with type, status, counting method, and value settings.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_conversion_actions", () => getConversionActions(targetAuth));
    return jsonResult(result);
  }));

  // ─── Account & Campaign Settings ────────────────────────────────

  server.registerTool("getAccountSettings", {
    description: "Account-level settings: auto-tagging status, tracking URL template, and conversion tracking IDs.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_account_settings", () => getAccountSettings(targetAuth));
    return jsonResult(result);
  }));

  server.registerTool("getCampaignSettings", {
    description: "Campaign configuration: bidding strategy, network targeting (Search Partners, Display), location targeting, and ad schedule.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_campaign_settings", () => getCampaignSettings(targetAuth, campaignId), campaignId);
    return jsonResult(result);
  }));

  // ─── Geo Target Search ──────────────────────────────────────────

  server.registerTool("searchGeoTargets", {
    description:
      "Search for geo target locations by name (cities, counties, states, countries). " +
      "Returns geo target constant IDs that can be used with updateCampaignSettings locationTargeting and negativeLocationTargeting. " +
      "Example: search 'Kitsap County' to get its ID, then pass that ID to updateCampaignSettings to target or exclude it.",
    inputSchema: {
      accountId: accountIdParam,
      query: z
        .string()
        .min(1)
        .max(200)
        .describe("Location name to search for (e.g. 'Kitsap County', 'Seattle', 'Washington', 'United States')"),
      countryCode: z
        .string()
        .length(2)
        .optional()
        .describe("ISO 3166-1 alpha-2 country code to narrow results (e.g. 'US', 'CA', 'GB')"),
      locale: z
        .string()
        .max(10)
        .optional()
        .describe("Locale for results (default: 'en')"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, query, countryCode, locale }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "search_geo_targets", () => searchGeoTargets(targetAuth, query, countryCode, locale));
    return jsonResult(result);
  }));

  // ─── Recommendations ─────────────────────────────────────────────

  server.registerTool("getRecommendations", {
    description: "Google Ads optimization recommendations with estimated impact (impressions, clicks, conversions). Optionally filter to a specific campaign.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional(),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_recommendations", () => getRecommendations(targetAuth, campaignId), campaignId);
    return jsonResult(result);
  }));

  // ─── Change History ───────────────────────────────────────────

  server.registerTool("getChanges", {
    description: "Recent changes made to the account via AdsAgent. Each change has a changeId usable with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_changes", () => getChanges(targetId, { limit, campaignId }));
    return jsonResult(result);
  }));

  // ─── Field & Resource Discovery ─────────────────────────────────────

  server.registerTool("getResourceMetadata", {
    description:
      "Discover available fields for a GAQL resource. Returns selectable, filterable, and sortable fields with data types. Use this before constructing GAQL queries to avoid invalid field errors. Example: getResourceMetadata('campaign') returns all campaign.* fields.",
    inputSchema: {
      accountId: accountIdParam,
      resourceName: z
        .string()
        .min(1)
        .describe("The GAQL resource name (e.g. 'campaign', 'ad_group', 'keyword_view', 'search_term_view')"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, resourceName }) => {
    const { targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await getResourceMetadata(targetAuth, resourceName);
    return jsonResult(result);
  }));

  server.registerTool("listQueryableResources", {
    description:
      "List all queryable GAQL resources (e.g. campaign, ad_group, keyword_view). Use this to discover what data is available for custom GAQL queries.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await listQueryableResources(targetAuth);
    return jsonResult(result);
  }));

  // ─── Performance Max ─────────────────────────────────────────────

  server.registerTool("getPmaxAssetGroups", {
    description:
      "List all asset groups in a Performance Max campaign. Asset groups are the PMAX equivalent of ad groups — each contains the creative assets (headlines, descriptions, images, videos) Google uses to build ads across all eligible placements. Returns asset group IDs, names, statuses, and final URLs.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Performance Max campaign ID"),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_pmax_asset_groups", () => getPmaxAssetGroups(targetAuth, campaignId, limit), campaignId);
    return jsonResult(result);
  }));

  server.registerTool("getPmaxAssets", {
    description:
      "List all assets in a Performance Max asset group, grouped by field type. Returns text assets (HEADLINE, LONG_HEADLINE, DESCRIPTION, BUSINESS_NAME), image assets (MARKETING_IMAGE, SQUARE_MARKETING_IMAGE, LOGO), video assets (YOUTUBE_VIDEO), and CALL_TO_ACTION. Use getPmaxAssetGroups first to get asset group IDs.",
    inputSchema: {
      accountId: accountIdParam,
      assetGroupId: z.string().describe("Asset group ID (from getPmaxAssetGroups)"),
      limit: z.number().int().min(1).max(200).default(100),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, assetGroupId, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_pmax_assets", () => getPmaxAssets(targetAuth, assetGroupId, limit));
    return jsonResult(result);
  }));

  // ─── Keyword Research ───────────────────────────────────────────

  server.registerTool("getKeywordIdeas", {
    description:
      "Get keyword ideas with real search volume, competition, and CPC data from Google Ads Keyword Planner. " +
      "Provide seed keywords and/or a URL to discover new keyword opportunities. " +
      "Returns avg monthly searches, competition level, average CPC, and top-of-page bid estimates. " +
      "No Google Ads account connection required — works for all users. " +
      "Use searchGeoTargets first to find geo target IDs for location targeting.",
    inputSchema: {
      keywords: z.array(z.string()).min(1).describe("Seed keywords to generate ideas from"),
      url: z.string().optional().describe("Page URL to generate ideas from (combines with keywords if both provided)"),
      language: z.string().optional().describe("Language constant ID (default: 1000 for English). Example: 1000=English, 1003=Spanish, 1001=French"),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs for location targeting (e.g. ['2840'] for US). Use searchGeoTargets to find IDs."),
      pageSize: z.number().int().min(1).max(50).default(20).describe("Number of keyword ideas to return (max 50)"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ keywords, url, language, geoTargetIds, pageSize }) => {
    const refreshToken = getEnv("KEYWORD_API_REFRESH_TOKEN");
    const customerId = getEnv("KEYWORD_API_CUSTOMER_ID");
    if (!refreshToken || !customerId) {
      throw new Error("Keyword research is not configured. Platform credentials missing.");
    }
    const platformAuth: AuthContext = { refreshToken, customerId };
    // Use caller's auth for rate limiting and logging, platform auth for the API call
    const callerAuth = currentAuth();
    const result = await execRead(callerAuth, callerAuth.customerId, "get_keyword_ideas", () =>
      getKeywordIdeas(platformAuth, keywords, url, language, geoTargetIds, pageSize),
    );
    return jsonResult(result);
  }));
};
