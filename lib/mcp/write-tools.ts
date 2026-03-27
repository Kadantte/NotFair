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
  toMicros,
  authForAccount,
  resolveAccountId,
  createAdGroup,
  createAd,
  pauseAd,
  enableAd,
  updateAdFinalUrl,
  updateAdAssets,
  bulkUpdateBids,
} from "@/lib/google-ads";
import type { WriteResult, AuthContext } from "@/lib/google-ads";
import { logChange, getUndoableChange, markRolledBack } from "@/lib/db/tracking";
import { jsonResult, accountIdParam, WRITE_ANNOTATIONS } from "./types";
import type { ToolRegistrar } from "./types";

/**
 * Log a write result and return the response with changeId attached.
 * Never throws — if logging fails, the write result is returned without a changeId.
 */
async function logAndReturn(
  accountId: string,
  userId: string | null | undefined,
  campaignId: string | null,
  result: WriteResult,
  reasoning?: string,
) {
  if (!result.success) return { ...result, changeId: null };

  const change = await logChange(accountId, userId, campaignId, result, reasoning);
  return { ...result, changeId: change?.id ?? null };
}

/**
 * Write tools that mutate Google Ads account state.
 * All tools include guardrails to prevent excessive changes.
 * All successful writes are logged to the changes table with a changeId for undo support.
 */
export const registerWriteTools: ToolRegistrar = (server, currentAuth) => {
  // ─── Keyword Management ─────────────────────────────────────────

  server.registerTool("pauseKeyword", {
    title: "Pause Keyword",
    description:
      "Pause an active keyword to stop it from triggering ads. Use when a keyword is wasting spend with poor or no conversions. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      adGroupId: z.string().describe("Ad group ID containing the keyword"),
      criterionId: z.string().describe("Keyword criterion ID to pause"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, criterionId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await pauseKeyword(authForAccount(auth, accountId), campaignId, adGroupId, criterionId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("enableKeyword", {
    title: "Enable Keyword",
    description:
      "Re-enable a previously paused keyword so it can trigger ads again. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      adGroupId: z.string().describe("Ad group ID"),
      criterionId: z.string().describe("Keyword criterion ID to enable"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, adGroupId, criterionId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await enableKeyword(authForAccount(auth, accountId), adGroupId, criterionId);
    return jsonResult(await logAndReturn(targetId, auth.userId, null, result));
  });

  server.registerTool("addKeyword", {
    title: "Add Keyword",
    description:
      "Add a new keyword to an existing ad group. The keyword starts enabled. Use getKeywords to find the adGroupId. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID containing the ad group"),
      adGroupId: z.string().describe("Ad group ID to add the keyword to"),
      keyword: z.string().min(1).describe("Keyword text to add"),
      matchType: z
        .enum(["BROAD", "PHRASE", "EXACT"])
        .default("BROAD")
        .describe("Keyword match type (defaults to Broad)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, keyword, matchType }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await addKeyword(authForAccount(auth, accountId), adGroupId, keyword, matchType);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Bid Management ─────────────────────────────────────────────

  server.registerTool("updateBid", {
    title: "Update Keyword Bid",
    description:
      "Change the CPC bid for a keyword. Only works with MANUAL_CPC or ENHANCED_CPC bidding strategies. Bid change is limited to 25% per adjustment. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      adGroupId: z.string().describe("Ad group ID"),
      criterionId: z.string().describe("Keyword criterion ID"),
      newBidDollars: z
        .number()
        .positive()
        .describe("New bid amount in dollars (e.g. 1.50)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, criterionId, newBidDollars }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await updateBid(
      authForAccount(auth, accountId),
      campaignId,
      adGroupId,
      criterionId,
      toMicros(newBidDollars),
    );
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Negative Keywords ──────────────────────────────────────────

  server.registerTool("addNegativeKeyword", {
    title: "Add Negative Keyword",
    description:
      "Add a negative keyword (phrase match) to a campaign to block irrelevant search terms from triggering your ads. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      keyword: z
        .string()
        .min(1)
        .describe("Keyword text to add as negative (phrase match)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, keyword }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await addNegativeKeyword(authForAccount(auth, accountId), campaignId, keyword);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("removeNegativeKeyword", {
    title: "Remove Negative Keyword",
    description:
      "Remove a negative keyword from a campaign so those search terms can trigger your ads again. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      keyword: z
        .string()
        .min(1)
        .describe("The exact negative keyword text to remove"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ accountId, campaignId, keyword }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await removeNegativeKeyword(authForAccount(auth, accountId), campaignId, keyword);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Budget Management ──────────────────────────────────────────

  server.registerTool("updateCampaignBudget", {
    title: "Update Campaign Budget",
    description:
      "Change the daily budget for a campaign. Budget change is limited to 50% per adjustment with a minimum of $1/day. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      newDailyBudgetDollars: z
        .number()
        .positive()
        .describe("New daily budget in dollars (e.g. 25.00)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, newDailyBudgetDollars }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await updateCampaignBudget(
      authForAccount(auth, accountId),
      campaignId,
      toMicros(newDailyBudgetDollars),
    );
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Create Campaign ────────────────────────────────────────────

  server.registerTool("createCampaign", {
    title: "Create Search Campaign",
    description:
      "Create a complete Google Search campaign with budget, ad group, keywords, and a Responsive Search Ad. The campaign starts PAUSED — use enableCampaign to go live after reviewing. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1).describe("Name for the new campaign"),
      dailyBudgetDollars: z
        .number()
        .positive()
        .min(1)
        .describe("Daily budget in dollars (minimum $1)"),
      keywords: z
        .array(z.string().min(1))
        .min(1)
        .describe("Keywords to target (at least 1)"),
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
      finalUrl: z
        .string()
        .url()
        .describe("Landing page URL for the ads"),
      biddingStrategy: z
        .enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "MANUAL_CPC"])
        .default("MAXIMIZE_CONVERSIONS")
        .describe("Bidding strategy (defaults to Maximize Conversions)"),
      keywordMatchType: z
        .enum(["BROAD", "PHRASE", "EXACT"])
        .default("BROAD")
        .describe("Match type for all keywords (defaults to Broad)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignName, dailyBudgetDollars, keywords, headlines, descriptions, finalUrl, biddingStrategy, keywordMatchType }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await createSearchCampaign(authForAccount(auth, accountId), {
      campaignName,
      dailyBudgetDollars,
      keywords,
      headlines,
      descriptions,
      finalUrl,
      biddingStrategy,
      keywordMatchType,
    });

    // Adapt to WriteResult for change logging
    const writeResult: WriteResult = {
      success: result.success,
      action: "create_campaign",
      entityId: result.campaignId ?? "",
      beforeValue: "",
      afterValue: result.campaignName,
      error: result.error,
    };

    const logged = await logAndReturn(targetId, auth.userId, result.campaignId ?? null, writeResult);

    // Return full details for the LLM
    return jsonResult({
      ...result,
      changeId: logged.changeId,
      status: result.success ? "PAUSED" : undefined,
      nextSteps: result.success
        ? "Campaign created as PAUSED. Review settings in Google Ads, then use enableCampaign to start running ads."
        : undefined,
    });
  });

  // ─── Campaign Status ────────────────────────────────────────────

  server.registerTool("pauseCampaign", {
    title: "Pause Campaign",
    description:
      "Pause an active campaign to stop all ads in the campaign from running. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID to pause"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ accountId, campaignId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await pauseCampaign(authForAccount(auth, accountId), campaignId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("enableCampaign", {
    title: "Enable Campaign",
    description:
      "Re-enable a paused campaign to resume all ads. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID to enable"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await enableCampaign(authForAccount(auth, accountId), campaignId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Tracking Templates ─────────────────────────────────────────

  server.registerTool("setTrackingTemplate", {
    title: "Set Tracking Template",
    description:
      "Set or clear the tracking template (click-tracking URL suffix) at the account, campaign, ad group, or ad level. Templates use ValueTrack parameters like {lpurl} for the landing page URL. Pass an empty string to remove the template. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      level: z
        .enum(["account", "campaign", "ad_group", "ad"])
        .describe("The level at which to set the tracking template"),
      entityId: z
        .string()
        .optional()
        .describe("Required for campaign (campaignId), ad_group (adGroupId), and ad (adId) levels. Not needed for account level."),
      trackingTemplate: z
        .string()
        .describe("The tracking template URL (e.g. '{lpurl}?utm_source=google&utm_medium=cpc'). Pass an empty string to remove the template."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, level, entityId, trackingTemplate }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await setTrackingTemplate(authForAccount(auth, accountId), level, trackingTemplate, entityId);
    // campaignId: direct for campaign level; resolved from prefetch for ad_group/ad; null for account
    const campaignId = level === "campaign" ? (entityId ?? null) : (result.campaignId ?? null);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Ad Group Management ────────────────────────────────────────

  server.registerTool("createAdGroup", {
    title: "Create Ad Group",
    description:
      "Create a new ad group within an existing campaign. Use listAdGroups to see existing structure. The ad group starts enabled. Use createAd to add a Responsive Search Ad to the new group.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID to add the ad group to"),
      adGroupName: z.string().min(1).describe("Name for the new ad group"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupName }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await createAdGroup(authForAccount(auth, accountId), campaignId, adGroupName);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Ad Management ──────────────────────────────────────────────

  server.registerTool("createAd", {
    title: "Create Responsive Search Ad",
    description:
      "Create a new Responsive Search Ad (RSA) in an existing ad group. Requires 3-15 headlines (max 30 chars each) and 2-4 descriptions (max 90 chars each). Use listAdGroups to find the adGroupId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (used for logging/undo tracking)"),
      adGroupId: z.string().describe("Ad group ID to add the ad to"),
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
      finalUrl: z.string().url().describe("Landing page URL for the ad"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, headlines, descriptions, finalUrl }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await createAd(authForAccount(auth, accountId), adGroupId, { headlines, descriptions, finalUrl });
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("pauseAd", {
    title: "Pause Ad",
    description:
      "Pause an active ad to stop it from serving. Use for A/B testing or when an ad has poor performance. Use listAds to find adGroupId and adId. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string().describe("Ad group ID"),
      adId: z.string().describe("Ad ID to pause"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, adId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await pauseAd(authForAccount(auth, accountId), adGroupId, adId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("enableAd", {
    title: "Enable Ad",
    description:
      "Re-enable a paused ad so it can serve again. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string().describe("Ad group ID"),
      adId: z.string().describe("Ad ID to enable"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, adId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await enableAd(authForAccount(auth, accountId), adGroupId, adId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("updateAdFinalUrl", {
    title: "Update Ad Final URL",
    description:
      "Update the landing page URL for a specific ad. Use listAds to find adGroupId and adId and see current URLs. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string().describe("Ad group ID"),
      adId: z.string().describe("Ad ID to update"),
      finalUrl: z.string().url().describe("New landing page URL"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, adId, finalUrl }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await updateAdFinalUrl(authForAccount(auth, accountId), adGroupId, adId, finalUrl);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("updateAdAssets", {
    title: "Update Ad Headlines & Descriptions",
    description:
      "Replace the headlines and descriptions for a Responsive Search Ad. You must provide the COMPLETE list — this replaces all existing assets. Headlines: 3-15, max 30 chars each. Descriptions: 2-4, max 90 chars each. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string().describe("Ad group ID"),
      adId: z.string().describe("Ad ID to update"),
      headlines: z
        .array(z.string().min(1).max(30))
        .min(3)
        .max(15)
        .describe("Complete replacement headlines (3-15, max 30 chars each)"),
      descriptions: z
        .array(z.string().min(1).max(90))
        .min(2)
        .max(4)
        .describe("Complete replacement descriptions (2-4, max 90 chars each)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, adId, headlines, descriptions }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await updateAdAssets(authForAccount(auth, accountId), adGroupId, adId, { headlines, descriptions });
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Bulk Operations ────────────────────────────────────────────

  server.registerTool("bulkUpdateBids", {
    title: "Bulk Update Keyword Bids",
    description:
      "Update multiple keyword bids in a single call. Each bid is subject to the same 25% guardrail as updateBid. Returns per-keyword results with individual changeIds for undo. Use getKeywords to find criterionIds.",
    inputSchema: {
      accountId: accountIdParam,
      updates: z
        .array(
          z.object({
            campaignId: z.string().describe("Campaign ID"),
            adGroupId: z.string().describe("Ad group ID"),
            criterionId: z.string().describe("Keyword criterion ID"),
            newBidDollars: z.number().positive().describe("New bid in dollars"),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of bid updates (max 50)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, updates }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const results = await bulkUpdateBids(authForAccount(auth, accountId), updates);

    // Log each successful bid change individually so they can each be undone
    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        logAndReturn(targetId, auth.userId, input.campaignId, result)
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;

    return jsonResult({
      summary: { total: results.length, succeeded, failed },
      results: logged,
    });
  });

  // ─── Undo ───────────────────────────────────────────────────────

  server.registerTool("undoChange", {
    title: "Undo Change",
    description:
      "Undo a previous write operation by its changeId. Restores the entity to its state before the change was made. Only works within 7 days and if the entity hasn't been modified since. Use getChanges to find changeIds.",
    inputSchema: {
      accountId: accountIdParam,
      changeId: z.number().int().positive().describe("The changeId returned by the original write operation"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ accountId, changeId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    // Validate the change is undoable
    const check = await getUndoableChange(targetId, changeId);
    if ("error" in check) {
      return jsonResult({ success: false, error: check.error });
    }

    const { change } = check;
    const targetAuth = authForAccount(auth, accountId);

    const undoResult = await executeUndoForChange(targetAuth, change);

    if (undoResult.success) {
      await markRolledBack(changeId);
      await logChange(targetId, auth.userId, change.campaignId ?? null, undoResult, `Undo of change #${changeId} (${change.toolName})`);
    }

    return jsonResult({
      ...undoResult,
      undoneChangeId: changeId,
      originalAction: change.toolName,
    });
  });
};

// ─── Undo Helpers ─────────────────────────────────────────────────

/** Look up a keyword's adGroupId and campaignId by criterionId. */
async function findKeywordContext(
  auth: AuthContext,
  criterionId: string,
): Promise<{ adGroupId: string; campaignId: string } | null> {
  const customer = getCustomer(auth);

  const result = await customer.query(`
    SELECT ad_group.id, campaign.id
    FROM keyword_view
    WHERE ad_group_criterion.criterion_id = ${Number(criterionId)}
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
  // Bypass guardrails for undo
  return updateBid(auth, ctx.campaignId, ctx.adGroupId, criterionId, previousBidMicros, {
    maxBidChangePct: 1.0,
    maxBudgetChangePct: 1.0,
    maxKeywordPausePct: 1.0,
  });
}

/** Execute the reverse operation for a change record. Used by both MCP undoChange and the dashboard undo action. */
export async function executeUndoForChange(
  auth: AuthContext,
  change: { toolName: string; entityId: string | null; campaignId: string | null; beforeValue: string | null },
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
      // beforeValue holds the adGroupId saved at creation time
      if (!beforeValue) return { success: false, action: "remove_keyword", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: missing adGroupId" };
      return removeKeyword(auth, beforeValue, entityId);
    }
    case "remove_keyword": {
      // Not generally undoable — we'd need keyword text + match type
      return { success: false, action: "add_keyword", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo keyword removal (keyword text not stored)" };
    }
    case "add_negative_keyword":
      return removeNegativeKeyword(auth, change.campaignId ?? "", entityId);
    case "remove_negative_keyword":
      return addNegativeKeyword(auth, change.campaignId ?? "", entityId);
    case "pause_campaign":
      return enableCampaign(auth, entityId);
    case "enable_campaign":
      return pauseCampaign(auth, entityId);
    case "create_campaign":
      return removeCampaign(auth, entityId);
    case "set_tracking_template": {
      const { level, entityId: actualId } = decodeTrackingEntityId(entityId);
      return setTrackingTemplate(auth, level, beforeValue, actualId);
    }
    case "create_ad_group":
      // Ad group removal is complex and potentially destructive — not supported
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo ad group creation (would require removing all ads and keywords inside it)" };
    case "create_ad":
      // entityId = adId, beforeValue = adGroupId
      return pauseAd(auth, beforeValue, entityId);
    case "pause_ad":
      // entityId = adId, beforeValue = adGroupId
      return enableAd(auth, beforeValue, entityId);
    case "enable_ad":
      // entityId = adId, beforeValue = adGroupId
      return pauseAd(auth, beforeValue, entityId);
    case "update_ad_final_url": {
      // entityId = adGroupId~adId, beforeValue = old URL
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
      // entityId = adGroupId~adId, beforeValue = JSON {h: [], d: []}
      const [adGroupIdPart, adIdPart] = entityId.split("~");
      if (!adGroupIdPart || !adIdPart) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: malformed entity ID" };
      }
      if (!beforeValue) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous assets were not recorded" };
      }
      try {
        const prev = JSON.parse(beforeValue) as { h: string[]; d: string[] };
        return updateAdAssets(auth, adGroupIdPart, adIdPart, { headlines: prev.h, descriptions: prev.d });
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: could not parse previous asset state" };
      }
    }
    default:
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: `Don't know how to undo "${change.toolName}"` };
  }
}
