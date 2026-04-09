import { InferAgentUIMessage, stepCountIs, ToolLoopAgent, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  // Read functions
  getAccountInfo,
  listAccessibleCustomers,
  listCampaigns,
  getCampaignPerformance,
  getKeywords,
  getNegativeKeywords,
  getSearchTermReport,
  runSafeGaqlReport,
  getTrackingTemplate,
  listAdGroups,
  listAds,
  getImpressionShare,
  getConversionActions,
  getAccountSettings,
  getCampaignSettings,
  searchGeoTargets,
  getRecommendations,
  getResourceMetadata,
  listQueryableResources,
  // Write functions
  pauseKeyword,
  enableKeyword,
  addKeyword,
  removeKeyword,
  updateBid,
  addNegativeKeyword,
  removeNegativeKeyword,
  updateCampaignBudget,
  pauseCampaign,
  enableCampaign,
  removeCampaign,
  createSearchCampaign,
  setTrackingTemplate,
  createAdGroup,
  createAd,
  pauseAd,
  enableAd,
  updateAdFinalUrl,
  updateAdAssets,
  bulkUpdateBids,
  bulkPauseKeywords,
  bulkAddKeywords,
  moveKeywords,
  renameCampaign,
  renameAdGroup,
  updateCampaignBidding,
  updateCampaignSettings,
  toMicros,
} from "@/lib/google-ads";
import type { WriteResult, BiddingStrategyType, UpdateCampaignSettingsParams } from "@/lib/google-ads";
import { logChange, getChanges, getUndoableChange, markRolledBack, setGoals, getGoals } from "@/lib/db/tracking";
import { execWrite, execRead } from "@/lib/tools/execute";
import { executeUndoForChange } from "@/lib/mcp/write-tools";

type AgentAuth = {
  refreshToken: string;
  customerId: string;
  userId?: string | null;
};

const MAX_STEPS = 8;

export function createGoogleAdsAgent(auth: AgentAuth) {
  return new ToolLoopAgent({
    model: openai("gpt-5-mini"),
    stopWhen: stepCountIs(MAX_STEPS),
    prepareStep: ({ stepNumber }) => {
      // On the last step, force text-only response by disabling tool calls
      if (stepNumber >= MAX_STEPS - 1) {
        return { toolChoice: "none" as const };
      }
      return {};
    },
    instructions: `You are AdsAgent, a Google Ads copilot in a chat interface.

You are currently operating on one connected Google Ads account chosen by the user.
Be precise, commercial, and action-oriented.

Rules:
- Use tools whenever the user asks about account data, campaigns, keywords, metrics, or reporting.
- When the user asks for analysis, inspect the account first instead of making assumptions.
- Explain metrics in plain English and include exact numbers from tool results.
- Never invent campaign performance. If data is missing, say so.
- Prefer concise answers unless the user explicitly asks for a deeper audit.
- Never make write changes without explicit user confirmation. Always show what you plan to change, the current value, and the new value before executing.
- After every write, tell the user the changeId so they can undo within 7 days.
- Guardrails are server-side: bid changes >25% and budget changes >50% will be rejected.
- IMPORTANT: Always end your response with a text summary. Never stop after tool calls without explaining the results to the user.`,
    tools: {
      // ─── Read Tools ──────────────────────────────────────────

      getConnectedAccount: tool({
        description: "Get the currently connected Google Ads customer context: name, currency, timezone, test account status.",
        inputSchema: z.object({}),
        execute: async () => execRead(auth, auth.customerId, "get_account_info", () => getAccountInfo(auth)),
      }),
      listAccessibleCustomers: tool({
        description: "List all Google Ads customers accessible with the connected refresh token.",
        inputSchema: z.object({}),
        execute: async () => execRead(auth, auth.customerId, "list_accessible_customers", () => listAccessibleCustomers(auth.refreshToken)),
      }),
      listCampaigns: tool({
        description: "List campaigns with lifetime metrics (impressions, clicks, cost, conversions).",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(100).default(20),
          includeRemoved: z.boolean().default(false),
        }),
        execute: async ({ limit, includeRemoved }) =>
          execRead(auth, auth.customerId, "list_campaigns", () => listCampaigns(auth, { limit, includeRemoved })),
      }),
      getCampaignPerformance: tool({
        description: "Get daily performance and rolled-up totals for a campaign over a recent date range.",
        inputSchema: z.object({
          campaignId: z.string().describe("Google Ads campaign ID"),
          days: z.number().int().min(1).max(365).default(30),
        }),
        execute: async ({ campaignId, days }) =>
          execRead(auth, auth.customerId, "get_campaign_performance", () => getCampaignPerformance(auth, campaignId, { days }), campaignId),
      }),
      getKeywords: tool({
        description: "Top keywords for a campaign with metrics: impressions, clicks, CTR, CPC, quality score, and conversions.",
        inputSchema: z.object({
          campaignId: z.string(),
          days: z.number().int().min(1).max(365).default(30),
          limit: z.number().int().min(1).max(100).default(50),
        }),
        execute: async ({ campaignId, days, limit }) =>
          execRead(auth, auth.customerId, "get_keywords", () => getKeywords(auth, campaignId, days, limit), campaignId),
      }),
      getNegativeKeywords: tool({
        description: "List negative keywords for a campaign. Check before adding new negatives to avoid duplicates.",
        inputSchema: z.object({
          campaignId: z.string(),
          limit: z.number().int().min(1).max(500).default(100),
        }),
        execute: async ({ campaignId, limit }) =>
          execRead(auth, auth.customerId, "get_negative_keywords", () => getNegativeKeywords(auth, campaignId, limit), campaignId),
      }),
      getSearchTermReport: tool({
        description: "Actual search queries that triggered ads, ordered by cost. Use to find irrelevant terms to add as negative keywords.",
        inputSchema: z.object({
          campaignId: z.string(),
          days: z.number().int().min(1).max(365).default(30),
          limit: z.number().int().min(1).max(100).default(50),
        }),
        execute: async ({ campaignId, days, limit }) =>
          execRead(auth, auth.customerId, "get_search_term_report", () => getSearchTermReport(auth, campaignId, days, limit), campaignId),
      }),
      runGaqlQuery: tool({
        description:
          "Run a read-only GAQL SELECT query against the Google Ads API. Returns up to 50 rows. " +
          "GAQL tips: (1) Use getResourceMetadata to discover valid fields before querying. " +
          "(2) Dates must be literal YYYY-MM-DD strings. " +
          "(3) The change_event resource requires LIMIT <= 10000. " +
          "(4) Use listQueryableResources to see all available resources.",
        inputSchema: z.object({
          query: z.string().min(10).describe("A GAQL SELECT query. Mutating statements are not allowed."),
        }),
        execute: async ({ query }) => execRead(auth, auth.customerId, "run_gaql_query", () => runSafeGaqlReport(auth, query)),
      }),
      getTrackingTemplate: tool({
        description: "Get the tracking template (click-tracking URL suffix) at the account, campaign, ad group, or ad level.",
        inputSchema: z.object({
          level: z.enum(["account", "campaign", "ad_group", "ad"]),
          campaignId: z.string().optional().describe("Required when level is 'campaign'"),
          adGroupId: z.string().optional().describe("Required when level is 'ad_group'"),
          adId: z.string().optional().describe("Required when level is 'ad'"),
        }),
        execute: async ({ level, campaignId, adGroupId, adId }) => {
          const entityId = level === "campaign" ? campaignId : level === "ad_group" ? adGroupId : level === "ad" ? adId : undefined;
          return execRead(auth, auth.customerId, "get_tracking_template", () => getTrackingTemplate(auth, level, entityId));
        },
      }),
      listAdGroups: tool({
        description: "List ad groups in a campaign with performance metrics (impressions, clicks, cost, conversions).",
        inputSchema: z.object({
          campaignId: z.string(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
        execute: async ({ campaignId, limit }) =>
          execRead(auth, auth.customerId, "list_ad_groups", () => listAdGroups(auth, campaignId, limit), campaignId),
      }),
      listAds: tool({
        description: "List ads in a campaign with RSA headlines, descriptions, final URLs, status, and performance metrics. Optionally filter to one ad group.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string().optional(),
          days: z.number().int().min(1).max(365).default(30),
          limit: z.number().int().min(1).max(100).default(50),
        }),
        execute: async ({ campaignId, adGroupId, days, limit }) =>
          execRead(auth, auth.customerId, "list_ads", () => listAds(auth, campaignId, adGroupId, days, limit), campaignId),
      }),
      getImpressionShare: tool({
        description: "Impression share metrics for a campaign: search IS, absolute top IS, top IS, budget-lost IS, and rank-lost IS. Max 90 days.",
        inputSchema: z.object({
          campaignId: z.string(),
          days: z.number().int().min(1).max(90).default(30),
        }),
        execute: async ({ campaignId, days }) =>
          execRead(auth, auth.customerId, "get_impression_share", () => getImpressionShare(auth, campaignId, days), campaignId),
      }),
      getConversionActions: tool({
        description: "List conversion actions with type, status, counting method, and value settings.",
        inputSchema: z.object({}),
        execute: async () => execRead(auth, auth.customerId, "get_conversion_actions", () => getConversionActions(auth)),
      }),
      getAccountSettings: tool({
        description: "Account-level settings: auto-tagging status, tracking URL template, and conversion tracking IDs.",
        inputSchema: z.object({}),
        execute: async () => execRead(auth, auth.customerId, "get_account_settings", () => getAccountSettings(auth)),
      }),
      getCampaignSettings: tool({
        description: "Campaign configuration: bidding strategy, network targeting (Search Partners, Display), location targeting, and ad schedule.",
        inputSchema: z.object({
          campaignId: z.string(),
        }),
        execute: async ({ campaignId }) =>
          execRead(auth, auth.customerId, "get_campaign_settings", () => getCampaignSettings(auth, campaignId), campaignId),
      }),
      searchGeoTargets: tool({
        description:
          "Search for geo target locations by name (cities, counties, states, countries). " +
          "Returns geo target constant IDs for use with updateCampaignSettings location targeting.",
        inputSchema: z.object({
          query: z.string().min(1).max(200).describe("Location name (e.g. 'Seattle', 'Kitsap County', 'United States')"),
          countryCode: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 country code (e.g. 'US')"),
          locale: z.string().max(10).optional().describe("Locale for results (default: 'en')"),
        }),
        execute: async ({ query, countryCode, locale }) =>
          execRead(auth, auth.customerId, "search_geo_targets", () => searchGeoTargets(auth, query, countryCode, locale)),
      }),
      getRecommendations: tool({
        description: "Google Ads optimization recommendations with estimated impact. Optionally filter to a specific campaign.",
        inputSchema: z.object({
          campaignId: z.string().optional(),
        }),
        execute: async ({ campaignId }) =>
          execRead(auth, auth.customerId, "get_recommendations", () => getRecommendations(auth, campaignId), campaignId),
      }),
      getResourceMetadata: tool({
        description: "Discover available fields for a GAQL resource. Use before constructing GAQL queries to avoid invalid field errors.",
        inputSchema: z.object({
          resourceName: z.string().min(1).describe("GAQL resource name (e.g. 'campaign', 'ad_group', 'keyword_view')"),
        }),
        execute: async ({ resourceName }) => getResourceMetadata(auth, resourceName),
      }),
      listQueryableResources: tool({
        description: "List all queryable GAQL resources (e.g. campaign, ad_group, keyword_view).",
        inputSchema: z.object({}),
        execute: async () => listQueryableResources(auth),
      }),

      // ─── Write Tools ─────────────────────────────────────────

      pauseKeyword: tool({
        description: "Pause an active keyword. Returns changeId for undo.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          criterionId: z.string().describe("Keyword criterion ID (from getKeywords)"),
        }),
        execute: ({ campaignId, adGroupId, criterionId }) =>
          execWrite(auth, auth.customerId, campaignId, () => pauseKeyword(auth, campaignId, adGroupId, criterionId)),
      }),
      enableKeyword: tool({
        description: "Re-enable a paused keyword. Returns changeId for undo.",
        inputSchema: z.object({
          adGroupId: z.string(),
          criterionId: z.string(),
        }),
        execute: ({ adGroupId, criterionId }) =>
          execWrite(auth, auth.customerId, null, () => enableKeyword(auth, adGroupId, criterionId)),
      }),
      addKeyword: tool({
        description: "Add a keyword to an ad group (starts enabled). Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          keyword: z.string().min(1),
          matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD"),
        }),
        execute: ({ campaignId, adGroupId, keyword, matchType }) =>
          execWrite(auth, auth.customerId, campaignId, () => addKeyword(auth, adGroupId, keyword, matchType)),
      }),
      removeKeyword: tool({
        description: "Remove a keyword from an ad group. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          criterionId: z.string(),
        }),
        execute: ({ campaignId, adGroupId, criterionId }) =>
          execWrite(auth, auth.customerId, campaignId, () => removeKeyword(auth, adGroupId, criterionId)),
      }),
      updateBid: tool({
        description: "Change the CPC bid for a keyword (max 25% change per adjustment). Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          criterionId: z.string(),
          newBidDollars: z.number().positive().describe("New bid in dollars (e.g. 1.50)"),
        }),
        execute: ({ campaignId, adGroupId, criterionId, newBidDollars }) =>
          execWrite(auth, auth.customerId, campaignId, () => updateBid(auth, campaignId, adGroupId, criterionId, toMicros(newBidDollars))),
      }),
      bulkUpdateBids: tool({
        description: "Update up to 50 keyword bids in one call. Each bid capped at 25% change. Returns per-keyword results.",
        inputSchema: z.object({
          updates: z.array(z.object({
            campaignId: z.string(),
            adGroupId: z.string(),
            criterionId: z.string(),
            newBidDollars: z.number().positive(),
          })).min(1).max(50),
        }),
        execute: async ({ updates }) => {
          const results = await bulkUpdateBids(auth, updates);
          const logged = await Promise.all(
            results.map(({ input, ...result }) =>
              execWrite(auth, auth.customerId, input.campaignId, async () => result).then((r) => ({ ...r, input })),
            ),
          );
          const succeeded = logged.filter((r) => r.success).length;
          const failed = logged.filter((r) => !r.success).length;
          return { summary: { total: results.length, succeeded, failed }, results: logged };
        },
      }),
      addNegativeKeyword: tool({
        description: "Add a negative keyword to a campaign. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          keywordText: z.string().min(1),
          matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("PHRASE"),
        }),
        execute: ({ campaignId, keywordText, matchType }) =>
          execWrite(auth, auth.customerId, campaignId, () => addNegativeKeyword(auth, campaignId, keywordText, matchType)),
      }),
      removeNegativeKeyword: tool({
        description: "Remove a negative keyword from a campaign. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          keywordText: z.string().min(1),
          matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).optional(),
        }),
        execute: ({ campaignId, keywordText, matchType }) =>
          execWrite(auth, auth.customerId, campaignId, () => removeNegativeKeyword(auth, campaignId, keywordText, matchType)),
      }),
      updateCampaignBudget: tool({
        description: "Change the daily budget for a campaign (max 50% change, min $1/day). Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          newDailyBudgetDollars: z.number().positive().describe("New daily budget in dollars"),
        }),
        execute: ({ campaignId, newDailyBudgetDollars }) =>
          execWrite(auth, auth.customerId, campaignId, () => updateCampaignBudget(auth, campaignId, toMicros(newDailyBudgetDollars))),
      }),
      createCampaign: tool({
        description: "Create a Search campaign with budget, ad group, keywords, and RSA. Starts PAUSED. Returns changeId.",
        inputSchema: z.object({
          campaignName: z.string().min(1),
          dailyBudgetDollars: z.number().positive().min(1),
          keywords: z.array(z.string().min(1)).min(1),
          headlines: z.array(z.string().min(1).max(30)).min(3).max(15).describe("RSA headlines (3-15, max 30 chars each)"),
          descriptions: z.array(z.string().min(1).max(90)).min(2).max(4).describe("RSA descriptions (2-4, max 90 chars each)"),
          finalUrl: z.string().url(),
          biddingStrategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "MANUAL_CPC"]).default("MAXIMIZE_CONVERSIONS"),
          keywordMatchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD"),
        }),
        execute: async ({ campaignName, dailyBudgetDollars, keywords, headlines, descriptions, finalUrl, biddingStrategy, keywordMatchType }) => {
          const createResult = await createSearchCampaign(auth, {
            campaignName, dailyBudgetDollars, keywords, headlines, descriptions, finalUrl, biddingStrategy, keywordMatchType,
          });
          const writeResult: WriteResult = {
            success: createResult.success,
            action: "create_campaign",
            entityId: createResult.campaignId ?? "",
            beforeValue: "",
            afterValue: createResult.campaignName,
            error: createResult.error,
          };
          const logged = await execWrite(auth, auth.customerId, createResult.campaignId ?? null, async () => writeResult);
          return {
            ...createResult,
            changeId: logged.changeId,
            status: createResult.success ? "PAUSED" : undefined,
            nextSteps: createResult.success ? "Campaign created as PAUSED. Review settings, then use enableCampaign to go live." : undefined,
          };
        },
      }),
      pauseCampaign: tool({
        description: "Pause an active campaign to stop all its ads. Returns changeId.",
        inputSchema: z.object({ campaignId: z.string() }),
        execute: ({ campaignId }) =>
          execWrite(auth, auth.customerId, campaignId, () => pauseCampaign(auth, campaignId)),
      }),
      enableCampaign: tool({
        description: "Re-enable a paused campaign. Returns changeId.",
        inputSchema: z.object({ campaignId: z.string() }),
        execute: ({ campaignId }) =>
          execWrite(auth, auth.customerId, campaignId, () => enableCampaign(auth, campaignId)),
      }),
      removeCampaign: tool({
        description: "PERMANENTLY remove a campaign — cannot be undone. Prefer pauseCampaign in most cases. Returns changeId.",
        inputSchema: z.object({ campaignId: z.string() }),
        execute: ({ campaignId }) =>
          execWrite(auth, auth.customerId, campaignId, () => removeCampaign(auth, campaignId)),
      }),
      renameCampaign: tool({
        description: "Rename a campaign. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          newName: z.string().min(1),
        }),
        execute: ({ campaignId, newName }) =>
          execWrite(auth, auth.customerId, campaignId, () => renameCampaign(auth, campaignId, newName)),
      }),
      updateCampaignBidding: tool({
        description: "Update a campaign's bidding strategy. Supports: TARGET_CPA, MAXIMIZE_CONVERSIONS, TARGET_ROAS, MAXIMIZE_CLICKS, MANUAL_CPC. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          biddingStrategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "MANUAL_CPC", "TARGET_CPA", "TARGET_ROAS"]),
          targetCpa: z.number().optional().describe("Target CPA in dollars. Required for TARGET_CPA, optional cap for MAXIMIZE_CONVERSIONS."),
          targetRoas: z.number().optional().describe("Target ROAS multiplier (e.g. 2.0 = 200%). Required for TARGET_ROAS."),
        }),
        execute: ({ campaignId, biddingStrategy, targetCpa, targetRoas }) =>
          execWrite(auth, auth.customerId, campaignId, () =>
            updateCampaignBidding(auth, campaignId, {
              biddingStrategy: biddingStrategy as BiddingStrategyType,
              targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
              targetRoas,
            }),
          ),
      }),
      updateCampaignSettings: tool({
        description: "Update campaign network targeting and/or location targeting. Returns changeId per mutation.",
        inputSchema: z.object({
          campaignId: z.string(),
          networks: z.object({
            googleSearch: z.boolean().optional(),
            searchPartners: z.boolean().optional(),
            displayNetwork: z.boolean().optional(),
          }).optional().describe("Network targeting toggles"),
          locationTargeting: z.object({
            add: z.array(z.string()).optional().describe("Geo target constant IDs to add"),
            remove: z.array(z.string()).optional().describe("Geo target constant IDs to remove"),
          }).optional(),
          negativeLocationTargeting: z.object({
            add: z.array(z.string()).optional().describe("Geo target constant IDs to exclude"),
            remove: z.array(z.string()).optional().describe("Geo target constant IDs to stop excluding"),
          }).optional(),
        }),
        execute: async ({ campaignId, networks, locationTargeting, negativeLocationTargeting }) => {
          const params: UpdateCampaignSettingsParams = {};
          if (networks) params.networks = networks;
          if (locationTargeting) params.locationTargeting = locationTargeting;
          if (negativeLocationTargeting) params.negativeLocationTargeting = negativeLocationTargeting;
          const result = await updateCampaignSettings(auth, campaignId, params);
          const logged = await Promise.all(
            result.results.map((r) => execWrite(auth, auth.customerId, campaignId, async () => r)),
          );
          return { success: result.success, error: result.error, results: logged };
        },
      }),
      setTrackingTemplate: tool({
        description: "Set or clear the click-tracking URL suffix at account, campaign, ad group, or ad level. Returns changeId.",
        inputSchema: z.object({
          level: z.enum(["account", "campaign", "ad_group", "ad"]),
          campaignId: z.string().optional(),
          adGroupId: z.string().optional(),
          adId: z.string().optional(),
          trackingTemplate: z.string().describe("Tracking URL template. Empty string to remove."),
        }),
        execute: async ({ level, campaignId, adGroupId, adId, trackingTemplate }) => {
          const entityId = level === "campaign" ? campaignId : level === "ad_group" ? adGroupId : level === "ad" ? adId : undefined;
          const writeResult = await setTrackingTemplate(auth, level, trackingTemplate, entityId);
          const resolvedCampaignId = level === "campaign" ? (entityId ?? null) : (writeResult.campaignId ?? null);
          return execWrite(auth, auth.customerId, resolvedCampaignId, async () => writeResult);
        },
      }),

      // ─── Ad Group Management ─────────────────────────────────

      createAdGroup: tool({
        description: "Create an ad group in a campaign (starts enabled). Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupName: z.string().min(1),
        }),
        execute: ({ campaignId, adGroupName }) =>
          execWrite(auth, auth.customerId, campaignId, () => createAdGroup(auth, campaignId, adGroupName)),
      }),
      renameAdGroup: tool({
        description: "Rename an ad group. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          newName: z.string().min(1),
        }),
        execute: ({ campaignId, adGroupId, newName }) =>
          execWrite(auth, auth.customerId, campaignId, () => renameAdGroup(auth, campaignId, adGroupId, newName)),
      }),
      moveKeywords: tool({
        description: "Move keywords between ad groups in the same campaign. Returns changeIds for both adds and pauses.",
        inputSchema: z.object({
          campaignId: z.string(),
          fromAdGroupId: z.string(),
          toAdGroupId: z.string(),
          criterionIds: z.array(z.string()).min(1).max(100),
          matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).optional().describe("Override match type — omit to inherit from source"),
        }),
        execute: async ({ campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType }) => {
          const result = await moveKeywords(auth, campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType);
          const addChangeIds = await Promise.all(
            result.added.filter((r) => r.success).map((r) => execWrite(auth, auth.customerId, campaignId, async () => r)),
          );
          const pauseChangeIds = await Promise.all(
            result.paused.filter((r) => r.success).map((r) => execWrite(auth, auth.customerId, campaignId, async () => r)),
          );
          return {
            success: result.success,
            summary: {
              added: { total: result.added.length, succeeded: result.added.filter((r) => r.success).length },
              paused: { total: result.paused.length, succeeded: result.paused.filter((r) => r.success).length },
            },
            changeIds: {
              adds: addChangeIds.map((r) => r.changeId).filter(Boolean),
              pauses: pauseChangeIds.map((r) => r.changeId).filter(Boolean),
            },
            error: result.error,
          };
        },
      }),

      // ─── Ad Management ───────────────────────────────────────

      createAd: tool({
        description: "Create a Responsive Search Ad (RSA) in an ad group. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          headlines: z.array(z.string().min(1).max(30)).min(3).max(15).describe("3-15 headlines, max 30 chars each"),
          descriptions: z.array(z.string().min(1).max(90)).min(2).max(4).describe("2-4 descriptions, max 90 chars each"),
          finalUrl: z.string().url(),
        }),
        execute: ({ campaignId, adGroupId, headlines, descriptions, finalUrl }) =>
          execWrite(auth, auth.customerId, campaignId, () => createAd(auth, adGroupId, { headlines, descriptions, finalUrl })),
      }),
      pauseAd: tool({
        description: "Pause an active ad. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          adId: z.string(),
        }),
        execute: ({ campaignId, adGroupId, adId }) =>
          execWrite(auth, auth.customerId, campaignId, () => pauseAd(auth, adGroupId, adId)),
      }),
      enableAd: tool({
        description: "Re-enable a paused ad. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          adId: z.string(),
        }),
        execute: ({ campaignId, adGroupId, adId }) =>
          execWrite(auth, auth.customerId, campaignId, () => enableAd(auth, adGroupId, adId)),
      }),
      updateAdFinalUrl: tool({
        description: "Update the landing page URL for an ad. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          adId: z.string(),
          finalUrl: z.string().url(),
        }),
        execute: ({ campaignId, adGroupId, adId, finalUrl }) =>
          execWrite(auth, auth.customerId, campaignId, () => updateAdFinalUrl(auth, adGroupId, adId, finalUrl)),
      }),
      updateAdAssets: tool({
        description: "Replace ALL headlines and descriptions for a RSA. Provide every asset, not just changed ones. Returns changeId.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          adId: z.string(),
          headlines: z.array(z.object({
            text: z.string().min(1).max(30),
            pin: z.number().int().min(1).max(3).optional().describe("Pin to position 1, 2, or 3"),
          })).min(3).max(15),
          descriptions: z.array(z.object({
            text: z.string().min(1).max(90),
            pin: z.number().int().min(1).max(2).optional().describe("Pin to position 1 or 2"),
          })).min(2).max(4),
        }),
        execute: ({ campaignId, adGroupId, adId, headlines, descriptions }) =>
          execWrite(auth, auth.customerId, campaignId, () => updateAdAssets(auth, adGroupId, adId, { headlines, descriptions })),
      }),

      // ─── Bulk Keyword Operations ─────────────────────────────

      bulkAddKeywords: tool({
        description: "Add up to 100 keywords to an ad group in one call. Returns per-keyword results.",
        inputSchema: z.object({
          campaignId: z.string(),
          adGroupId: z.string(),
          keywords: z.array(z.object({
            keyword: z.string().min(1),
            matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD"),
          })).min(1).max(100),
        }),
        execute: async ({ campaignId, adGroupId, keywords }) => {
          const results = await bulkAddKeywords(auth, adGroupId, keywords);
          const logged = await Promise.all(
            results.map(({ input, ...result }) =>
              execWrite(auth, auth.customerId, campaignId, async () => result).then((r) => ({ ...r, input })),
            ),
          );
          const succeeded = logged.filter((r) => r.success).length;
          const failed = logged.filter((r) => !r.success).length;
          return { summary: { total: results.length, succeeded, failed }, results: logged };
        },
      }),
      bulkPauseKeywords: tool({
        description: "Pause up to 100 keywords in one call. Returns per-keyword results.",
        inputSchema: z.object({
          keywords: z.array(z.object({
            campaignId: z.string(),
            adGroupId: z.string(),
            criterionId: z.string(),
          })).min(1).max(100),
        }),
        execute: async ({ keywords }) => {
          const results = await bulkPauseKeywords(auth, keywords);
          const logged = await Promise.all(
            results.map(({ input, ...result }) =>
              execWrite(auth, auth.customerId, input.campaignId, async () => result).then((r) => ({ ...r, input })),
            ),
          );
          const succeeded = logged.filter((r) => r.success).length;
          const failed = logged.filter((r) => !r.success).length;
          return { summary: { total: results.length, succeeded, failed }, results: logged };
        },
      }),

      // ─── Guardrails ──────────────────────────────────────────

      setGuardrails: tool({
        description: "Set guardrail limits for bid changes, budget changes, and keyword pauses. Account-level or per-campaign.",
        inputSchema: z.object({
          campaignId: z.string().optional(),
          targetCpa: z.number().positive().optional(),
          monthlyCap: z.number().positive().optional(),
          maxBidChangePct: z.number().min(0.01).max(1.0).optional().describe("Max bid change as decimal (0.25 = 25%)"),
          maxBudgetChangePct: z.number().min(0.01).max(1.0).optional(),
          maxKeywordPausePct: z.number().min(0.01).max(1.0).optional(),
        }),
        execute: async ({ campaignId, targetCpa, monthlyCap, maxBidChangePct, maxBudgetChangePct, maxKeywordPausePct }) => {
          const goals: Parameters<typeof setGoals>[2] = {};
          if (targetCpa !== undefined) goals.targetCpa = targetCpa;
          if (monthlyCap !== undefined) goals.monthlyCap = monthlyCap;
          if (maxBidChangePct !== undefined) goals.maxBidChangePct = maxBidChangePct;
          if (maxBudgetChangePct !== undefined) goals.maxBudgetChangePct = maxBudgetChangePct;
          if (maxKeywordPausePct !== undefined) goals.maxKeywordPausePct = maxKeywordPausePct;
          const result = await setGoals(auth.customerId, campaignId ?? null, goals);
          return { success: true, ...result };
        },
      }),
      getGuardrails: tool({
        description: "Get current guardrail limits. Returns campaign-specific if set, otherwise account defaults.",
        inputSchema: z.object({
          campaignId: z.string().optional(),
        }),
        execute: async ({ campaignId }) => {
          const goals = await getGoals(auth.customerId, campaignId);
          if (!goals) {
            return {
              source: "defaults",
              targetCpa: null,
              monthlyCap: null,
              maxBidChangePct: 0.25,
              maxBudgetChangePct: 0.50,
              maxKeywordPausePct: 0.30,
            };
          }
          return {
            source: campaignId && goals.campaignId === campaignId ? "campaign" : "account",
            ...goals,
          };
        },
      }),

      // ─── Change History & Undo ────────────────────────────────

      getChanges: tool({
        description: "Get recent changes made via AdsAgent. Each change has a changeId for use with undoChange.",
        inputSchema: z.object({
          campaignId: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(20),
        }),
        execute: async ({ campaignId, limit }) =>
          execRead(auth, auth.customerId, "get_changes", () => getChanges(auth.customerId, { limit, campaignId })),
      }),
      undoChange: tool({
        description: "Undo a previous write by changeId. Works within 7 days if entity hasn't been modified since.",
        inputSchema: z.object({
          changeId: z.number().int().positive(),
        }),
        execute: async ({ changeId }) => {
          const check = await getUndoableChange(auth.customerId, changeId);
          if ("error" in check) return { success: false, error: check.error };

          const { change } = check;
          const undoResult = await executeUndoForChange(auth, change);

          if (undoResult.success) {
            await markRolledBack(changeId);
            await logChange(auth.customerId, auth.userId, change.campaignId ?? null, undoResult, `Undo of change #${changeId}`);
          }

          return { ...undoResult, undoneChangeId: changeId, originalAction: change.toolName };
        },
      }),
    },
  });
}

export type GoogleAdsAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createGoogleAdsAgent>
>;
