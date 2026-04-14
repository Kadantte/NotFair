import { z } from "zod";
import {
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
  decodeTrackingEntityId,
  getCustomer,
  safeEntityId,
  toMicros,
  authForAccount,
  resolveAccountId,
  createAdGroup,
  createAd,
  pauseAd,
  enableAd,
  removeAd,
  updateAdFinalUrl,
  updateAdAssets,
  bulkUpdateBids,
  bulkPauseKeywords,
  bulkAddKeywords,
  moveKeywords,
  renameCampaign,
  renameAdGroup,
  updateCampaignSettings,
  updateCampaignBidding,
  updateCampaignGoalConfig,
  createConversionAction,
  updateConversionAction,
  uploadClickConversions,
  pausePmaxAssetGroup,
  enablePmaxAssetGroup,
  updateCampaignLanguages,
  createCalloutAsset,
  linkCalloutToAccount,
  removeCalloutFromAccount,
  createBiddingStrategy,
  updateBiddingStrategy,
  removeBiddingStrategy,
  linkCampaignToBiddingStrategy,
} from "@/lib/google-ads";
import type { WriteResult, AuthContext, UpdateCampaignSettingsParams, BiddingStrategyType, GoalConfigLevel, PortfolioStrategyType } from "@/lib/google-ads";
import { logChange, getUndoableChange, markRolledBack, setGoals, getGoals } from "@/lib/db/tracking";
import { execWrite } from "@/lib/tools/execute";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import { jsonResult, safeHandler, accountIdParam, READ_ANNOTATIONS, WRITE_ANNOTATIONS, DESTRUCTIVE_WRITE_ANNOTATIONS } from "./types";
import type { ToolRegistrar } from "./types";
import { resolveToolAuth } from "./helpers";

/**
 * Write tools that mutate Google Ads account state.
 * All tools include guardrails to prevent excessive changes.
 * All successful writes are logged to the changes table with a changeId for undo support.
 */
export const registerWriteTools: ToolRegistrar = (server, currentAuth) => {
  // ─── Keyword Management ─────────────────────────────────────────

  server.registerTool("pauseKeyword", {
    description: "Pause an active keyword. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (from getKeywords)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, criterionId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => pauseKeyword(targetAuth, campaignId, adGroupId, criterionId));
    return jsonResult(result);
  }));

  server.registerTool("enableKeyword", {
    description: "Re-enable a paused keyword. Only needs adGroupId + criterionId (no campaignId, unlike pauseKeyword). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (from getKeywords)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, adGroupId, criterionId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => enableKeyword(targetAuth, adGroupId, criterionId));
    return jsonResult(result);
  }));

  server.registerTool("addKeyword", {
    description: "Add a keyword to an ad group (starts enabled). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      keyword: z.string().min(1),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, keyword, matchType }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => addKeyword(targetAuth, adGroupId, keyword, matchType));
    return jsonResult(result);
  }));

  // ─── Bid Management ─────────────────────────────────────────────

  server.registerTool("updateBid", {
    description: "Update a keyword's CPC bid. Only works with MANUAL_CPC or ENHANCED_CPC bidding. Capped at 25% change per adjustment. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (from getKeywords)"),
      newBidDollars: z.number().positive().describe("New bid in dollars (e.g. 1.50)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, criterionId, newBidDollars }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () =>
      updateBid(targetAuth, campaignId, adGroupId, criterionId, toMicros(newBidDollars)),
    );
    return jsonResult(result);
  }));

  // ─── Negative Keywords ──────────────────────────────────────────

  server.registerTool("addNegativeKeyword", {
    description: "Add a negative keyword to a campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      keyword: z.string().min(1).describe("Keyword text to block"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("PHRASE").describe("Match type for the negative keyword (default: PHRASE)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, keyword, matchType }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => addNegativeKeyword(targetAuth, campaignId, keyword, matchType));
    return jsonResult(result);
  }));

  server.registerTool("removeNegativeKeyword", {
    description: "Remove a negative keyword from a campaign. If the same keyword text exists under multiple match types, specify matchType to remove the correct one. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      keyword: z.string().min(1).describe("Exact negative keyword text to remove"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).optional().describe("Match type to disambiguate if the same text exists under multiple match types"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, campaignId, keyword, matchType }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => removeNegativeKeyword(targetAuth, campaignId, keyword, matchType));
    return jsonResult(result);
  }));

  // ─── Budget Management ──────────────────────────────────────────

  server.registerTool("updateCampaignBudget", {
    description: "Update a campaign's daily budget. Capped at 50% change per adjustment, minimum $1/day. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      newDailyBudgetDollars: z.number().positive().describe("New daily budget in dollars (e.g. 25.00)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, newDailyBudgetDollars }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () =>
      updateCampaignBudget(targetAuth, campaignId, toMicros(newDailyBudgetDollars)),
    );
    return jsonResult(result);
  }));

  // ─── Create Campaign ────────────────────────────────────────────

  server.registerTool("createCampaign", {
    description: "Create a Search campaign with budget, ad group, keywords, and a Responsive Search Ad. Starts PAUSED — use enableCampaign to go live. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      keywords: z.array(z.string().min(1)).min(1),
      headlines: z
        .array(z.string().min(1).max(30))
        .min(3)
        .max(15)
        .describe("RSA headlines (3-15, max 30 chars each)"),
      descriptions: z
        .array(z.string().min(1).max(90))
        .min(2)
        .max(4)
        .describe("RSA descriptions (2-4, max 90 chars each)"),
      finalUrl: z.string().url(),
      biddingStrategy: z
        .enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "MANUAL_CPC"])
        .default("MAXIMIZE_CONVERSIONS"),
      keywordMatchType: z
        .enum(["BROAD", "PHRASE", "EXACT"])
        .default("BROAD"),
      geoTargetIds: z
        .array(z.string())
        .optional()
        .describe("Geo target constant IDs (e.g. ['2840'] for United States). Use searchGeoTargets to find IDs."),
      languageIds: z
        .array(z.string())
        .optional()
        .describe("Language constant IDs (e.g. ['1000'] for English, ['1003'] for Spanish). Defaults to no language restriction (all languages) if omitted."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, keywords, headlines, descriptions, finalUrl, biddingStrategy, keywordMatchType, geoTargetIds, languageIds }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    await enforceRateLimit(auth.userId); // Check before API call (not deferred to execWrite)

    const createResult = await createSearchCampaign(authForAccount(auth, accountId), {
      campaignName,
      dailyBudgetDollars,
      keywords,
      headlines,
      descriptions,
      finalUrl,
      biddingStrategy,
      keywordMatchType,
      geoTargetIds,
      languageIds,
    });

    const writeResult: WriteResult = {
      success: createResult.success,
      action: "create_campaign",
      entityId: createResult.campaignId ?? "",
      beforeValue: "",
      afterValue: createResult.campaignName,
      error: createResult.error,
    };

    const logged = await execWrite(auth, targetId, createResult.campaignId ?? null, async () => writeResult);

    return jsonResult({
      ...createResult,
      changeId: logged.changeId,
      status: createResult.success ? "PAUSED" : undefined,
      nextSteps: createResult.success
        ? "Campaign created as PAUSED. Review settings in Google Ads, then use enableCampaign to start running ads."
        : undefined,
    });
  }));

  // ─── Campaign Status ────────────────────────────────────────────

  server.registerTool("pauseCampaign", {
    description: "Pause a campaign, stopping all its ads. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, campaignId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => pauseCampaign(targetAuth, campaignId));
    return jsonResult(result);
  }));

  server.registerTool("enableCampaign", {
    description: "Re-enable a paused campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => enableCampaign(targetAuth, campaignId));
    return jsonResult(result);
  }));

  server.registerTool("removeCampaign", {
    description: "PERMANENTLY remove a campaign — cannot be undone, not even with undoChange. The campaign and all its ad groups, ads, and keywords will be deleted. Prefer pauseCampaign in most cases. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, campaignId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => removeCampaign(targetAuth, campaignId));
    return jsonResult(result);
  }));

  // ─── Tracking Templates ─────────────────────────────────────────

  server.registerTool("setTrackingTemplate", {
    description: "Set or clear the click-tracking URL suffix at the account, campaign, ad group, or ad level. Uses ValueTrack parameters. Pass empty string to clear. Returns changeId.",
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
      trackingTemplate: z
        .string()
        .describe("Tracking URL template (e.g. '{lpurl}?utm_source=google&utm_medium=cpc'). Empty string to remove."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, level, campaignId, adGroupId, adId, trackingTemplate }) => {
    const entityId = level === "campaign" ? campaignId
      : level === "ad_group" ? adGroupId
      : level === "ad" ? adId
      : undefined;
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    await enforceRateLimit(auth.userId); // Check before API call (not deferred to execWrite)
    const writeResult = await setTrackingTemplate(authForAccount(auth, accountId), level, trackingTemplate, entityId);
    const resolvedCampaignId = level === "campaign" ? (entityId ?? null) : (writeResult.campaignId ?? null);
    const result = await execWrite(auth, targetId, resolvedCampaignId, async () => writeResult);
    return jsonResult(result);
  }));

  // ─── Ad Group Management ────────────────────────────────────────

  server.registerTool("createAdGroup", {
    description: "Create an ad group in a campaign (starts enabled). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupName: z.string().min(1),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => createAdGroup(targetAuth, campaignId, adGroupName));
    return jsonResult(result);
  }));

  // ─── Ad Management ──────────────────────────────────────────────

  server.registerTool("createAd", {
    description: "Create a Responsive Search Ad (RSA) in an ad group. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging/undo tracking)"),
      adGroupId: z.string(),
      headlines: z
        .array(z.string().min(1).max(30))
        .min(3)
        .max(15)
        .describe("3-15 headlines, max 30 chars each"),
      descriptions: z
        .array(z.string().min(1).max(90))
        .min(2)
        .max(4)
        .describe("2-4 descriptions, max 90 chars each"),
      finalUrl: z.string().url(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, headlines, descriptions, finalUrl }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => createAd(targetAuth, adGroupId, { headlines, descriptions, finalUrl }));
    return jsonResult(result);
  }));

  server.registerTool("pauseAd", {
    description: "Pause an active ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => pauseAd(targetAuth, adGroupId, adId));
    return jsonResult(result);
  }));

  server.registerTool("enableAd", {
    description: "Re-enable a paused ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => enableAd(targetAuth, adGroupId, adId));
    return jsonResult(result);
  }));

  server.registerTool("removeAd", {
    description: "Permanently remove an ad from an ad group. This cannot be undone. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => removeAd(targetAuth, adGroupId, adId));
    return jsonResult(result);
  }));

  server.registerTool("updateAdFinalUrl", {
    description: "Update the landing page URL for an ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
      finalUrl: z.string().url(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId, finalUrl }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => updateAdFinalUrl(targetAuth, adGroupId, adId, finalUrl));
    return jsonResult(result);
  }));

  server.registerTool("updateAdAssets", {
    description: "Replace all headlines and descriptions for a Responsive Search Ad. COMPLETE replacement — provide every asset, not just changed ones. Optionally pin assets to fixed positions. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
      headlines: z
        .array(
          z.object({
            text: z.string().min(1).max(30),
            pin: z.number().int().min(1).max(3).optional().describe("Pin to position 1, 2, or 3"),
          }),
        )
        .min(3)
        .max(15)
        .describe("Complete replacement headlines (3-15, max 30 chars each)"),
      descriptions: z
        .array(
          z.object({
            text: z.string().min(1).max(90),
            pin: z.number().int().min(1).max(2).optional().describe("Pin to position 1 or 2"),
          }),
        )
        .min(2)
        .max(4)
        .describe("Complete replacement descriptions (2-4, max 90 chars each)"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId, headlines, descriptions }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => updateAdAssets(targetAuth, adGroupId, adId, { headlines, descriptions }));
    return jsonResult(result);
  }));

  // ─── Bulk Operations ────────────────────────────────────────────

  server.registerTool("bulkUpdateBids", {
    description: "Update up to 50 keyword bids in one call. Each bid capped at 25% change. Returns per-keyword results with individual changeIds.",
    inputSchema: {
      accountId: accountIdParam,
      updates: z
        .array(
          z.object({
            campaignId: z.string(),
            adGroupId: z.string(),
            criterionId: z.string(),
            newBidDollars: z.number().positive().describe("New bid in dollars"),
          }),
        )
        .min(1)
        .max(50),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, updates }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const results = await bulkUpdateBids(authForAccount(auth, accountId), updates);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, input.campaignId, async () => result)
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;

    return jsonResult({
      summary: { total: results.length, succeeded, failed },
      results: logged,
    });
  }));

  // ─── Bulk Keyword Operations ─────────────────────────────────────

  server.registerTool("bulkPauseKeywords", {
    description: "Pause up to 100 keywords in one call. Partial success is possible. Returns per-keyword results with individual changeIds.",
    inputSchema: {
      accountId: accountIdParam,
      keywords: z
        .array(
          z.object({
            campaignId: z.string(),
            adGroupId: z.string(),
            criterionId: z.string(),
          }),
        )
        .min(1)
        .max(100),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, keywords }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const results = await bulkPauseKeywords(authForAccount(auth, accountId), keywords);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, input.campaignId, async () => result)
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;

    return jsonResult({
      summary: { total: results.length, succeeded, failed },
      results: logged,
    });
  }));

  server.registerTool("bulkAddKeywords", {
    description: "Add up to 100 keywords to an ad group in one call. Partial success is possible. Returns per-keyword results with individual changeIds.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      keywords: z
        .array(
          z.object({
            keyword: z.string().min(1),
            matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD"),
          }),
        )
        .min(1)
        .max(100),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, keywords }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const results = await bulkAddKeywords(authForAccount(auth, accountId), adGroupId, keywords);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, campaignId, async () => result)
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;

    return jsonResult({
      summary: { total: results.length, succeeded, failed },
      results: logged,
    });
  }));

  // ─── Move Keywords ─────────────────────────────────────────────────

  server.registerTool("moveKeywords", {
    description: "Move keywords between ad groups in the same campaign. Inherits match type from source keywords by default — specify matchType only to override. Allows partial success: successfully-added keywords are paused in source, failed ones are left untouched. Returns changeIds for both adds and pauses.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      fromAdGroupId: z.string(),
      toAdGroupId: z.string(),
      criterionIds: z.array(z.string()).min(1).max(100).describe("Keyword criterion IDs (from getKeywords)"),
      matchType: z
        .enum(["BROAD", "PHRASE", "EXACT"])
        .optional()
        .describe("Override match type in destination — omit to inherit from source"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await moveKeywords(authForAccount(auth, accountId), campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType);

    const addChangeIds = await Promise.all(
      result.added.filter((r) => r.success).map((r) =>
        execWrite(auth, targetId, campaignId, async () => r),
      ),
    );
    const pauseChangeIds = await Promise.all(
      result.paused.filter((r) => r.success).map((r) =>
        execWrite(auth, targetId, campaignId, async () => r),
      ),
    );

    return jsonResult({
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
    });
  }));

  // ─── Rename Campaign / Ad Group ────────────────────────────────────

  server.registerTool("renameCampaign", {
    description: "Rename a campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      newName: z.string().min(1),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, newName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => renameCampaign(targetAuth, campaignId, newName));
    return jsonResult(result);
  }));

  server.registerTool("renameAdGroup", {
    description: "Rename an ad group. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      newName: z.string().min(1),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, newName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => renameAdGroup(targetAuth, campaignId, adGroupId, newName));
    return jsonResult(result);
  }));

  // ─── Campaign Bidding Strategy ──────────────────────────────────

  server.registerTool("updateCampaignBidding", {
    description: "Update a campaign's bidding strategy. Supports: TARGET_CPA (set a target cost per acquisition), MAXIMIZE_CONVERSIONS (optionally with a target CPA cap), MAXIMIZE_CONVERSION_VALUE (maximize total conversion value, optionally with a target ROAS — required for PMAX value-based bidding), TARGET_ROAS (target return on ad spend), MAXIMIZE_CLICKS, MANUAL_CPC. For TARGET_CPA, targetCpa is required (in dollars). For MAXIMIZE_CONVERSIONS, targetCpa is optional (acts as a cap). For TARGET_ROAS and MAXIMIZE_CONVERSION_VALUE, targetRoas is required/optional respectively (e.g. 2.0 = 200% ROAS). Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      biddingStrategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "MAXIMIZE_CLICKS", "MANUAL_CPC", "TARGET_CPA", "TARGET_ROAS"])
        .describe("The bidding strategy to set. Use MAXIMIZE_CONVERSION_VALUE for Performance Max campaigns optimizing for revenue/value."),
      targetCpa: z.number().optional()
        .describe("Target CPA in dollars (e.g. 10.50 for $10.50). Required for TARGET_CPA, optional cap for MAXIMIZE_CONVERSIONS."),
      targetRoas: z.number().optional()
        .describe("Target ROAS as a multiplier (e.g. 2.0 = 200% return). Required for TARGET_ROAS, optional cap for MAXIMIZE_CONVERSION_VALUE."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, biddingStrategy, targetCpa, targetRoas }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    const logged = await execWrite(auth, targetId, campaignId, () =>
      updateCampaignBidding(authForAccount(auth, accountId), campaignId, {
        biddingStrategy: biddingStrategy as BiddingStrategyType,
        targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
        targetRoas,
      }),
    );

    return jsonResult(logged);
  });

  // ─── Campaign Goal Config ───────────────────────────────────────

  server.registerTool("updateCampaignGoals", {
    description: "Switch a campaign between campaign-specific and account-level conversion goals. Set to CUSTOMER to use account-level goals (required before switching to non-conversion bidding strategies like MAXIMIZE_CLICKS or MANUAL_CPC). Set to CAMPAIGN for campaign-specific goals. Note: updateCampaignBidding auto-handles this when switching to MAXIMIZE_CLICKS or MANUAL_CPC, so this tool is only needed for manual goal config changes.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      goalConfigLevel: z.enum(["CUSTOMER", "CAMPAIGN"])
        .describe("CUSTOMER = use account-level conversion goals. CAMPAIGN = use campaign-specific conversion goals."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, goalConfigLevel }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () =>
      updateCampaignGoalConfig(targetAuth, campaignId, goalConfigLevel as GoalConfigLevel),
    );
    return jsonResult(result);
  }));

  // ─── Campaign Settings ──────────────────────────────────────────

  server.registerTool("updateCampaignSettings", {
    description: "Update campaign network targeting and/or location targeting. Networks: toggle Google Search, Search Partners, Display Network. Locations: add/remove geo targets (positive or negative) by geo target constant ID (e.g. '2840' for US, '200840' for Seattle-Tacoma DMA). Returns a changeId per mutation.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      networks: z
        .object({
          googleSearch: z.boolean().optional().describe("Target Google Search"),
          searchPartners: z.boolean().optional().describe("Target Search Partner sites"),
          displayNetwork: z.boolean().optional().describe("Target Google Display Network"),
        })
        .optional()
        .describe("Network targeting toggles — only specified fields are changed"),
      locationTargeting: z
        .object({
          add: z.array(z.string()).optional().describe("Geo target constant IDs to add (e.g. '2840' for US)"),
          remove: z.array(z.string()).optional().describe("Geo target constant IDs to remove"),
        })
        .optional()
        .describe("Positive location targeting — where ads should show"),
      negativeLocationTargeting: z
        .object({
          add: z.array(z.string()).optional().describe("Geo target constant IDs to exclude"),
          remove: z.array(z.string()).optional().describe("Geo target constant IDs to stop excluding"),
        })
        .optional()
        .describe("Negative location targeting — where ads should NOT show"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, networks, locationTargeting, negativeLocationTargeting }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    const params: UpdateCampaignSettingsParams = {};
    if (networks) params.networks = networks;
    if (locationTargeting) params.locationTargeting = locationTargeting;
    if (negativeLocationTargeting) params.negativeLocationTargeting = negativeLocationTargeting;

    const result = await updateCampaignSettings(authForAccount(auth, accountId), campaignId, params);

    const logged = await Promise.all(
      result.results.map((r) => execWrite(auth, targetId, campaignId, async () => r)),
    );

    return jsonResult({
      success: result.success,
      error: result.error,
      results: logged,
    });
  }));

  // ─── Conversion Action Management ────────────────────────────────

  server.registerTool("createConversionAction", {
    description: "Create a conversion action for tracking offline conversions (imports), web events, or calls. Optionally enable Enhanced Conversions for Leads (ECFL) for user-data matching. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).describe("Conversion action name, e.g. 'First Booking'"),
      category: z.enum([
        "PURCHASE", "LEAD", "IMPORTED_LEAD", "QUALIFIED_LEAD", "CONVERTED_LEAD",
        "SIGNUP", "BOOK_APPOINTMENT", "SUBMIT_LEAD_FORM", "REQUEST_QUOTE",
        "SUBSCRIBE_PAID", "ADD_TO_CART", "BEGIN_CHECKOUT", "PAGE_VIEW",
        "DOWNLOAD", "PHONE_CALL_LEAD", "GET_DIRECTIONS", "OUTBOUND_CLICK",
        "CONTACT", "ENGAGEMENT", "STORE_VISIT", "STORE_SALE", "DEFAULT",
      ]).default("PURCHASE"),
      type: z.enum(["UPLOAD_CLICKS", "WEBPAGE", "UPLOAD_CALLS"]).default("UPLOAD_CLICKS")
        .describe("UPLOAD_CLICKS for offline/import conversions, WEBPAGE for website events, UPLOAD_CALLS for call tracking"),
      countingType: z.enum(["ONE_PER_CLICK", "MANY_PER_CLICK"]).default("ONE_PER_CLICK")
        .describe("ONE_PER_CLICK counts one conversion per click (leads), MANY_PER_CLICK counts every conversion (purchases)"),
      defaultValue: z.number().optional().describe("Default conversion value in account currency"),
      alwaysUseDefaultValue: z.boolean().default(true).describe("Always use default value vs. transaction-specific values"),
      status: z.enum(["ENABLED"]).default("ENABLED"),
      primaryForGoal: z.boolean().default(true)
        .describe("true = primary (included in Conversions column for bidding), false = secondary (observation only)"),
      enhancedConversionsForLeads: z.boolean().default(false)
        .describe("Enable Enhanced Conversions for Leads at account level. Requires customer data terms to be accepted in Google Ads UI first."),
      viewThroughLookbackWindowDays: z.number().int().min(1).max(30).optional()
        .describe("View-through conversion lookback window (1-30 days)"),
      clickThroughLookbackWindowDays: z.number().int().min(1).max(90).optional()
        .describe("Click-through conversion lookback window (1-90 days)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, category, type, countingType, defaultValue, alwaysUseDefaultValue, status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      createConversionAction(targetAuth, {
        name, category, type, countingType, defaultValue, alwaysUseDefaultValue,
        status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays,
      }),
    );
    return jsonResult(result);
  }));

  server.registerTool("updateConversionAction", {
    description: "Update an existing conversion action's settings — promote secondary to primary, change value, toggle status. Use getConversionActions to find the conversionActionId first. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      conversionActionId: z.string().describe("Conversion action ID (from getConversionActions)"),
      name: z.string().min(1).optional(),
      category: z.enum([
        "PURCHASE", "LEAD", "IMPORTED_LEAD", "QUALIFIED_LEAD", "CONVERTED_LEAD",
        "SIGNUP", "BOOK_APPOINTMENT", "SUBMIT_LEAD_FORM", "REQUEST_QUOTE",
        "SUBSCRIBE_PAID", "ADD_TO_CART", "BEGIN_CHECKOUT", "PAGE_VIEW",
        "DOWNLOAD", "PHONE_CALL_LEAD", "GET_DIRECTIONS", "OUTBOUND_CLICK",
        "CONTACT", "ENGAGEMENT", "STORE_VISIT", "STORE_SALE", "DEFAULT",
      ]).optional(),
      countingType: z.enum(["ONE_PER_CLICK", "MANY_PER_CLICK"]).optional(),
      defaultValue: z.number().optional().describe("Default conversion value in account currency"),
      alwaysUseDefaultValue: z.boolean().optional(),
      status: z.enum(["ENABLED", "REMOVED"]).optional()
        .describe("ENABLED = active, REMOVED = permanently delete"),
      primaryForGoal: z.boolean().optional()
        .describe("true = primary (included in Conversions column for bidding), false = secondary (observation only)"),
      enhancedConversionsForLeads: z.boolean().optional()
        .describe("Enable Enhanced Conversions for Leads at account level"),
      viewThroughLookbackWindowDays: z.number().int().min(1).max(30).optional(),
      clickThroughLookbackWindowDays: z.number().int().min(1).max(90).optional(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, conversionActionId, name, category, countingType, defaultValue, alwaysUseDefaultValue, status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      updateConversionAction(targetAuth, {
        conversionActionId, name, category, countingType, defaultValue, alwaysUseDefaultValue,
        status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays,
      }),
    );
    return jsonResult(result);
  }));

  server.registerTool("uploadClickConversions", {
    description: "Upload offline click conversions to Google Ads for attribution. Supports Enhanced Conversions for Leads via hashed email/phone matching. Each conversion needs a gclid OR hashed user identifiers. Max 2000 conversions per call. Partial failures are reported per-row.",
    inputSchema: {
      accountId: accountIdParam,
      conversionActionId: z.string().describe("Conversion action ID to attribute conversions to"),
      conversions: z.array(z.object({
        gclid: z.string().optional().describe("Google Click ID — required unless using hashed user identifiers"),
        conversionDateTime: z.string().describe("Conversion time in ISO 8601 with timezone, e.g. '2024-01-15T14:30:00-05:00'"),
        conversionValue: z.number().optional().describe("Value in account currency"),
        currencyCode: z.string().length(3).optional().describe("ISO 4217 currency code, e.g. 'USD'"),
        orderId: z.string().optional().describe("External order/transaction ID for deduplication"),
        hashedEmail: z.string().optional().describe("SHA-256 hash of lowercase trimmed email (for Enhanced Conversions for Leads)"),
        hashedPhoneNumber: z.string().optional().describe("SHA-256 hash of E.164 phone number (for Enhanced Conversions for Leads)"),
      })).min(1).max(2000).describe("Conversions to upload (max 2000 per request)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, conversionActionId, conversions }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);

    const result = await uploadClickConversions(targetAuth, conversionActionId, conversions);

    // Log as a write operation for tracking (execWrite handles rate limiting)
    if (result.successCount > 0) {
      const writeResult = {
        success: true,
        action: "upload_click_conversions",
        entityId: conversionActionId,
        beforeValue: "",
        afterValue: `${result.successCount} conversions`,
      };
      await execWrite(auth, targetId, null, async () => writeResult);
    } else {
      // Still rate-limit even when no successes (prevents abuse via invalid uploads)
      await enforceRateLimit(auth.userId);
    }

    return jsonResult(result);
  }));

  // ─── Guardrails ─────────────────────────────────────────────────

  server.registerTool("setGuardrails", {
    description: "Set guardrail limits for bid changes, budget changes, and keyword pauses. Can be set at account level (omit campaignId) or per-campaign. These limits cap how much the AI can change in a single operation.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional().describe("Campaign ID for campaign-specific guardrails (omit for account-level defaults)"),
      targetCpa: z.number().positive().optional().describe("Target CPA in dollars"),
      monthlyCap: z.number().positive().optional().describe("Monthly spend cap in dollars"),
      maxBidChangePct: z.number().min(0.01).max(1.0).optional().describe("Max bid change per adjustment as decimal (e.g. 0.25 = 25%)"),
      maxBudgetChangePct: z.number().min(0.01).max(1.0).optional().describe("Max budget change per adjustment as decimal (e.g. 0.50 = 50%)"),
      maxKeywordPausePct: z.number().min(0.01).max(1.0).optional().describe("Max fraction of keywords that can be paused at once (e.g. 0.30 = 30%)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, targetCpa, monthlyCap, maxBidChangePct, maxBudgetChangePct, maxKeywordPausePct }) => {
    const { auth, targetId } = resolveToolAuth(currentAuth, accountId);
    await enforceRateLimit(auth.userId);
    const goals: Parameters<typeof setGoals>[2] = {};
    if (targetCpa !== undefined) goals.targetCpa = targetCpa;
    if (monthlyCap !== undefined) goals.monthlyCap = monthlyCap;
    if (maxBidChangePct !== undefined) goals.maxBidChangePct = maxBidChangePct;
    if (maxBudgetChangePct !== undefined) goals.maxBudgetChangePct = maxBudgetChangePct;
    if (maxKeywordPausePct !== undefined) goals.maxKeywordPausePct = maxKeywordPausePct;
    const result = await setGoals(targetId, campaignId ?? null, goals);
    return jsonResult({ success: true, ...result });
  }));

  server.registerTool("getGuardrails", {
    description: "Get current guardrail limits. Returns campaign-specific guardrails if set, otherwise account-level defaults. Shows target CPA, monthly cap, and max change percentages for bids, budgets, and keyword pauses.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional().describe("Campaign ID to check campaign-specific guardrails"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId }) => {
    const { targetId } = resolveToolAuth(currentAuth, accountId);
    const goals = await getGoals(targetId, campaignId);
    if (!goals) {
      return jsonResult({
        source: "defaults",
        targetCpa: null,
        monthlyCap: null,
        maxBidChangePct: 0.25,
        maxBudgetChangePct: 0.50,
        maxKeywordPausePct: 0.30,
      });
    }
    return jsonResult({
      source: campaignId && goals.campaignId === campaignId ? "campaign" : "account",
      ...goals,
    });
  }));

  // ─── Performance Max ─────────────────────────────────────────────

  server.registerTool("pausePmaxAssetGroup", {
    description: "Pause a Performance Max asset group. When paused, Google stops serving ads from this asset group while the campaign and other asset groups remain active. Use getPmaxAssetGroups to find asset group IDs. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Performance Max campaign ID"),
      assetGroupId: z.string().describe("Asset group ID to pause (from getPmaxAssetGroups)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, assetGroupId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => pausePmaxAssetGroup(targetAuth, campaignId, assetGroupId));
    return jsonResult(result);
  }));

  server.registerTool("enablePmaxAssetGroup", {
    description: "Re-enable a paused Performance Max asset group so it can serve ads again. Use getPmaxAssetGroups to find asset group IDs. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Performance Max campaign ID"),
      assetGroupId: z.string().describe("Asset group ID to enable (from getPmaxAssetGroups)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, assetGroupId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => enablePmaxAssetGroup(targetAuth, campaignId, assetGroupId));
    return jsonResult(result);
  }));

  // ─── Language Targeting (RMF C.30 / M.10) ────────────────────────

  server.registerTool("updateCampaignLanguages", {
    description: "Add or remove language targeting criteria on a campaign. Pass language constant IDs (e.g. '1000' for English, '1003' for Spanish). Returns a changeId per mutation.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      add: z.array(z.string()).optional().describe("Language constant IDs to add (e.g. ['1000'] for English)"),
      remove: z.array(z.string()).optional().describe("Language constant IDs to remove"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, add, remove }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await updateCampaignLanguages(authForAccount(auth, accountId), campaignId, { add, remove });
    const logged = await Promise.all(
      result.results.map((r) => execWrite(auth, targetId, campaignId, async () => r)),
    );
    return jsonResult({ success: result.success, error: result.error, results: logged });
  }));

  // ─── Callout Extensions (RMF C.75) ───────────────────────────────

  server.registerTool("createCalloutAsset", {
    description: "Create a callout extension (≤25 char snippet shown under text ads, e.g. 'Free shipping'). Set linkToAccount=true to link it at the customer (account) level in the same call, which is what RMF C.75 requires. Returns changeId + assetId.",
    inputSchema: {
      accountId: accountIdParam,
      text: z.string().min(1).max(25).describe("Callout text (≤25 chars), e.g. 'Free shipping'"),
      linkToAccount: z.boolean().default(true).describe("Also link the new asset at the customer/account level"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, text, linkToAccount }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => createCalloutAsset(targetAuth, { text, linkToAccount }));
    return jsonResult(result);
  }));

  server.registerTool("linkCalloutToAccount", {
    description: "Link an existing callout asset to the customer (account) level so it can serve across all campaigns. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      assetId: z.string().describe("Callout asset ID (from listCalloutAssets)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, assetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => linkCalloutToAccount(targetAuth, assetId));
    return jsonResult(result);
  }));

  server.registerTool("removeCalloutFromAccount", {
    description: "Remove a callout's account-level link. The underlying asset is preserved (assets are shared/immutable). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      assetId: z.string().describe("Callout asset ID (from listCalloutAssets)"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, assetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => removeCalloutFromAccount(targetAuth, assetId));
    return jsonResult(result);
  }));

  // ─── Portfolio Bidding Strategies (RMF C.96/97, M.96/97) ─────────

  server.registerTool("createBiddingStrategy", {
    description: "Create a portfolio bidding strategy — a shared bidding configuration that multiple campaigns can reference. Supports TARGET_CPA, TARGET_ROAS, MAXIMIZE_CONVERSIONS, and MAXIMIZE_CONVERSION_VALUE. For TARGET_CPA, targetCpa (in dollars) is required. For TARGET_ROAS, targetRoas (e.g. 2.0 = 200%) is required. Returns changeId + biddingStrategyId. Use linkCampaignToBiddingStrategy to attach to campaigns.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).describe("Strategy name, e.g. 'Lead Gen Target CPA'"),
      type: z.enum(["TARGET_CPA", "TARGET_ROAS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"]),
      targetCpa: z.number().optional().describe("Target CPA in dollars. Required for TARGET_CPA; optional cap for MAXIMIZE_CONVERSIONS."),
      targetRoas: z.number().optional().describe("Target ROAS multiplier (e.g. 2.0 = 200% return). Required for TARGET_ROAS; optional cap for MAXIMIZE_CONVERSION_VALUE."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, type, targetCpa, targetRoas }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => createBiddingStrategy(targetAuth, {
      name,
      type: type as PortfolioStrategyType,
      targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
      targetRoas,
    }));
    return jsonResult(result);
  }));

  server.registerTool("updateBiddingStrategy", {
    description: "Edit a portfolio bidding strategy's name and/or target value. You can change targetCpa on TARGET_CPA/MAXIMIZE_CONVERSIONS strategies, and targetRoas on TARGET_ROAS/MAXIMIZE_CONVERSION_VALUE strategies. The strategy type itself cannot be changed. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      biddingStrategyId: z.string(),
      name: z.string().min(1).optional(),
      targetCpa: z.number().optional().describe("New target CPA in dollars"),
      targetRoas: z.number().optional().describe("New target ROAS multiplier"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, biddingStrategyId, name, targetCpa, targetRoas }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => updateBiddingStrategy(targetAuth, {
      biddingStrategyId,
      name,
      targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
      targetRoas,
    }));
    return jsonResult(result);
  }));

  server.registerTool("removeBiddingStrategy", {
    description: "Remove a portfolio bidding strategy. All campaigns currently linked to it must be unlinked first (Google Ads will reject otherwise). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      biddingStrategyId: z.string(),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, biddingStrategyId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => removeBiddingStrategy(targetAuth, biddingStrategyId));
    return jsonResult(result);
  }));

  server.registerTool("linkCampaignToBiddingStrategy", {
    description: "Link a campaign to a portfolio bidding strategy — the campaign will use the shared strategy's configuration. This replaces any standard (campaign-level) bidding config. Use listBiddingStrategies to find strategy IDs. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      biddingStrategyId: z.string(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, biddingStrategyId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => linkCampaignToBiddingStrategy(targetAuth, campaignId, biddingStrategyId));
    return jsonResult(result);
  }));

  // ─── Undo ───────────────────────────────────────────────────────

  server.registerTool("undoChange", {
    description: "Undo a previous write operation by changeId. Only works within 7 days AND only if the entity hasn't been modified since the original change. Returns error if either condition is not met.",
    inputSchema: {
      accountId: accountIdParam,
      changeId: z.number().int().positive().describe("changeId returned by the original write operation"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, changeId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    const check = await getUndoableChange(targetId, changeId);
    if ("error" in check) {
      return jsonResult({ success: false, error: check.error });
    }

    const { change } = check;
    const targetAuth = authForAccount(auth, accountId);

    const undoResult = await executeUndoForChange(targetAuth, change);

    if (undoResult.success) {
      await markRolledBack(changeId);
      await logChange(targetId, auth.userId, change.campaignId ?? null, undoResult, `Undo of change #${changeId} (${change.toolName})`, auth.clientName);
    }

    return jsonResult({
      ...undoResult,
      undoneChangeId: changeId,
      originalAction: change.toolName,
    });
  }));
};

// ─── Undo Helpers ─────────────────────────────────────────────────

/** Look up a keyword's adGroupId and campaignId by criterionId. */
async function findKeywordContext(
  auth: AuthContext,
  criterionId: string,
): Promise<{ adGroupId: string; campaignId: string } | null> {
  const customer = getCustomer(auth);

  const cid = safeEntityId(criterionId, "criterion");
  const result = await customer.query(`
    SELECT ad_group.id, campaign.id
    FROM keyword_view
    WHERE ad_group_criterion.criterion_id = ${cid}
    LIMIT 1
  `);

  const row = (result as any[])[0];
  const adGroupId = String(row?.ad_group?.id);
  const campaignId = String(row?.campaign?.id);
  if (!adGroupId || adGroupId === "undefined") return null;
  return { adGroupId, campaignId };
}

const NOT_FOUND_ERROR = "Could not find ad group for this keyword";

async function findAndEnableKeyword(auth: AuthContext, criterionId: string): Promise<WriteResult> {
  const ctx = await findKeywordContext(auth, criterionId);
  if (!ctx) return { success: false, action: "enable_keyword", entityId: criterionId, beforeValue: "PAUSED", afterValue: "PAUSED", error: NOT_FOUND_ERROR };
  return enableKeyword(auth, ctx.adGroupId, criterionId);
}

async function findAndPauseKeyword(auth: AuthContext, criterionId: string): Promise<WriteResult> {
  const ctx = await findKeywordContext(auth, criterionId);
  if (!ctx) return { success: false, action: "pause_keyword", entityId: criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: NOT_FOUND_ERROR };
  return pauseKeyword(auth, ctx.campaignId, ctx.adGroupId, criterionId);
}

async function findAndUpdateBid(auth: AuthContext, criterionId: string, previousBidMicros: number): Promise<WriteResult> {
  const ctx = await findKeywordContext(auth, criterionId);
  if (!ctx) return { success: false, action: "update_bid", entityId: criterionId, beforeValue: "N/A", afterValue: String(previousBidMicros), error: NOT_FOUND_ERROR };
  return updateBid(auth, ctx.campaignId, ctx.adGroupId, criterionId, previousBidMicros, {
    maxBidChangePct: 1.0,
    maxBudgetChangePct: 1.0,
    maxKeywordPausePct: 1.0,
  });
}

/** Execute the reverse operation for a change record. Used by both MCP undoChange and the dashboard undo action. */
export async function executeUndoForChange(
  auth: AuthContext,
  change: { toolName: string; entityId: string | null; campaignId: string | null; beforeValue: string | null; afterValue: string | null },
): Promise<WriteResult> {
  const entityId = change.entityId ?? "";
  const beforeValue = change.beforeValue ?? "";
  if (!entityId) {
    return { success: false, action: change.toolName, entityId: "", beforeValue, afterValue: beforeValue, error: "Cannot undo: missing entity ID" };
  }
  switch (change.toolName) {
    case "pause_keyword":
      return findAndEnableKeyword(auth, entityId);
    case "enable_keyword":
      return findAndPauseKeyword(auth, entityId);
    case "update_bid": {
      const bidMicros = Number(beforeValue);
      if (!bidMicros || bidMicros <= 0) return { success: false, action: "update_bid", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: invalid previous bid value" };
      return findAndUpdateBid(auth, entityId, bidMicros);
    }
    case "update_budget": {
      const budgetMicros = Number(beforeValue);
      if (!budgetMicros || budgetMicros <= 0) return { success: false, action: "update_budget", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: invalid previous budget value" };
      return updateCampaignBudget(auth, entityId, budgetMicros, { maxBidChangePct: 1.0, maxBudgetChangePct: 1.0, maxKeywordPausePct: 1.0 });
    }
    case "add_keyword": {
      if (!beforeValue) return { success: false, action: "remove_keyword", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: missing adGroupId" };
      return removeKeyword(auth, beforeValue, entityId);
    }
    case "remove_keyword": {
      return { success: false, action: "add_keyword", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo keyword removal (keyword text not stored)" };
    }
    case "add_negative_keyword": {
      const afterVal = change.afterValue ?? "";
      const pipeIdx = afterVal.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? afterVal.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : undefined;
      return removeNegativeKeyword(auth, change.campaignId ?? "", entityId, undoMatchType);
    }
    case "remove_negative_keyword": {
      const pipeIdx = beforeValue.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? beforeValue.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : "PHRASE";
      const undoText = pipeIdx > 0 ? beforeValue.slice(0, pipeIdx) : entityId;
      return addNegativeKeyword(auth, change.campaignId ?? "", undoText, undoMatchType);
    }
    case "pause_campaign":
      return enableCampaign(auth, entityId);
    case "enable_campaign":
      return pauseCampaign(auth, entityId);
    case "create_campaign":
      return removeCampaign(auth, entityId);
    case "remove_campaign":
      return { success: false, action: "remove_campaign", entityId, beforeValue, afterValue: beforeValue, error: "Campaign removal is permanent in Google Ads and cannot be undone." };
    case "set_tracking_template": {
      const { level, entityId: actualId } = decodeTrackingEntityId(entityId);
      return setTrackingTemplate(auth, level, beforeValue, actualId);
    }
    case "create_ad_group":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo ad group creation (would require removing all ads and keywords inside it)" };
    case "create_ad":
      return pauseAd(auth, beforeValue, entityId);
    case "pause_ad":
      return enableAd(auth, beforeValue, entityId);
    case "enable_ad":
      return pauseAd(auth, beforeValue, entityId);
    case "remove_ad":
      return { success: false, action: "remove_ad", entityId, beforeValue, afterValue: beforeValue, error: "Ad removal is permanent in Google Ads and cannot be undone." };
    case "update_ad_final_url": {
      const [adGroupIdPart, adIdPart] = entityId.split("~");
      if (!adGroupIdPart || !adIdPart) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: malformed entity ID" };
      }
      if (!beforeValue) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous URL was not recorded" };
      }
      return updateAdFinalUrl(auth, adGroupIdPart, adIdPart, beforeValue);
    }
    case "update_ad_assets": {
      const [adGroupIdPart, adIdPart] = entityId.split("~");
      if (!adGroupIdPart || !adIdPart) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: malformed entity ID" };
      }
      if (!beforeValue) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous assets were not recorded" };
      }
      try {
        const prev = JSON.parse(beforeValue) as { h: (string | { text: string; pin?: number })[]; d: (string | { text: string; pin?: number })[] };
        const toAsset = (x: string | { text: string; pin?: number }) =>
          typeof x === "string" ? { text: x } : x;
        return updateAdAssets(auth, adGroupIdPart, adIdPart, {
          headlines: prev.h.map(toAsset),
          descriptions: prev.d.map(toAsset),
        });
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: could not parse previous asset state" };
      }
    }
    case "update_campaign_networks": {
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous network settings not recorded" };
      try {
        const prev = JSON.parse(beforeValue) as { googleSearch: boolean; searchPartners: boolean; displayNetwork: boolean };
        const result = await updateCampaignSettings(auth, entityId, { networks: prev });
        return result.results[0] ?? { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "No result from network settings update" };
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: failed to parse previous network settings" };
      }
    }
    case "add_campaign_location":
    case "remove_campaign_location":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Location changes cannot be automatically undone. Use updateCampaignSettings to adjust locations manually." };
    case "update_bidding": {
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous bidding strategy not recorded" };
      try {
        const prev = JSON.parse(beforeValue) as { strategy: string; targetCpaMicros: number | null; targetRoas: number | null };
        return updateCampaignBidding(auth, entityId, {
          biddingStrategy: prev.strategy as BiddingStrategyType,
          targetCpaMicros: prev.targetCpaMicros ?? undefined,
          targetRoas: prev.targetRoas ?? undefined,
        });
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: failed to parse previous bidding strategy" };
      }
    }
    case "rename_campaign":
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous name was not recorded" };
      return renameCampaign(auth, entityId, beforeValue);
    case "rename_ad_group":
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous name was not recorded" };
      return renameAdGroup(auth, change.campaignId ?? "", entityId, beforeValue);
    case "create_conversion_action":
      // Undo creation by setting status to REMOVED
      return updateConversionAction(auth, { conversionActionId: entityId, status: "REMOVED" });
    case "update_conversion_action": {
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous conversion action state not recorded" };
      try {
        const prev = JSON.parse(beforeValue) as Record<string, unknown>;
        return updateConversionAction(auth, {
          conversionActionId: entityId,
          name: prev.name as string | undefined,
          status: prev.status as string | undefined,
          category: prev.category as string | undefined,
          countingType: prev.countingType as string | undefined,
          defaultValue: prev.defaultValue as number | undefined,
          alwaysUseDefaultValue: prev.alwaysUseDefaultValue as boolean | undefined,
        });
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: failed to parse previous conversion action state" };
      }
    }
    case "upload_click_conversions":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Conversion uploads cannot be undone — uploaded conversions are permanent in Google Ads" };
    case "pause_pmax_asset_group":
      return enablePmaxAssetGroup(auth, change.campaignId ?? "", entityId);
    case "enable_pmax_asset_group":
      return pausePmaxAssetGroup(auth, change.campaignId ?? "", entityId);
    default:
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: `Don't know how to undo "${change.toolName}"` };
  }
}
