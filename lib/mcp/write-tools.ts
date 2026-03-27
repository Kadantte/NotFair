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
    let undoResult: WriteResult;

    const targetAuth = authForAccount(auth, accountId);

    switch (change.toolName) {
      case "pause_keyword":
        undoResult = await findAndEnableKeyword(targetAuth, change.entityId);
        break;
      case "enable_keyword":
        undoResult = await findAndPauseKeyword(targetAuth, change.entityId);
        break;
      case "update_bid":
        undoResult = await findAndUpdateBid(targetAuth, change.entityId, Number(change.beforeValue));
        break;
      case "update_budget":
        // Bypass guardrails for undo — restore to exact previous value
        undoResult = await updateCampaignBudget(targetAuth, change.entityId, Number(change.beforeValue), { maxBidChangePct: 1.0, maxBudgetChangePct: 1.0, maxKeywordPausePct: 1.0 });
        break;
      case "add_negative_keyword":
        undoResult = await removeNegativeKeyword(targetAuth, change.campaignId ?? "", change.entityId);
        break;
      case "remove_negative_keyword":
        undoResult = await addNegativeKeyword(targetAuth, change.campaignId ?? "", change.entityId);
        break;
      case "pause_campaign":
        undoResult = await enableCampaign(targetAuth, change.entityId);
        break;
      case "enable_campaign":
        undoResult = await pauseCampaign(targetAuth, change.entityId);
        break;
      default:
        return jsonResult({ success: false, error: `Don't know how to undo "${change.toolName}"` });
    }

    if (undoResult.success) {
      await markRolledBack(changeId);
      // Log the undo itself as a new change entry for audit trail
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
  change: { toolName: string; entityId: string; campaignId: string | null; beforeValue: string },
): Promise<WriteResult> {
  switch (change.toolName) {
    case "pause_keyword":
      return findAndEnableKeyword(auth, change.entityId);
    case "enable_keyword":
      return findAndPauseKeyword(auth, change.entityId);
    case "update_bid":
      return findAndUpdateBid(auth, change.entityId, Number(change.beforeValue));
    case "update_budget":
      return updateCampaignBudget(auth, change.entityId, Number(change.beforeValue), { maxBidChangePct: 1.0, maxBudgetChangePct: 1.0, maxKeywordPausePct: 1.0 });
    case "add_negative_keyword":
      return removeNegativeKeyword(auth, change.campaignId ?? "", change.entityId);
    case "remove_negative_keyword":
      return addNegativeKeyword(auth, change.campaignId ?? "", change.entityId);
    case "pause_campaign":
      return enableCampaign(auth, change.entityId);
    case "enable_campaign":
      return pauseCampaign(auth, change.entityId);
    default:
      return { success: false, action: change.toolName, entityId: change.entityId, beforeValue: change.beforeValue, afterValue: change.beforeValue, error: `Don't know how to undo "${change.toolName}"` };
  }
}
