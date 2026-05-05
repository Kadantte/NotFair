import { z } from "zod";
import {
  getRecommendations,
  getResourceMetadata,
  listQueryableResources,
  searchGeoTargets,
  getKeywordIdeas,
  listKeywords,
  getAccountSummary,
  type AuthContext,
} from "@/lib/google-ads";
import { getChanges, reviewChangeImpact } from "@/lib/db/tracking";
import { getChangeIntervention, listChangeInterventions, evaluateChangeIntervention } from "@/lib/db/interventions";
import { MIN_AFTER_DAYS_FOR_DIRECTION } from "@/lib/db/impact";
import { execRead } from "@/lib/tools/execute";
import { getEnv } from "@/lib/env";
import { typedResult, safeHandler, accountIdParam, READ_ANNOTATIONS } from "./types";
import type { ToolRegistrar } from "./types";
import { resolveToolAuth } from "./helpers";

/**
 * Non-GAQL read tools for Google Ads — specialized services that `runScript`
 * can't cover (recommendation engine, keyword planner, geo target search,
 * internal change log, schema introspection). Everything that's expressible
 * as GAQL lives in `runScript` (see `./code-mode`).
 */
export const registerReadTools: ToolRegistrar = (server, currentAuth) => {
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
    description: "Google Ads optimization recommendations with estimated impact (impressions, clicks, conversions). Optionally filter to a specific campaign. Served by Google's recommendation engine — not GAQL-expressible, use this tool (not runScript).",
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

  // ─── Change History (NotFair-originated) ─────────────────────────

  server.registerTool("getChanges", {
    description: "Recent changes made to the account via NotFair. Each change has a changeId usable with undoChange. Also returns derived `changeGroups` that group atomic write rows into likely user-intent episodes by requestId/scope/time so agents don't misread bulk edits as isolated one-offs. Reads NotFair's internal change log (Postgres), not Google's change_event API — for Google-side edits use runScript with `SELECT ... FROM change_event`.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, limit }) => {
    const { auth, targetId } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_changes", () => getChanges(targetId, { limit, campaignId }));
    return typedResult(result);
  }));

  server.registerTool("reviewChangeImpact", {
    description:
      `Estimate correlational impact of every successful change in the last \`days\` using daily campaign snapshots (captured by cron). For each change: compares 7-day daily averages BEFORE vs AFTER the change date on the affected campaign, classifies direction (improved/worsened/neutral/unknown), and returns cost/conversion/CPA deltas plus \`otherChangesInWindow\` so you can spot confounders (other writes in the 14-day envelope). Response includes per-action counts and a campaign-deduped aggregate sum — use this instead of stitching getChanges + a runScript performance query by hand. Ideal for weekly or ad-hoc impact reviews. Caveats: impact is correlational (seasonality, competitor bids, Google's algorithm also move numbers); changes <${MIN_AFTER_DAYS_FOR_DIRECTION} days old are typically 'tooNew' because the snapshot cron lags a day; keyword/ad changes attribute to the containing campaign (campaign-level granularity only); window boundaries are UTC.`,
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

  server.registerTool("listChangeInterventions", {
    description: "List Impact Monitor interventions grouped at the campaign episode level. Returns campaign-scoped write bundles with status, summary, requestIds, operation counts, and the latest evaluation if one exists.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional(),
      status: z.enum(["watching", "ready_for_review", "needs_attention", "reviewed", "archived"]).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, status, limit, offset }) => {
    const { auth, targetId } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_change_interventions", () =>
      listChangeInterventions(targetId, { campaignId, status, limit, offset }),
      campaignId,
    );
    return typedResult(result);
  }));

  server.registerTool("getChangeIntervention", {
    description: "Get one Impact Monitor intervention with its linked operations and latest evaluation.",
    inputSchema: {
      accountId: accountIdParam,
      changeInterventionId: z.number().int().positive(),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, changeInterventionId }) => {
    const { auth, targetId } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "get_change_intervention", async () => {
      const intervention = await getChangeIntervention(targetId, changeInterventionId);
      if (!intervention) throw new Error("Change intervention not found.");
      return intervention;
    });
    return typedResult(result);
  }));

  server.registerTool("evaluateChangeIntervention", {
    description: "Run the server-side observational evaluation for one Impact Monitor intervention. Compares the campaign's 7-day before window vs the post-change window, counts same-campaign confounders, stores an evaluation row, and returns a conservative verdict.",
    inputSchema: {
      accountId: accountIdParam,
      changeInterventionId: z.number().int().positive(),
      baselineWindowDays: z.number().int().min(1).max(30).default(7),
      afterWindowDays: z.number().int().min(1).max(30).default(7),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, changeInterventionId, baselineWindowDays, afterWindowDays }) => {
    const { auth, targetId } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "evaluate_change_intervention", () =>
      evaluateChangeIntervention(targetId, changeInterventionId, { baselineWindowDays, afterWindowDays }),
    );
    return typedResult(result);
  }));

  // ─── Keyword Inventory ───────────────────────────────────────────

  server.registerTool("listKeywords", {
    description:
      "Typed keyword inventory for safe mutation prep. Use this when you need keyword criterion IDs for bulkPauseKeywords, bulkUpdateBids, moveKeywords, or to inspect current positive/negative keyword state. This is intentionally narrow: for performance analysis, date-ranged metrics, search terms, or custom joins, use runScript. Defaults are safety-oriented: positive keywords only, enabled criteria only, and rows under REMOVED campaigns/ad groups excluded.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional().describe("Optional campaign ID to narrow the inventory."),
      adGroupId: z.string().optional().describe("Optional ad group ID to narrow the inventory."),
      positive: z
        .boolean()
        .default(true)
        .describe("true = positive keywords only (default). false = negative keywords only."),
      enabledOnly: z
        .boolean()
        .default(true)
        .describe("true = only ENABLED keyword criteria (default). false = include PAUSED, still excluding REMOVED criteria."),
      excludeRemovedParents: z
        .boolean()
        .default(true)
        .describe("Exclude keywords whose campaign or ad group is REMOVED. Default true."),
      includeQualityInfo: z.boolean().default(false).describe("Include quality score sub-fields."),
      includeBidInfo: z.boolean().default(false).describe("Include CPC bid fields."),
      limit: z.number().int().min(1).max(1000).default(500).describe("Maximum keywords to return. Default 500, max 1000."),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, positive, enabledOnly, excludeRemovedParents, includeQualityInfo, includeBidInfo, limit }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_keywords", () =>
      listKeywords(targetAuth, {
        campaignId,
        adGroupId,
        positive,
        enabledOnly,
        excludeRemovedParents,
        includeQualityInfo,
        includeBidInfo,
        limit,
      }),
      campaignId,
    );
    return typedResult(result);
  }));

  // ─── Account Setup Snapshot ──────────────────────────────────────────

  server.registerTool("summarizeAccountSetup", {
    description:
      "One-shot, human-readable snapshot of how the account is configured: currency + time zone, every non-removed campaign with its bidding strategy and tCPA/tROAS in major units, every conversion action with category + primary_for_goal flag, plus diagnostic notes when the setup is unusual (no primary conversion action, mixed optimization modes). Call this FIRST in any strategic conversation — it gives you the conversion hierarchy and bidding posture as named strings so you don't misread enum integers (the BiddingStrategyType landmines: 10=MAXIMIZE_CONVERSIONS, 11=MAXIMIZE_CONVERSION_VALUE, 9=TARGET_SPEND, 15=TARGET_IMPRESSION_SHARE) or treat micros as dollars. Replaces 3+ runScript calls (account info + campaigns + conversion actions) for the canonical setup question.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "summarize_account_setup", () =>
      getAccountSummary(targetAuth),
    );
    return typedResult(result);
  }));

  // ─── Field & Resource Discovery ─────────────────────────────────────

  server.registerTool("getResourceMetadata", {
    description:
      "Discover available fields for a GAQL resource. Returns selectable, filterable, and sortable fields with data types. Call this before writing a `runScript` that queries an unfamiliar resource, so you use valid field names. Example: getResourceMetadata('campaign') returns all campaign.* fields.",
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
      "List all queryable GAQL resources (e.g. campaign, ad_group, keyword_view). Pair with `getResourceMetadata` to discover fields, then write a `runScript` against them.",
    inputSchema: {
      accountId: accountIdParam,
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId }) => {
    const { targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await listQueryableResources(targetAuth);
    return typedResult(result);
  }));

  // ─── Keyword Research ───────────────────────────────────────────

  server.registerTool("getKeywordIdeas", {
    description:
      "Get keyword ideas with real search volume, competition, and CPC data from Google Ads Keyword Planner. " +
      "Provide seed keywords and/or a URL to discover new keyword opportunities. " +
      "Returns avg monthly searches, competition level, average CPC, and top-of-page bid estimates. " +
      "No Google Ads account connection required — works for all users. " +
      "Use searchGeoTargets first to find geo target IDs for location targeting. " +
      "Keyword Planner is a separate API (not GAQL) — use this tool, not runScript.",
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
};
