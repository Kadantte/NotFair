import { z } from "zod";
import {
  pauseKeyword,
  enableKeyword,
  updateBid,
  addNegativeKeyword,
  removeNegativeKeyword,
  updateCampaignBudget,
  pauseCampaign,
  enableCampaign,
  removeCampaign,
  createSearchCampaign,
  getCustomer,
  toMicros,
  authForAccount,
  resolveAccountId,
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
  campaignId: string | null,
  result: WriteResult,
  reasoning?: string,
) {
  if (!result.success) return { ...result, changeId: null };

  const change = await logChange(accountId, campaignId, result, reasoning);
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
    return jsonResult(await logAndReturn(targetId, campaignId, result));
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
    return jsonResult(await logAndReturn(targetId, null, result));
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
    return jsonResult(await logAndReturn(targetId, campaignId, result));
  });

  // ─── Negative Keywords ──────────────────────────────────────────

  server.registerTool("addNegativeKeyword", {
    title: "Add Negative Keyword",
    description:
      "Add a negative keyword (phrase match) to a campaign to block irrelevant search terms from triggering your ads. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      keywordText: z
        .string()
        .min(1)
        .describe("Keyword text to add as negative (phrase match)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, keywordText }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await addNegativeKeyword(authForAccount(auth, accountId), campaignId, keywordText);
    return jsonResult(await logAndReturn(targetId, campaignId, result));
  });

  server.registerTool("removeNegativeKeyword", {
    title: "Remove Negative Keyword",
    description:
      "Remove a negative keyword from a campaign so those search terms can trigger your ads again. Returns a changeId that can be used with undoChange.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID"),
      keywordText: z
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
  }, async ({ accountId, campaignId, keywordText }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const result = await removeNegativeKeyword(authForAccount(auth, accountId), campaignId, keywordText);
    return jsonResult(await logAndReturn(targetId, campaignId, result));
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
    return jsonResult(await logAndReturn(targetId, campaignId, result));
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

    const logged = await logAndReturn(targetId, result.campaignId ?? null, writeResult);

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
    return jsonResult(await logAndReturn(targetId, campaignId, result));
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
    return jsonResult(await logAndReturn(targetId, campaignId, result));
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
      await logChange(targetId, change.campaignId, undoResult, `Undo of change #${changeId} (${change.toolName})`);
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
    default:
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: `Don't know how to undo "${change.toolName}"` };
  }
}
