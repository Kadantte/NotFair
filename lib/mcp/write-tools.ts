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
  preValidateBulkMutation,
  bulkAddKeywords,
  moveKeywords,
  renameCampaign,
  renameAdGroup,
  updateCampaignSettings,
  updateCampaignBidding,
  updateCampaignGoalConfig,
  createConversionAction,
  updateConversionAction,
  removeConversionAction,
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
  createNegativeKeywordList,
  removeNegativeKeywordList,
  addKeywordToNegativeList,
  removeKeywordFromNegativeList,
  linkNegativeListToCampaign,
  unlinkNegativeListFromCampaign,
  createExperiment,
  addExperimentArms,
  scheduleExperiment,
  endExperiment,
  promoteExperiment,
  graduateExperiment,
  listExperimentAsyncErrors,
  createAdVariationExperiment,
  SUPPORTED_EXPERIMENT_TYPES,
} from "@/lib/google-ads";
import type { WriteResult, AuthContext, UpdateCampaignSettingsParams, BiddingStrategyType, GoalConfigLevel, PortfolioStrategyType, TargetImpressionShareLocation, BulkValidationIssue } from "@/lib/google-ads";
import { TARGET_IMPRESSION_SHARE_LOCATIONS } from "@/lib/google-ads";
import { logChange, getUndoableChange, markRolledBack, setGoals, getGoals } from "@/lib/db/tracking";
import { execWrite, execRead } from "@/lib/tools/execute";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import { typedResult, safeHandler, accountIdParam, READ_ANNOTATIONS, WRITE_ANNOTATIONS, DESTRUCTIVE_WRITE_ANNOTATIONS } from "./types";
import type { ToolRegistrar } from "./types";
import { resolveToolAuth } from "./helpers";

/**
 * Write tools that mutate Google Ads account state.
 * All tools include guardrails to prevent excessive changes.
 * All successful writes are logged to the changes table with a changeId for undo support.
 */

type BulkValidationWithInput<T> = BulkValidationIssue & { input: T };

/**
 * Stable JSON used as a Map key. Plain JSON.stringify preserves insertion
 * order, so two structurally identical objects built differently would
 * produce different strings and wouldn't collapse during validation-issue
 * grouping. Sort keys to make the dedup key canonical.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

function summarizeBulkValidationIssues<T>(issues: Array<BulkValidationWithInput<T>>) {
  const grouped = new Map<string, {
    code: string;
    severity: "error" | "warning";
    count: number;
    affectedIds: string[];
    affectedCriterionIds: string[];
    alternativeTool?: string;
    nextTool?: BulkValidationIssue["nextTool"];
    fix?: string;
    reason: string;
  }>();

  for (const issue of issues) {
    // Group by the routing-affecting fields. Two failures with the same
    // code+reason but different nextTool.args (different campaign/keyword)
    // are different failures — don't collapse them, or the agent loses the
    // per-row routing data.
    const key = [
      issue.code,
      issue.severity,
      issue.alternativeTool ?? "",
      issue.fix ?? "",
      issue.reason,
      issue.nextTool ? stableStringify(issue.nextTool) : "",
    ].join("|");
    const existing = grouped.get(key) ?? {
      code: issue.code,
      severity: issue.severity,
      count: 0,
      affectedIds: [],
      affectedCriterionIds: [],
      alternativeTool: issue.alternativeTool,
      nextTool: issue.nextTool,
      fix: issue.fix,
      reason: issue.reason,
    };
    existing.count += 1;
    existing.affectedIds.push(issue.id);
    if (issue.criterionId) existing.affectedCriterionIds.push(issue.criterionId);
    grouped.set(key, existing);
  }

  return [...grouped.values()].map((group) => ({
    code: group.code,
    severity: group.severity,
    count: group.count,
    affectedIds: group.affectedIds,
    ...(group.affectedCriterionIds.length > 0 ? { affectedCriterionIds: group.affectedCriterionIds } : {}),
    ...(group.alternativeTool ? { alternativeTool: group.alternativeTool } : {}),
    ...(group.nextTool ? { nextTool: group.nextTool } : {}),
    ...(group.fix ? { fix: group.fix } : {}),
    reason: group.reason,
  }));
}

function buildBulkValidationResponse<T>(
  reason: "PRE_VALIDATION_FAILED" | "DRY_RUN",
  total: number,
  validIds: string[],
  issues: Array<BulkValidationWithInput<T>>,
) {
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  return {
    executed: false,
    reason,
    summary: {
      total,
      wouldSucceed: validIds.length,
      wouldFail: blockingIssues.length,
    },
    errors: summarizeBulkValidationIssues(issues),
    wouldSucceedIds: validIds,
  };
}

function buildBulkSkipped<T>(issues: Array<BulkValidationWithInput<T>>) {
  return issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({
      id: issue.id,
      ...(issue.criterionId ? { criterionId: issue.criterionId } : {}),
      code: issue.code,
      reason: issue.reason,
      ...(issue.alternativeTool ? { alternativeTool: issue.alternativeTool } : {}),
      ...(issue.fix ? { fix: issue.fix } : {}),
    }));
}

export const registerWriteTools: ToolRegistrar = (server, currentAuth) => {
  // ─── Keyword Management ─────────────────────────────────────────

  server.registerTool("pauseKeyword", {
    description: "Pause a POSITIVE (active) keyword. Does NOT work on negative keywords — Google Ads has no 'pause' for negatives; call `removeNegativeKeyword` instead (and `addNegativeKeyword` to re-add later). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (query keyword_view via runScript)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, criterionId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => pauseKeyword(targetAuth, campaignId, adGroupId, criterionId));
    return typedResult(result);
  }));

  server.registerTool("enableKeyword", {
    description: "Re-enable a paused keyword. Only needs adGroupId + criterionId (no campaignId, unlike pauseKeyword). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (query keyword_view via runScript)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, adGroupId, criterionId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => enableKeyword(targetAuth, adGroupId, criterionId));
    return typedResult(result);
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
    return typedResult(result);
  }));

  // ─── Bid Management ─────────────────────────────────────────────

  server.registerTool("updateBid", {
    description: "Update a keyword's CPC bid. Only works with MANUAL_CPC or ENHANCED_CPC bidding. Capped at 25% change per adjustment. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (query keyword_view via runScript)"),
      newBidDollars: z.number().positive().describe("New bid in dollars (e.g. 1.50)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, criterionId, newBidDollars }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () =>
      updateBid(targetAuth, campaignId, adGroupId, criterionId, toMicros(newBidDollars)),
    );
    return typedResult(result);
  }));

  // ─── Negative Keywords ──────────────────────────────────────────

  server.registerTool("addNegativeKeyword", {
    description: "Add a negative keyword to a campaign. Also use this to re-enable a previously removed negative keyword (Google Ads has no 'enable' state for negatives). Returns changeId.",
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
    return typedResult(result);
  }));

  server.registerTool("removeNegativeKeyword", {
    description: "Remove a negative keyword from a campaign. This is the correct tool for 'pausing' or 'disabling' a negative keyword — Google Ads has no pause state for negatives, removing is the equivalent. To re-add later, call `addNegativeKeyword` with the same text and match type. If the same keyword text exists under multiple match types, specify matchType to remove the correct one. Returns changeId.",
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
    return typedResult(result);
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
    return typedResult(result);
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

    const t0 = performance.now();
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
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const writeResult: WriteResult = {
      success: createResult.success,
      action: "create_campaign",
      entityId: createResult.campaignId ?? "",
      beforeValue: "",
      afterValue: createResult.campaignName,
      error: createResult.error,
    };

    const logged = await execWrite(auth, targetId, createResult.campaignId ?? null, async () => writeResult, undefined, { overrideLatencyMs });

    return typedResult({
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    const t0 = performance.now();
    const writeResult = await setTrackingTemplate(authForAccount(auth, accountId), level, trackingTemplate, entityId);
    const overrideLatencyMs = Math.round(performance.now() - t0);
    const resolvedCampaignId = level === "campaign" ? (entityId ?? null) : (writeResult.campaignId ?? null);
    const result = await execWrite(auth, targetId, resolvedCampaignId, async () => writeResult, undefined, { overrideLatencyMs });
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
  }));

  // ─── Bulk Operations ────────────────────────────────────────────

  server.registerTool("bulkUpdateBids", {
    description: "Update up to 50 keyword bids in one call. Atomic by default: the server pre-validates every item and executes nothing if any item fails static checks. Set continueOnError=true to skip invalid items and update the valid subset. Set dryRun=true to validate only. Each bid capped at 25% change. Returns per-keyword results with individual changeIds when executed.",
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
      continueOnError: z
        .boolean()
        .default(false)
        .describe("If true, skip invalid items and execute the valid subset. If false, fail the whole batch before writing when any item fails pre-validation."),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, run pre-validation but do not execute. Returns wouldSucceedIds and structured errors/warnings."),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, updates, continueOnError, dryRun }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const t0 = performance.now();
    const targetAuth = authForAccount(auth, accountId);
    const validation = await preValidateBulkMutation(targetAuth, "update_bid", updates);
    const validUpdates = validation.valid.map((item) => item.input);

    if (dryRun) {
      return typedResult(buildBulkValidationResponse("DRY_RUN", updates.length, validation.valid.map((item) => item.id), validation.invalid));
    }
    if (!validation.ok && !continueOnError) {
      return typedResult(buildBulkValidationResponse("PRE_VALIDATION_FAILED", updates.length, validation.valid.map((item) => item.id), validation.invalid));
    }

    const results = validUpdates.length > 0 ? await bulkUpdateBids(targetAuth, validUpdates) : [];
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, input.campaignId, async () => result, undefined, { overrideLatencyMs })
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;
    const skipped = buildBulkSkipped(validation.invalid);

    return typedResult({
      executed: true,
      summary: continueOnError
        ? { total: updates.length, succeeded, skipped: skipped.length, failed }
        : { total: results.length, succeeded, failed },
      ...(skipped.length > 0 ? { skipped } : {}),
      ...(validation.invalid.some((issue) => issue.severity === "warning") ? { warnings: summarizeBulkValidationIssues(validation.invalid.filter((issue) => issue.severity === "warning")) } : {}),
      results: logged,
    });
  }));

  // ─── Bulk Keyword Operations ─────────────────────────────────────

  server.registerTool("bulkPauseKeywords", {
    description: "Pause up to 100 POSITIVE keywords in one call. Atomic by default: the server pre-validates every item and executes nothing if any item fails static checks. Does NOT work on negative keywords — for negatives, call `removeNegativeKeyword` or `removeKeywordFromNegativeList`; Google Ads has no 'pause' for negatives. Set continueOnError=true to skip invalid items and pause the valid subset. Set dryRun=true to validate only. Returns per-keyword results with individual changeIds when executed.",
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
      dryRun: z
        .boolean()
        .default(false)
        .describe("Validate and report what would happen without writing to Google Ads or logging changes."),
      continueOnError: z
        .boolean()
        .default(false)
        .describe("If true, skip invalid items and execute the valid subset. If false, fail the whole batch before writing when any item fails pre-validation."),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, keywords, dryRun, continueOnError }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const t0 = performance.now();
    const targetAuth = authForAccount(auth, accountId);
    const validation = await preValidateBulkMutation(targetAuth, "pause_keyword", keywords);
    const validKeywords = validation.valid.map((item) => item.input);

    if (dryRun) {
      return typedResult(buildBulkValidationResponse("DRY_RUN", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }
    if (!validation.ok && !continueOnError) {
      return typedResult(buildBulkValidationResponse("PRE_VALIDATION_FAILED", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }

    const results = validKeywords.length > 0 ? await bulkPauseKeywords(targetAuth, validKeywords) : [];
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, input.campaignId, async () => result, undefined, { overrideLatencyMs })
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;
    const skipped = buildBulkSkipped(validation.invalid);

    return typedResult({
      executed: true,
      summary: continueOnError
        ? { total: keywords.length, succeeded, skipped: skipped.length, failed }
        : { total: results.length, succeeded, failed },
      ...(skipped.length > 0 ? { skipped } : {}),
      results: logged,
    });
  }));

  server.registerTool("bulkAddKeywords", {
    description: "Add up to 100 keywords to an ad group in one call. Atomic by default: the server pre-validates every item and executes nothing if any keyword fails static checks such as duplicates, invalid syntax, removed parents, or negative-keyword conflicts. Set continueOnError=true to skip invalid items and add the valid subset. Set dryRun=true to validate only. Returns per-keyword results with individual changeIds when executed.",
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
      continueOnError: z
        .boolean()
        .default(false)
        .describe("If true, skip invalid items and execute the valid subset. If false, fail the whole batch before writing when any item fails pre-validation."),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, run pre-validation but do not execute. Returns wouldSucceedIds and structured errors/warnings."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, keywords, continueOnError, dryRun }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const t0 = performance.now();
    const targetAuth = authForAccount(auth, accountId);
    const validationInputs = keywords.map((keyword) => ({ ...keyword, campaignId, adGroupId }));
    const validation = await preValidateBulkMutation(targetAuth, "add_keyword", validationInputs);
    const validKeywords = validation.valid.map((item) => ({
      keyword: item.input.keyword,
      matchType: item.input.matchType,
    }));

    if (dryRun) {
      return typedResult(buildBulkValidationResponse("DRY_RUN", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }
    if (!validation.ok && !continueOnError) {
      return typedResult(buildBulkValidationResponse("PRE_VALIDATION_FAILED", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }

    const results = validKeywords.length > 0 ? await bulkAddKeywords(targetAuth, adGroupId, validKeywords) : [];
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, campaignId, async () => result, undefined, { overrideLatencyMs })
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;
    const skipped = buildBulkSkipped(validation.invalid);

    return typedResult({
      executed: true,
      summary: continueOnError
        ? { total: keywords.length, succeeded, skipped: skipped.length, failed }
        : { total: results.length, succeeded, failed },
      ...(skipped.length > 0 ? { skipped } : {}),
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
      criterionIds: z.array(z.string()).min(1).max(100).describe("Keyword criterion IDs (query keyword_view via runScript)"),
      matchType: z
        .enum(["BROAD", "PHRASE", "EXACT"])
        .optional()
        .describe("Override match type in destination — omit to inherit from source"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const t0 = performance.now();
    const result = await moveKeywords(authForAccount(auth, accountId), campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType);
    const overrideLatencyMs = Math.round(performance.now() - t0);

    // Route every result (success or failure) through execWrite so failures count toward the daily
    // limit — same overcount-preferred policy as every other write path.
    const addChangeIds = await Promise.all(
      result.added.map((r) =>
        execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs }),
      ),
    );
    const pauseChangeIds = await Promise.all(
      result.paused.map((r) =>
        execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs }),
      ),
    );

    return typedResult({
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
    return typedResult(result);
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
    return typedResult(result);
  }));

  // ─── Campaign Bidding Strategy ──────────────────────────────────

  server.registerTool("updateCampaignBidding", {
    description: "Update a campaign's bidding strategy. Supports: TARGET_CPA (set a target cost per acquisition), MAXIMIZE_CONVERSIONS (optionally with a target CPA cap), MAXIMIZE_CONVERSION_VALUE (maximize total conversion value, optionally with a target ROAS — required for PMAX value-based bidding), TARGET_ROAS (target return on ad spend), MAXIMIZE_CLICKS, MANUAL_CPC, TARGET_IMPRESSION_SHARE (presence-based — 'just win' on a given SERP position, ideal for brand campaigns). For TARGET_CPA, targetCpa is required (in dollars). For MAXIMIZE_CONVERSIONS, targetCpa is optional (acts as a cap). For TARGET_ROAS and MAXIMIZE_CONVERSION_VALUE, targetRoas is required/optional respectively (e.g. 2.0 = 200% ROAS). For TARGET_IMPRESSION_SHARE, impressionShareLocation, locationFraction, and cpcBidCeiling are all required — Google will not accept this strategy without all three. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      biddingStrategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "MAXIMIZE_CLICKS", "MANUAL_CPC", "TARGET_CPA", "TARGET_ROAS", "TARGET_IMPRESSION_SHARE"])
        .describe("The bidding strategy to set. Use MAXIMIZE_CONVERSION_VALUE for Performance Max campaigns optimizing for revenue/value. Use TARGET_IMPRESSION_SHARE for brand campaigns where 'just win the auction' matters more than per-conversion efficiency."),
      targetCpa: z.number().optional()
        .describe("Target CPA in dollars (e.g. 10.50 for $10.50). Required for TARGET_CPA, optional cap for MAXIMIZE_CONVERSIONS."),
      targetRoas: z.number().optional()
        .describe("Target ROAS as a multiplier (e.g. 2.0 = 200% return). Required for TARGET_ROAS, optional cap for MAXIMIZE_CONVERSION_VALUE."),
      impressionShareLocation: z.enum(TARGET_IMPRESSION_SHARE_LOCATIONS).optional()
        .describe("TARGET_IMPRESSION_SHARE only: where on the SERP to target. TOP_OF_PAGE = above organic results (most common for brand). ABSOLUTE_TOP_OF_PAGE = position 1. ANYWHERE_ON_PAGE = any paid slot."),
      locationFraction: z.number().min(0.01).max(1).optional()
        .describe("TARGET_IMPRESSION_SHARE only: the IS target as a fraction from 0.01 to 1.00 (e.g. 0.95 = 95%). Typical brand target is 0.90–0.95."),
      cpcBidCeiling: z.number().positive().optional()
        .describe("TARGET_IMPRESSION_SHARE only: max CPC bid cap in dollars (e.g. 2.00 = $2.00). Required — without a ceiling Google can bid unbounded to hit the IS target."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, biddingStrategy, targetCpa, targetRoas, impressionShareLocation, locationFraction, cpcBidCeiling }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    const logged = await execWrite(auth, targetId, campaignId, () =>
      updateCampaignBidding(authForAccount(auth, accountId), campaignId, {
        biddingStrategy: biddingStrategy as BiddingStrategyType,
        targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
        targetRoas,
        impressionShareLocation,
        locationFractionMicros: locationFraction != null ? Math.round(locationFraction * 1_000_000) : undefined,
        cpcBidCeilingMicros: cpcBidCeiling != null ? toMicros(cpcBidCeiling) : undefined,
      }),
    );

    return typedResult(logged);
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
    return typedResult(result);
  }));

  // ─── Campaign Settings ──────────────────────────────────────────

  server.registerTool("updateCampaignSettings", {
    description: "Update campaign network targeting, location targeting, and/or ad schedule. Networks: toggle Google Search, Search Partners, Display Network. Locations: add/remove geo targets (positive or negative) by geo target constant ID (e.g. '2840' for US, '200840' for Seattle-Tacoma DMA). Ad schedule: replace the entire schedule with a list of slots (use dayOfWeek 'ALL' as a shortcut for all 7 days; pass an empty array to clear the schedule and run 24/7). NOTE: If the campaign uses smart bidding (TARGET_CPA/TARGET_ROAS/MAXIMIZE_CONVERSIONS/MAXIMIZE_CONVERSION_VALUE), schedule restrictions are respected but can hurt performance by removing learning signal. Prefer 24/7 schedules unless you have strong evidence specific hours are unprofitable. Returns a changeId per mutation plus any warnings. Geo intent: set positiveGeoTargetType to PRESENCE (only people physically in the area) or PRESENCE_OR_INTEREST (default — also includes people searching for the area). Proximity: add radius-based targeting (5-mile circles) by lat/lng via proximityTargeting.add; remove by criterionId via proximityTargeting.remove (get criterionIds from getCampaignSettings or runScript).",
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
      adSchedule: z
        .object({
          set: z
            .array(
              z.object({
                dayOfWeek: z
                  .enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "ALL"])
                  .describe("Day of week, or 'ALL' to apply to all 7 days"),
                startHour: z.number().int().min(0).max(23).describe("Start hour (0-23)"),
                endHour: z.number().int().min(1).max(24).describe("End hour (1-24, exclusive)"),
                startMinute: z.enum(["ZERO", "FIFTEEN", "THIRTY", "FORTY_FIVE"]).optional().describe("Defaults to ZERO"),
                endMinute: z.enum(["ZERO", "FIFTEEN", "THIRTY", "FORTY_FIVE"]).optional().describe("Defaults to ZERO"),
              }),
            )
            .describe("Replace the entire ad schedule with these slots. Pass [] to clear (run 24/7)."),
        })
        .optional()
        .describe("Ad schedule (dayparting) — REPLACES the entire current schedule. For smart-bidding campaigns, non-24/7 schedules can reduce learning signal; the tool returns a SMART_BIDDING_SCHEDULE_RESTRICTION warning when detected."),
      positiveGeoTargetType: z
        .enum(["PRESENCE", "PRESENCE_OR_INTEREST"])
        .optional()
        .describe(
          "Who sees ads based on location intent. PRESENCE: only people physically in the targeted area. " +
          "PRESENCE_OR_INTEREST: people in OR interested in the area (Google default). " +
          "Use PRESENCE for purely local intent; use PRESENCE_OR_INTEREST for broader reach.",
        ),
      negativeGeoTargetType: z
        .enum(["PRESENCE", "PRESENCE_OR_INTEREST"])
        .optional()
        .describe(
          "Who is excluded based on excluded locations. PRESENCE: exclude people physically there. " +
          "PRESENCE_OR_INTEREST: exclude people in or interested in the excluded area.",
        ),
      proximityTargeting: z
        .object({
          add: z
            .array(
              z.object({
                latitudeMicroDegrees: z.number().int().min(-90_000_000).max(90_000_000).describe("Latitude in micro-degrees (degrees × 1,000,000). e.g. 47608013 for 47.608013° N"),
                longitudeMicroDegrees: z.number().int().min(-180_000_000).max(180_000_000).describe("Longitude in micro-degrees (degrees × 1,000,000). e.g. -122335167 for -122.335167° W"),
                radius: z.number().min(0.1).describe("Radius value, minimum 0.1. e.g. 5.0"),
                radiusUnits: z.enum(["MILES", "KILOMETERS"]).describe("Unit for the radius"),
                label: z.string().optional().describe("Optional human-readable label for logging, e.g. 'Downtown Seattle'"),
              }),
            )
            .optional()
            .describe("Proximity circles to add. Each defines a lat/lng center + radius."),
          remove: z
            .array(z.string())
            .optional()
            .describe("Criterion IDs of proximity targets to remove. Get IDs from getCampaignSettings or runScript on campaign_criterion WHERE type = 'PROXIMITY'."),
        })
        .optional()
        .describe("Radius-based proximity targeting — target people within N miles/km of a lat/lng point."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, networks, locationTargeting, negativeLocationTargeting, adSchedule, positiveGeoTargetType, negativeGeoTargetType, proximityTargeting }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    const params: UpdateCampaignSettingsParams = {};
    if (networks) params.networks = networks;
    if (locationTargeting) params.locationTargeting = locationTargeting;
    if (negativeLocationTargeting) params.negativeLocationTargeting = negativeLocationTargeting;
    if (adSchedule) params.adSchedule = adSchedule;
    if (positiveGeoTargetType) params.positiveGeoTargetType = positiveGeoTargetType;
    if (negativeGeoTargetType) params.negativeGeoTargetType = negativeGeoTargetType;
    if (proximityTargeting) params.proximityTargeting = proximityTargeting;

    const t0 = performance.now();
    const result = await updateCampaignSettings(authForAccount(auth, accountId), campaignId, params);
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      result.results.map((r) => execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs })),
    );

    return typedResult({
      success: result.success,
      error: result.error,
      warnings: result.warnings,
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
    return typedResult(result);
  }));

  server.registerTool("updateConversionAction", {
    description: "Update an existing conversion action's settings — promote secondary to primary, change value, rename. Call getConversionActions first and only pass IDs where `mutable: true`; conversion actions imported from GA4/UA/Floodlight/Firebase/Salesforce/Search Ads 360, Smart Campaign auto-actions, Store Visits, app-store actions, and manager-inherited actions are read-only via the API. To delete a conversion action, use removeConversionAction (status=REMOVED is not accepted by Google for updates). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      conversionActionId: z.string().describe("Conversion action ID (query conversion_action via runScript)"),
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
      status: z.enum(["ENABLED"]).optional()
        .describe("ENABLED = active. To delete, use removeConversionAction instead — Google rejects status=REMOVED on update."),
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
    return typedResult(result);
  }));

  server.registerTool("removeConversionAction", {
    description: "Permanently delete a conversion action. Not undoable. Use this instead of updateConversionAction with status=REMOVED — Google rejects that with request_error=18. Read-only conversion actions (GA4/UA/Floodlight imports, Smart Campaign auto-actions, manager-owned, etc.) cannot be removed via the API; modify them in the source system. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      conversionActionId: z.string().describe("Conversion action ID to permanently delete"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, conversionActionId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      removeConversionAction(targetAuth, conversionActionId),
    );
    return typedResult(result);
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

    const t0 = performance.now();
    const result = await uploadClickConversions(targetAuth, conversionActionId, conversions);
    const overrideLatencyMs = Math.round(performance.now() - t0);

    // Log as a write operation for tracking (execWrite handles rate limiting)
    if (result.successCount > 0) {
      const writeResult = {
        success: true,
        action: "upload_click_conversions",
        entityId: conversionActionId,
        beforeValue: "",
        afterValue: `${result.successCount} conversions`,
      };
      await execWrite(auth, targetId, null, async () => writeResult, undefined, { overrideLatencyMs });
    } else {
      // Still rate-limit even when no successes (prevents abuse via invalid uploads)
      await enforceRateLimit(auth.userId);
    }

    return typedResult(result);
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
    return typedResult({ success: true, ...result });
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
      return typedResult({
        source: "defaults",
        targetCpa: null,
        monthlyCap: null,
        maxBidChangePct: 0.25,
        maxBudgetChangePct: 0.50,
        maxKeywordPausePct: 0.30,
      });
    }
    return typedResult({
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
      assetGroupId: z.string().describe("Asset group ID to pause (query asset_group WHERE type = PERFORMANCE_MAX via runScript)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, assetGroupId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => pausePmaxAssetGroup(targetAuth, campaignId, assetGroupId));
    return typedResult(result);
  }));

  server.registerTool("enablePmaxAssetGroup", {
    description: "Re-enable a paused Performance Max asset group so it can serve ads again. Use getPmaxAssetGroups to find asset group IDs. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Performance Max campaign ID"),
      assetGroupId: z.string().describe("Asset group ID to enable (query asset_group WHERE type = PERFORMANCE_MAX via runScript)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, assetGroupId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => enablePmaxAssetGroup(targetAuth, campaignId, assetGroupId));
    return typedResult(result);
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
    const t0 = performance.now();
    const result = await updateCampaignLanguages(authForAccount(auth, accountId), campaignId, { add, remove });
    const overrideLatencyMs = Math.round(performance.now() - t0);
    const logged = await Promise.all(
      result.results.map((r) => execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs })),
    );
    return typedResult({ success: result.success, error: result.error, results: logged });
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
    return typedResult(result);
  }));

  server.registerTool("linkCalloutToAccount", {
    description: "Link an existing callout asset to the customer (account) level so it can serve across all campaigns. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      assetId: z.string().describe("Callout asset ID (query asset WHERE asset.type = CALLOUT via runScript)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, assetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => linkCalloutToAccount(targetAuth, assetId));
    return typedResult(result);
  }));

  server.registerTool("removeCalloutFromAccount", {
    description: "Remove a callout's account-level link. The underlying asset is preserved (assets are shared/immutable). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      assetId: z.string().describe("Callout asset ID (query asset WHERE asset.type = CALLOUT via runScript)"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, assetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => removeCalloutFromAccount(targetAuth, assetId));
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
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
    return typedResult(result);
  }));

  // ─── Negative Keyword Lists (Shared Sets) ──────────────────────────

  server.registerTool("createNegativeKeywordList", {
    description: "Create a shared negative keyword list. After creating, add keywords with addKeywordToNegativeList and link to campaigns with linkNegativeListToCampaign. Returns changeId + sharedSetId.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).max(255).describe("List name, e.g. 'Brand Negatives' or 'Competitor Terms'"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => createNegativeKeywordList(targetAuth, name));
    return typedResult(result);
  }));

  server.registerTool("removeNegativeKeywordList", {
    description: "Delete a shared negative keyword list. This also unlinks it from all campaigns. Permanent — cannot be undone. Use listNegativeKeywordLists to find the sharedSetId. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, sharedSetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => removeNegativeKeywordList(targetAuth, sharedSetId));
    return typedResult(result);
  }));

  server.registerTool("addKeywordToNegativeList", {
    description: "Add a keyword to a shared negative keyword list. The keyword will be blocked across all campaigns linked to this list. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
      keyword: z.string().min(1).describe("Keyword text to block"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("PHRASE").describe("Match type (default: PHRASE)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, sharedSetId, keyword, matchType }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => addKeywordToNegativeList(targetAuth, sharedSetId, keyword, matchType));
    return typedResult(result);
  }));

  server.registerTool("removeKeywordFromNegativeList", {
    description: "Remove a keyword from a shared negative keyword list. If the same keyword text exists under multiple match types, specify matchType to remove the correct one. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
      keyword: z.string().min(1).describe("Exact keyword text to remove"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).optional().describe("Match type to disambiguate"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, sharedSetId, keyword, matchType }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () => removeKeywordFromNegativeList(targetAuth, sharedSetId, keyword, matchType));
    return typedResult(result);
  }));

  server.registerTool("linkNegativeListToCampaign", {
    description: "Link a shared negative keyword list to a campaign. All keywords in the list will be blocked for this campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, sharedSetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => linkNegativeListToCampaign(targetAuth, campaignId, sharedSetId));
    return typedResult(result);
  }));

  server.registerTool("unlinkNegativeListFromCampaign", {
    description: "Unlink a shared negative keyword list from a campaign. The list's keywords will no longer be blocked for this campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, sharedSetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, campaignId, () => unlinkNegativeListFromCampaign(targetAuth, campaignId, sharedSetId));
    return typedResult(result);
  }));

  // ─── Experiments (Drafts & Trials) ──────────────────────────────
  //
  // Lifecycle: createExperiment → addExperimentArms → modify the returned
  // inDesignCampaigns[0] (e.g. updateCampaignBidding, updateAd, addKeyword)
  // → scheduleExperiment → listExperimentAsyncErrors (verify forking succeeded)
  // → run for ≥ 14 days → endExperiment | promoteExperiment | graduateExperiment.
  // Read the `adsagent://playbooks/run-experiment` resource for the full flow.

  server.registerTool("createExperiment", {
    description:
      "Create a Google Ads experiment in SETUP status. Step 1 of 5 — next call addExperimentArms with one control + one treatment arm. Type `SEARCH_CUSTOM` for general search experiments (compare ads/keywords/landing pages); `SEARCH_AUTOMATED_BIDDING_STRATEGY` to compare bidding strategies on the same campaign. The experiment doesn't serve traffic until scheduleExperiment is called. Returns experimentResourceName.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).max(1024).describe("Experiment name, unique under the customer."),
      type: z
        .enum(SUPPORTED_EXPERIMENT_TYPES)
        .describe("SEARCH_CUSTOM for ad/keyword/landing-page tests; SEARCH_AUTOMATED_BIDDING_STRATEGY to compare bidding strategies."),
      suffix: z
        .string()
        .max(64)
        .optional()
        .describe("String appended to the trial campaign name. Defaults to '[experiment]'."),
      description: z.string().max(2048).optional(),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("YYYY-MM-DD. Defaults to today (or campaign start, whichever is later)."),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("YYYY-MM-DD. Defaults to the base campaign's end date. Recommended: ≥14 days after start for stat significance."),
      syncEnabled: z
        .boolean()
        .optional()
        .describe("If true, edits to the base campaign also propagate into the trial. Immutable after creation."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, type, suffix, description, startDate, endDate, syncEnabled }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      createExperiment(targetAuth, { name, type, suffix, description, startDate, endDate, syncEnabled }),
    );
    return typedResult({
      ...result,
      nextSteps: result.success
        ? "Call addExperimentArms with one control arm (referencing the existing campaign you want to test) and one treatment arm (traffic_split must sum to 100). Then mutate the returned inDesignCampaigns[0] before scheduling."
        : undefined,
    });
  }));

  server.registerTool("addExperimentArms", {
    description:
      "Step 2 of 5. Create both arms (control + treatment) in ONE atomic call — Google forbids adding arms incrementally because traffic_split must sum to 100. The control arm references an existing campaign; the treatment arm has Google auto-spawn a trial campaign that you then mutate (returned as `inDesignCampaigns[0]`). Returns the trial campaign resource name(s) so the agent can apply the change under test BEFORE scheduling. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/)
        .describe("Resource name from createExperiment, e.g. 'customers/123/experiments/456'."),
      arms: z
        .array(
          z.object({
            name: z.string().min(1).max(1024),
            control: z.boolean().describe("Exactly one arm must be control=true."),
            trafficSplit: z
              .number()
              .int()
              .min(1)
              .max(99)
              .describe("Percent of traffic to this arm (1–99). All arms together must sum to 100."),
            campaignId: z
              .string()
              .optional()
              .describe("REQUIRED on the control arm: ID of the existing campaign you're comparing against. Omit on the treatment arm — Google auto-creates the trial."),
          }),
        )
        .min(2)
        .max(2)
        .describe("Provide both arms in one call. v1 supports exactly one control + one treatment (Google's current limit)."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName, arms }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      addExperimentArms(targetAuth, experimentResourceName, arms),
    );
    return typedResult({
      ...result,
      nextSteps: result.success && result.inDesignCampaigns.length > 0
        ? `Apply the change you want to test on the trial campaign(s): ${result.inDesignCampaigns.join(", ")}. For a bidding test, call updateCampaignBidding on the trial campaign ID. For an ad copy test, call createAd / updateAdAssets. THEN call scheduleExperiment.`
        : undefined,
    });
  }));

  server.registerTool("scheduleExperiment", {
    description:
      "Step 4 of 5. Kick off the experiment — Google forks the in-design (trial) campaign into a real serving campaign. Returns immediately with an operation name; forking happens asynchronously over a few seconds to a few minutes. ALWAYS follow up with `listExperimentAsyncErrors` to verify forking succeeded — async errors don't surface from this call. Status precondition: experiment must be SETUP. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/)
        .describe("Resource name of the experiment to schedule."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      scheduleExperiment(targetAuth, experimentResourceName),
    );
    return typedResult({
      ...result,
      nextSteps: result.success
        ? "Wait 30–60 seconds, then call listExperimentAsyncErrors with this experimentResourceName to confirm forking succeeded. After that, query experiment_arm + the trial campaign metrics via runScript to monitor performance."
        : undefined,
    });
  }));

  server.registerTool("listExperimentAsyncErrors", {
    description:
      "Read errors logged during the most recent scheduleExperiment or promoteExperiment long-running operation. An empty list means the LRO succeeded. A non-empty list means forking or promotion failed — usually a campaign-config issue (invalid budget, conflicting bidding strategy, missing conversion action). Call this after every scheduleExperiment / promoteExperiment.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
      pageSize: z.number().int().min(1).max(1000).default(100),
      pageToken: z.string().optional(),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName, pageSize, pageToken }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_experiment_async_errors", () =>
      listExperimentAsyncErrors(targetAuth, experimentResourceName, pageSize, pageToken),
    );
    return typedResult(result);
  }));

  server.registerTool("endExperiment", {
    description:
      "Stop a running experiment immediately, without waiting for the scheduled end date. The trial campaign keeps its current state but stops splitting traffic. Use when the test has produced enough data and you DON'T want to apply the changes back to the base campaign. Status precondition: experiment must be ENABLED, INITIATED, or HALTED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      endExperiment(targetAuth, experimentResourceName),
    );
    return typedResult(result);
  }));

  server.registerTool("promoteExperiment", {
    description:
      "Apply the treatment arm's changes back onto the base campaign and stop the trial. Long-running — like scheduleExperiment, returns immediately and you must follow up with `listExperimentAsyncErrors`. Use when the treatment is a clear winner and you want the base campaign to inherit the changes. Status precondition: experiment must be ENABLED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      promoteExperiment(targetAuth, experimentResourceName),
    );
    return typedResult({
      ...result,
      nextSteps: result.success
        ? "Wait 30–60 seconds, then call listExperimentAsyncErrors to confirm promotion succeeded. The base campaign now reflects the treatment changes."
        : undefined,
    });
  }));

  server.registerTool("createAdVariationExperiment", {
    description:
      "RSA-asset A/B test shortcut. Bundles createExperiment + addExperimentArms + asset patch on the trial RSA into ONE call. Use to A/B-test an RSA's headlines, descriptions, or final URL against the live version. Internally a SEARCH_CUSTOM experiment whose treatment-arm clone has its RSA patched — Google's verified API path for RSA A/B testing. The base RSA is cloned into a trial campaign; this tool patches the clone and leaves the experiment in SETUP — you call scheduleExperiment to begin serving. Required: at least one of `headlines`, `descriptions`, `finalUrl`. RSA assets are atomic — when patching copy, supply BOTH headlines AND descriptions (Google replaces the full asset set). Returns experimentResourceName, trialCampaignId, trialAdGroupId, trialAdId, and `readyToSchedule`. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).max(1024).describe("Experiment name, unique under the customer."),
      baseCampaignId: z.string().describe("Existing campaign ID containing the RSA you want to vary."),
      baseAdGroupId: z.string().describe("Ad group ID containing the base RSA."),
      baseAdId: z.string().describe("RSA ID to clone and vary. Must be a Responsive Search Ad."),
      headlines: z
        .array(
          z.object({
            text: z.string().min(1).max(30),
            pin: z.number().int().min(1).max(3).optional().describe("Pin to position 1, 2, or 3."),
          }),
        )
        .min(3)
        .max(15)
        .optional()
        .describe("Replacement headlines for the trial RSA (3–15, ≤30 chars). Omit to keep the original headlines."),
      descriptions: z
        .array(
          z.object({
            text: z.string().min(1).max(90),
            pin: z.number().int().min(1).max(2).optional().describe("Pin to position 1 or 2."),
          }),
        )
        .min(2)
        .max(4)
        .optional()
        .describe("Replacement descriptions for the trial RSA (2–4, ≤90 chars). Omit to keep originals. If you pass headlines you MUST also pass descriptions (RSA assets are atomic)."),
      finalUrl: z.string().url().optional().describe("Replacement landing page URL for the trial RSA."),
      treatmentTrafficSplit: z
        .number()
        .int()
        .min(1)
        .max(99)
        .default(50)
        .describe("Percent of traffic routed to the variation (1–99). Default 50 (50/50)."),
      suffix: z.string().max(64).optional().describe("Trial campaign name suffix. Defaults to '[ad-var]'."),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      description: z.string().max(2048).optional(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, baseCampaignId, baseAdGroupId, baseAdId, headlines, descriptions, finalUrl, treatmentTrafficSplit, suffix, startDate, endDate, description }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, baseCampaignId, () =>
      createAdVariationExperiment(targetAuth, {
        name, baseCampaignId, baseAdGroupId, baseAdId,
        headlines, descriptions, finalUrl,
        treatmentTrafficSplit, suffix, startDate, endDate, description,
      }),
    );
    return typedResult({
      ...result,
      nextSteps: result.readyToSchedule
        ? "Patch landed on the trial RSA. Call scheduleExperiment with this experimentResourceName to begin serving. Then wait 30–60s and call listExperimentAsyncErrors to confirm forking succeeded."
        : result.experimentResourceName
          ? "Partial success. Re-apply the asset patch with updateAdAssets / updateAdFinalUrl on the trial ad (use trialAdGroupId + trialAdId), or call endExperiment to discard."
          : undefined,
    });
  }));

  server.registerTool("graduateExperiment", {
    description:
      "Permanently fork the trial campaign into a standalone campaign that runs alongside the base. The agent only needs to supply the new budget — the trial campaign resource is resolved automatically. Use when both control and treatment are valuable and you want to keep them both running independently. Status precondition: experiment must be ENABLED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
      campaignBudgetResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/campaignBudgets\/[^/]+$/)
        .describe("Full resource name of the budget the standalone graduated campaign should use, e.g. 'customers/123/campaignBudgets/789'."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName, campaignBudgetResourceName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      graduateExperiment(targetAuth, experimentResourceName, campaignBudgetResourceName),
    );
    return typedResult(result);
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
      return typedResult({ success: false, error: check.error });
    }

    const { change } = check;
    const targetAuth = authForAccount(auth, accountId);

    const undoResult = await executeUndoForChange(targetAuth, change);

    if (undoResult.success) {
      await markRolledBack(changeId);
      await logChange({
        accountId: targetId,
        userId: auth.userId,
        campaignId: change.campaignId ?? null,
        writeResult: undoResult,
        reasoning: `Undo of change #${changeId} (${change.toolName})`,
        clientSource: auth.clientName,
      });
    }

    return typedResult({
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
        const prev = JSON.parse(beforeValue) as {
          strategy: string;
          targetCpaMicros: number | null;
          targetRoas: number | null;
          impressionShareLocation?: TargetImpressionShareLocation | null;
          locationFractionMicros?: number | null;
          cpcBidCeilingMicros?: number | null;
        };
        return updateCampaignBidding(auth, entityId, {
          biddingStrategy: prev.strategy as BiddingStrategyType,
          targetCpaMicros: prev.targetCpaMicros ?? undefined,
          targetRoas: prev.targetRoas ?? undefined,
          impressionShareLocation: prev.impressionShareLocation ?? undefined,
          locationFractionMicros: prev.locationFractionMicros ?? undefined,
          cpcBidCeilingMicros: prev.cpcBidCeilingMicros ?? undefined,
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
      // Undo creation via the canonical remove operation. Setting status=REMOVED
      // through update is rejected by Google (request_error=18).
      return removeConversionAction(auth, entityId);
    case "update_conversion_action": {
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous conversion action state not recorded" };
      try {
        const prev = JSON.parse(beforeValue) as Record<string, unknown>;
        // status=REMOVED is not settable via update — if the previous state was
        // REMOVED, restoring it requires the remove operation. ENABLED is the
        // only valid status mutation value, so coerce anything else to undefined
        // and the caller's status field stays unchanged.
        const prevStatus = typeof prev.status === "string" && prev.status === "ENABLED" ? "ENABLED" : undefined;
        return updateConversionAction(auth, {
          conversionActionId: entityId,
          name: prev.name as string | undefined,
          status: prevStatus,
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
    case "create_negative_keyword_list":
      return removeNegativeKeywordList(auth, entityId);
    case "remove_negative_keyword_list":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Negative keyword list removal is permanent and cannot be undone." };
    case "add_keyword_to_negative_list": {
      const [undoSetId, ...rest] = entityId.split(":");
      const undoKeyword = rest.join(":");
      const afterVal = change.afterValue ?? "";
      const pipeIdx = afterVal.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? afterVal.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : undefined;
      return removeKeywordFromNegativeList(auth, undoSetId, undoKeyword, undoMatchType);
    }
    case "remove_keyword_from_negative_list": {
      const [undoSetId, ...rest] = entityId.split(":");
      const undoKeyword = rest.join(":");
      const bv = change.beforeValue ?? "";
      const pipeIdx = bv.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? bv.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : "PHRASE";
      const undoText = pipeIdx > 0 ? bv.slice(0, pipeIdx) : undoKeyword;
      return addKeywordToNegativeList(auth, undoSetId, undoText, undoMatchType);
    }
    case "link_negative_list_to_campaign": {
      const [undoCampaignId, undoSetId] = entityId.split("~");
      return unlinkNegativeListFromCampaign(auth, undoCampaignId, undoSetId);
    }
    case "unlink_negative_list_from_campaign": {
      const [undoCampaignId, undoSetId] = entityId.split("~");
      return linkNegativeListToCampaign(auth, undoCampaignId, undoSetId);
    }
    case "create_experiment":
    case "add_experiment_arms":
    case "schedule_experiment":
    case "end_experiment":
    case "promote_experiment":
    case "graduate_experiment":
    case "create_ad_variation_experiment":
      // Experiment lifecycle transitions aren't safely reversible by undo:
      // schedule forks campaigns, promote rewrites the base, graduate splits
      // them off, end is already a terminal state. The natural inverse is
      // `endExperiment` — discard the experiment without applying changes.
      return {
        success: false,
        action: change.toolName,
        entityId,
        beforeValue,
        afterValue: beforeValue,
        error: `Experiment writes aren't reversible via undoChange. To discard a scheduled experiment without promoting/graduating, call endExperiment with the experimentResourceName.`,
      };
    default:
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: `Don't know how to undo "${change.toolName}"` };
  }
}
