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
  invalidateCache,
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

  // Invalidate read cache for this account after successful mutation
  invalidateCache(accountId);

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
    description: "Pause an active keyword. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (from getKeywords)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, criterionId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await pauseKeyword(authForAccount(auth, accountId), campaignId, adGroupId, criterionId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("enableKeyword", {
    description: "Re-enable a paused keyword. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (from getKeywords)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, adGroupId, criterionId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await enableKeyword(authForAccount(auth, accountId), adGroupId, criterionId);
    return jsonResult(await logAndReturn(targetId, auth.userId, null, result));
  });

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
  }, async ({ accountId, campaignId, adGroupId, keyword, matchType }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await addKeyword(authForAccount(auth, accountId), adGroupId, keyword, matchType);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

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
    description: "Add a phrase-match negative keyword to a campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      keyword: z.string().min(1).describe("Keyword text to block (added as phrase match)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, keyword }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await addNegativeKeyword(authForAccount(auth, accountId), campaignId, keyword);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("removeNegativeKeyword", {
    description: "Remove a negative keyword from a campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      keyword: z.string().min(1).describe("Exact negative keyword text to remove"),
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
    description: "Update a campaign's daily budget. Capped at 50% change per adjustment, minimum $1/day. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      newDailyBudgetDollars: z.number().positive().describe("New daily budget in dollars (e.g. 25.00)"),
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
  }, async ({ accountId, campaignId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await pauseCampaign(authForAccount(auth, accountId), campaignId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("enableCampaign", {
    description: "Re-enable a paused campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
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
    description: "Set or clear the click-tracking URL suffix at the account, campaign, ad group, or ad level. Uses ValueTrack parameters. Pass empty string to clear. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      level: z.enum(["account", "campaign", "ad_group", "ad"]),
      entityId: z
        .string()
        .optional()
        .describe("Required for campaign, ad_group, and ad levels; omit for account level"),
      trackingTemplate: z
        .string()
        .describe("Tracking URL template (e.g. '{lpurl}?utm_source=google&utm_medium=cpc'). Empty string to remove."),
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
    description: "Create an ad group in a campaign (starts enabled). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupName: z.string().min(1),
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
  }, async ({ accountId, campaignId, adGroupId, headlines, descriptions, finalUrl }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await createAd(authForAccount(auth, accountId), adGroupId, { headlines, descriptions, finalUrl });
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("pauseAd", {
    description: "Pause an active ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, adId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await pauseAd(authForAccount(auth, accountId), adGroupId, adId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("enableAd", {
    description: "Re-enable a paused ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, adId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await enableAd(authForAccount(auth, accountId), adGroupId, adId);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

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
  }, async ({ accountId, campaignId, adGroupId, adId, finalUrl }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await updateAdFinalUrl(authForAccount(auth, accountId), adGroupId, adId, finalUrl);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

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
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, adId, headlines, descriptions }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await updateAdAssets(authForAccount(auth, accountId), adGroupId, adId, { headlines, descriptions });
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

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
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, keywords }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const results = await bulkPauseKeywords(authForAccount(auth, accountId), keywords);

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
  }, async ({ accountId, campaignId, adGroupId, keywords }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const results = await bulkAddKeywords(authForAccount(auth, accountId), adGroupId, keywords);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        logAndReturn(targetId, auth.userId, campaignId, result)
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

  // ─── Move Keywords ─────────────────────────────────────────────────

  server.registerTool("moveKeywords", {
    description: "Move keywords between ad groups in the same campaign. Adds to destination first, then pauses in source only if all adds succeed — rolls back on partial failure. Returns changeIds for both adds and pauses.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      fromAdGroupId: z.string(),
      toAdGroupId: z.string(),
      criterionIds: z.array(z.string()).min(1).max(100).describe("Keyword criterion IDs (from getKeywords)"),
      matchType: z
        .enum(["BROAD", "PHRASE", "EXACT"])
        .default("PHRASE")
        .describe("Match type in destination — does not inherit from source"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await moveKeywords(authForAccount(auth, accountId), campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType);

    // Log all individual add and pause results
    const addChangeIds = await Promise.all(
      result.added.filter((r) => r.success).map((r) =>
        logAndReturn(targetId, auth.userId, campaignId, r),
      ),
    );
    const pauseChangeIds = await Promise.all(
      result.paused.filter((r) => r.success).map((r) =>
        logAndReturn(targetId, auth.userId, campaignId, r),
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
  });

  // ─── Rename Campaign / Ad Group ────────────────────────────────────

  server.registerTool("renameCampaign", {
    description: "Rename a campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      newName: z.string().min(1),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, newName }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await renameCampaign(authForAccount(auth, accountId), campaignId, newName);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  server.registerTool("renameAdGroup", {
    description: "Rename an ad group. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      newName: z.string().min(1),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, adGroupId, newName }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await renameAdGroup(authForAccount(auth, accountId), campaignId, adGroupId, newName);
    return jsonResult(await logAndReturn(targetId, auth.userId, campaignId, result));
  });

  // ─── Undo ───────────────────────────────────────────────────────

  server.registerTool("undoChange", {
    description: "Undo a previous write operation by changeId. Only works within 7 days and if the entity hasn't been modified since.",
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
      // entityId = adGroupId~adId, beforeValue = JSON {h: AdAsset[], d: AdAsset[]} (or legacy {h: string[], d: string[]})
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
    case "rename_campaign":
      // entityId = campaignId, beforeValue = old name
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous name was not recorded" };
      return renameCampaign(auth, entityId, beforeValue);
    case "rename_ad_group":
      // entityId = adGroupId, beforeValue = old name, campaignId from change record
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous name was not recorded" };
      return renameAdGroup(auth, change.campaignId ?? "", entityId, beforeValue);
    default:
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: `Don't know how to undo "${change.toolName}"` };
  }
}
