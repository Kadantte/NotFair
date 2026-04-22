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
  getPaidVsOrganicAnalysis,
  getResourceMetadata,
  listQueryableResources,
  searchGeoTargets,
  getPmaxAssetGroups,
  getPmaxAssets,
  getKeywordIdeas,
  listCalloutAssets,
  listBiddingStrategies,
  getBiddingStrategyPerformance,
  listNegativeKeywordLists,
  getNegativeKeywordListItems,
  type AuthContext,
} from "@/lib/google-ads";
import { runAudit } from "@/lib/google-ads/audit";
import { getChanges, reviewChangeImpact } from "@/lib/db/tracking";
import { MIN_AFTER_DAYS_FOR_DIRECTION } from "@/lib/db/impact";
import { execRead } from "@/lib/tools/execute";
import { getEnv } from "@/lib/env";
import { typedResult, safeHandler, accountIdParam, READ_ANNOTATIONS } from "./types";
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
  }));

  // ─── Custom Query ───────────────────────────────────────────────

  server.registerTool("runGaqlQuery", {
    description:
      "Run a read-only GAQL SELECT query against the Google Ads API. " +
      "Returns up to `limit` rows (default 200, max 2000) plus truncation metadata: " +
      "`truncated`, `truncationReason` (\"row_limit\" or \"byte_budget\"), `fetchedRowCount`, and — when truncated — " +
      "a `summary` with SUM of metric columns + top/bottom 5 by cost computed over the full fetched set, " +
      "plus a `continuationHint` suggesting how to narrow the query. " +
      "Use the summary for decision-making when raw rows are truncated — don't assume the returned rows are complete. " +
      "GAQL tips: (1) Use getResourceMetadata to discover valid fields — never guess field names. " +
      "(2) Dates must be literal YYYY-MM-DD strings (e.g. segments.date >= '2024-01-01') or range macros (DURING LAST_30_DAYS). " +
      "(3) An explicit `LIMIT N` in the query overrides the `limit` param (capped at 2000 regardless). " +
      "(4) Customer IDs are plain numbers without hyphens. " +
      "(5) Use listQueryableResources to see all available resources.",
    inputSchema: {
      accountId: accountIdParam,
      query: z
        .string()
        .min(1)
        .describe("GAQL SELECT query (e.g. 'SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = 'ENABLED'')"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .default(200)
        .describe("Max rows returned (1-2000, default 200). Overridden by an explicit `LIMIT N` in the query."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  }, safeHandler(async ({ accountId, query, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "run_gaql_query", () => runSafeGaqlReport(targetAuth, query, limit));
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
  }));

  server.registerTool("reviewChangeImpact", {
    description:
      `Estimate correlational impact of every successful change in the last \`days\` using daily campaign snapshots (captured by cron). For each change: compares 7-day daily averages BEFORE vs AFTER the change date on the affected campaign, classifies direction (improved/worsened/neutral/unknown), and returns cost/conversion/CPA deltas plus \`otherChangesInWindow\` so you can spot confounders (other writes in the 14-day envelope). Response includes per-action counts and a campaign-deduped aggregate sum — use this instead of stitching getChanges + getCampaignPerformance by hand. Ideal for weekly or ad-hoc impact reviews. Caveats: impact is correlational (seasonality, competitor bids, Google's algorithm also move numbers); changes <${MIN_AFTER_DAYS_FOR_DIRECTION} days old are typically 'tooNew' because the snapshot cron lags a day; keyword/ad changes attribute to the containing campaign (campaign-level granularity only); window boundaries are UTC.`,
    inputSchema: {
      accountId: accountIdParam,
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .default(7)
        .describe("Lookback window in days. Default 7 (weekly review); max 90."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe("Max changes to attribute. Default 50; max 200."),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, days, limit }) => {
    const { auth, targetId } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "review_change_impact", () =>
      reviewChangeImpact(targetId, { days, limit }),
    );
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
  }));

  // ─── Callout Extensions (RMF C.75) ───────────────────────────────

  server.registerTool("listCalloutAssets", {
    description: "List all callout extension assets on the account, with whether each one is linked at the customer (account) level. Returns assetId, text, and link state.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_callout_assets", () => listCalloutAssets(targetAuth));
    return typedResult(result);
  }));

  // ─── Portfolio Bidding Strategies (RMF C.96/97, M.96/97, R.130) ──

  server.registerTool("listBiddingStrategies", {
    description: "List all portfolio (shared) bidding strategies on the account. Returns id, name, type, status, target CPA / ROAS, and how many campaigns link to each.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_bidding_strategies", () => listBiddingStrategies(targetAuth));
    return typedResult(result);
  }));

  server.registerTool("getBiddingStrategyPerformance", {
    description: "Performance report for portfolio bidding strategies (RMF R.130). Returns clicks, cost_micros, impressions, average_cpc, conversions, and cost_per_conversion aggregated over the selected date range, plus strategy type and status.",
    inputSchema: {
      accountId: accountIdParam,
      days: z.number().int().min(1).max(365).default(30).describe("Lookback days"),
      includeRemoved: z.boolean().default(false).describe("Include REMOVED strategies in the report"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, days, includeRemoved }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_bidding_strategy_performance", () =>
      getBiddingStrategyPerformance(targetAuth, { days, includeRemoved }),
    );
    return typedResult(result);
  }));

  // ─── Negative Keyword Lists (Shared Sets) ──────────────────────────

  server.registerTool("listNegativeKeywordLists", {
    description: "List all shared negative keyword lists in the account. Shows list name, keyword count, and which campaigns each list is linked to. Use these lists to manage negatives across multiple campaigns at once.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_negative_keyword_lists", () => listNegativeKeywordLists(targetAuth));
    return typedResult(result);
  }));

  server.registerTool("getNegativeKeywordListItems", {
    description: "List all keywords inside a shared negative keyword list. Use listNegativeKeywordLists first to get the sharedSetId.",
    inputSchema: {
      accountId: accountIdParam,
      sharedSetId: z.string().describe("Shared set ID (from listNegativeKeywordLists)"),
      limit: z.number().int().min(1).max(1000).default(200),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, sharedSetId, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_negative_keyword_list_items", () => getNegativeKeywordListItems(targetAuth, sharedSetId, limit), null);
    return typedResult(result);
  }));

  // ─── Paid vs Organic ──────────────────────────────────────────────

  server.registerTool("getPaidVsOrganicAnalysis", {
    description:
      "Compare paid Google Ads performance vs organic Google Search performance for the same search queries. " +
      "Returns per-term paid clicks/conversions/cost alongside organic clicks/impressions, plus a cannibalization " +
      "estimate (what % of paid conversions organic would have caught anyway), estimated incremental CPA, and a " +
      "verdict per term. Use to decide whether to keep, reduce, or pause paid spend on brand or any keyword theme. " +
      "REQUIRES Search Console linked to the Google Ads account (Tools → Linked accounts → Search Console). " +
      "If not linked, response.gscLinked = false with setup instructions.",
    inputSchema: {
      accountId: accountIdParam,
      days: z.number().int().min(1).max(365).default(90).describe("Lookback days (default 90)"),
      searchTermContains: z.string().optional().describe("Filter to search terms containing this substring (e.g. 'pawsvip' for brand analysis)"),
      campaignId: z.string().optional().describe("Optional: limit to a single campaign"),
      limit: z.number().int().min(1).max(1000).default(200).describe("Max search terms returned"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, days, searchTermContains, campaignId, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_paid_vs_organic_analysis", () =>
      getPaidVsOrganicAnalysis(targetAuth, { days, searchTermContains, campaignId, limit }),
    );
    return typedResult(result);
  }));

  // ─── Account Audit ────────────────────────────────────────────────

  server.registerTool("audit", {
    description:
      "Full account audit: collects all campaign data in parallel and returns pre-computed findings " +
      "(waste rate, QS issues, impression share matrix, brand leakage, budget-constrained winners). " +
      "One call replaces 20+ individual tool calls. " +
      "Finding lists (wastedKeywords, wastedSearchTerms, brandLeakage.terms, miningOpportunities, " +
      "negativeConflicts, landingPages, budgetConstrainedWinners, recentChanges) are envelopes: " +
      "`{shown, total, totalSpend, items}`. " +
      "Use `total` and `totalSpend` for account-wide decisions — don't assume `items` is complete. " +
      "For full drill-down (all items, not just the top-N preview), call `runGaqlQuery` with a focused filter. " +
      "\n\nCHANGE-AWARE — every audit pulls `change_event` for the last 30 days (API cap). " +
      "Each campaign and each flagged item carries `recentChange` (or null): " +
      "`{ daysAgo, changedFields, operation, clientType, resourceType, otherChangesInWindow }`. " +
      "When `recentChange` is present, the item's metrics reflect a window that pre-dates the fix — " +
      "RE-EVALUATE before recommending action. Treat small `daysAgo` + relevant `changedFields` " +
      "(e.g. status, cpc_bid_micros, budget.amount_micros, negative keyword added) as strong evidence " +
      "the issue may already be addressed. Each campaign with a recent change also carries " +
      "`metricsSplit: { splitAt, beforeDays, afterDays, before, after, cpaDelta, dailySpendDelta }` — " +
      "use the post-change metrics to judge current state, not the aggregate. " +
      "IMPORTANT: `impressionShare`, `budgetLostIS`, `rankLostIS`, and `isMatrix` reflect the FULL " +
      "lookback window and DO NOT update in `metricsSplit`. When `changedFields` contains " +
      "`amount_micros` (budget raised) or bidding-strategy fields, prefer `metricsSplit.dailySpendDelta` " +
      "over `budgetLostIS` for 'is this still budget-constrained?' — the IS number is stale. " +
      "Top-level `recentChanges` lists all edits in the window for context.",
    inputSchema: {
      accountId: accountIdParam,
      days: z.number().int().min(1).max(90).default(30).describe("Lookback days (max 90 for impression share)"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, days }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "audit", () => runAudit(targetAuth, days));
    return typedResult(result);
  }));
};
