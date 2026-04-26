/**
 * Recommendation → ToolCall dispatcher.
 *
 * Pure functions (no DB, no network, no I/O). Given a structured audit
 * recommendation, emit the exact MCP write tool name + args needed to execute
 * it AND the inverse ToolCall to undo it. The apply route is the only place
 * that calls these — it then hands the ToolCall to `execWrite()` and stores
 * the undo ToolCall in `audit_applies.undo_tool_call` so the Undo button can
 * replay it.
 *
 * Why split this from `lib/audit/scoring.ts`:
 * - scoring.ts produces `PassItem` (the audit pipeline output). This file
 *   defines a strictly richer `Recommendation` shape that adds the fields
 *   needed for budget/bid (current vs proposed amounts, criterionId for bids,
 *   adId for ad pauses). PassItem is the wire format; Recommendation is the
 *   apply contract.
 * - Keeping the dispatcher pure means it's unit-testable without spinning up
 *   the audit pipeline. Step 3 of the audit-apply plan exercises every branch
 *   here against golden fixtures.
 */

// ─── Public types ─────────────────────────────────────────────────────

export type RecommendationActionType =
  | "pause_campaign"
  | "pause_keyword"
  | "add_negative"
  | "pause_ad"
  | "update_budget"
  | "update_bid";

/**
 * Whitelist of action types we know how to dispatch. Adding a new actionType
 * to scoring.ts WITHOUT adding it here is intentional defense-in-depth: the
 * apply route refuses anything not on this list, so a typo or future-action
 * leak in the audit pipeline can't trigger an unintended write.
 */
export const DISPATCHABLE_ACTION_TYPES: ReadonlySet<RecommendationActionType> = new Set([
  "pause_campaign",
  "pause_keyword",
  "add_negative",
  "pause_ad",
  "update_budget",
  "update_bid",
]);

/**
 * The full apply contract. Every field is optional because different action
 * types need different subsets — `dispatchRecommendation()` validates the
 * required-field combination per actionType and refuses with a structured
 * error if anything load-bearing is missing.
 */
export type Recommendation = {
  actionType: RecommendationActionType;

  // Common targeting
  campaignId?: string;
  adGroupId?: string;
  criterionId?: string; // keyword criterion ID for pause_keyword / update_bid
  adId?: string;        // for pause_ad

  // Negative keyword payload
  keyword?: string;     // negative keyword text
  matchType?: "BROAD" | "PHRASE" | "EXACT";

  // Budget / bid payload — dollars at the dispatcher boundary because the MCP
  // write tools accept dollars (newDailyBudgetDollars / newBidDollars). We
  // also carry the current value so we can build the undo ToolCall.
  currentDailyBudgetDollars?: number;
  proposedDailyBudgetDollars?: number;
  currentBidDollars?: number;
  proposedBidDollars?: number;
};

export type ToolCall = {
  /** MCP write tool name — e.g. "pauseCampaign". Caller adds accountId. */
  tool: string;
  /** Args that go alongside accountId. Match the tool's input schema exactly. */
  args: Record<string, unknown>;
};

export type DispatchError =
  | { kind: "unknown_action_type"; actionType: string }
  | { kind: "missing_field"; actionType: RecommendationActionType; field: string }
  | { kind: "invalid_value"; actionType: RecommendationActionType; field: string; reason: string };

export type DispatchResult =
  | { ok: true; toolCall: ToolCall; undoToolCall: ToolCall }
  | { ok: false; error: DispatchError };

// ─── Reversibility ────────────────────────────────────────────────────

/**
 * Every dispatchable action is reversible — that's the whole point of the
 * apply→undo loop. Pauses have explicit enable counterparts, negatives
 * round-trip via add/remove, and budget/bid undo by restoring the captured
 * "current" value. If a future action type can't be reversed, do NOT add it
 * to DISPATCHABLE_ACTION_TYPES — the apply route refuses anything outside
 * the whitelist.
 */
export function isDispatchable(actionType: string): actionType is RecommendationActionType {
  return DISPATCHABLE_ACTION_TYPES.has(actionType as RecommendationActionType);
}

// ─── Dispatcher ───────────────────────────────────────────────────────

/**
 * Map a Recommendation to {toolCall, undoToolCall}. Pure function — no DB,
 * no network. Returns a structured error object on validation failure rather
 * than throwing, so the apply route can render specific user-facing messages
 * (e.g. "missing campaignId" vs "unknown action type").
 *
 * Argument names below MUST match the registered MCP tool input schemas in
 * `lib/mcp/write-tools.ts`. If a tool's args change, this dispatcher needs
 * to change in lockstep — the unit tests in `__tests__/audit-recommendations-apply.test.ts`
 * compare against golden ToolCall shapes for exactly this reason.
 */
export function dispatchRecommendation(rec: Recommendation): DispatchResult {
  if (!isDispatchable(rec.actionType)) {
    return { ok: false, error: { kind: "unknown_action_type", actionType: rec.actionType } };
  }

  switch (rec.actionType) {
    case "pause_campaign": {
      const missing = requireFields(rec, ["campaignId"]);
      if (missing) return missing;
      return ok(
        { tool: "pauseCampaign", args: { campaignId: rec.campaignId } },
        { tool: "enableCampaign", args: { campaignId: rec.campaignId } },
      );
    }

    case "pause_keyword": {
      const missing = requireFields(rec, ["campaignId", "adGroupId", "criterionId"]);
      if (missing) return missing;
      return ok(
        // pauseKeyword takes campaignId for logging, adGroupId+criterionId for the mutation.
        { tool: "pauseKeyword", args: { campaignId: rec.campaignId, adGroupId: rec.adGroupId, criterionId: rec.criterionId } },
        // enableKeyword does NOT take campaignId — see write-tools.ts:175.
        { tool: "enableKeyword", args: { adGroupId: rec.adGroupId, criterionId: rec.criterionId } },
      );
    }

    case "add_negative": {
      const missing = requireFields(rec, ["campaignId", "keyword"]);
      if (missing) return missing;
      const matchType = rec.matchType ?? "PHRASE";
      return ok(
        { tool: "addNegativeKeyword", args: { campaignId: rec.campaignId, keyword: rec.keyword, matchType } },
        { tool: "removeNegativeKeyword", args: { campaignId: rec.campaignId, keyword: rec.keyword, matchType } },
      );
    }

    case "pause_ad": {
      const missing = requireFields(rec, ["campaignId", "adGroupId", "adId"]);
      if (missing) return missing;
      return ok(
        { tool: "pauseAd", args: { campaignId: rec.campaignId, adGroupId: rec.adGroupId, adId: rec.adId } },
        { tool: "enableAd", args: { campaignId: rec.campaignId, adGroupId: rec.adGroupId, adId: rec.adId } },
      );
    }

    case "update_budget": {
      const missing = requireFields(rec, ["campaignId", "currentDailyBudgetDollars", "proposedDailyBudgetDollars"]);
      if (missing) return missing;
      const current = rec.currentDailyBudgetDollars!;
      const proposed = rec.proposedDailyBudgetDollars!;
      if (!(proposed > 0)) {
        return invalid("update_budget", "proposedDailyBudgetDollars", "must be > 0 (Google Ads requires positive budget)");
      }
      if (!(current > 0)) {
        // Need a positive current to undo — without it we can't restore.
        return invalid("update_budget", "currentDailyBudgetDollars", "must be > 0 to provide an undo path");
      }
      return ok(
        { tool: "updateCampaignBudget", args: { campaignId: rec.campaignId, newDailyBudgetDollars: proposed } },
        { tool: "updateCampaignBudget", args: { campaignId: rec.campaignId, newDailyBudgetDollars: current } },
      );
    }

    case "update_bid": {
      const missing = requireFields(rec, [
        "campaignId",
        "adGroupId",
        "criterionId",
        "currentBidDollars",
        "proposedBidDollars",
      ]);
      if (missing) return missing;
      const current = rec.currentBidDollars!;
      const proposed = rec.proposedBidDollars!;
      if (!(proposed > 0)) {
        return invalid("update_bid", "proposedBidDollars", "must be > 0");
      }
      if (!(current > 0)) {
        return invalid("update_bid", "currentBidDollars", "must be > 0 to provide an undo path");
      }
      return ok(
        {
          tool: "updateBid",
          args: {
            campaignId: rec.campaignId,
            adGroupId: rec.adGroupId,
            criterionId: rec.criterionId,
            newBidDollars: proposed,
          },
        },
        {
          tool: "updateBid",
          args: {
            campaignId: rec.campaignId,
            adGroupId: rec.adGroupId,
            criterionId: rec.criterionId,
            newBidDollars: current,
          },
        },
      );
    }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────

function ok(toolCall: ToolCall, undoToolCall: ToolCall): DispatchResult {
  return { ok: true, toolCall, undoToolCall };
}

function invalid(
  actionType: RecommendationActionType,
  field: string,
  reason: string,
): DispatchResult {
  return { ok: false, error: { kind: "invalid_value", actionType, field, reason } };
}

/**
 * Returns a `missing_field` error result if any of the named fields is null,
 * undefined, or empty-string. Returns null when all fields are present.
 *
 * Treats empty-string the same as missing because the audit pipeline's
 * default for "no targeting yet" is `""`, which would otherwise sneak past
 * a naive `=== undefined` check and produce a malformed ToolCall.
 */
function requireFields(
  rec: Recommendation,
  fields: ReadonlyArray<keyof Recommendation>,
): DispatchResult | null {
  for (const field of fields) {
    const v = rec[field];
    if (v === undefined || v === null || v === "") {
      return {
        ok: false,
        error: { kind: "missing_field", actionType: rec.actionType, field: String(field) },
      };
    }
  }
  return null;
}
