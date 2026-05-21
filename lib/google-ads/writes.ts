import { getCustomer, MATCH_TYPE, MATCH_TYPE_NAME, STATUS } from "./client";
import { extractErrorMessage, guardrailRejection, isNegativePauseError, normalizeCustomerId, removeNegativeKeywordHint, rewriteNegativePauseError, rewriteRemovedResourceError, safeEntityId } from "./helpers";
import { normalizeBiddingStrategyName } from "./settings";
import type { AuthContext, Guardrails, UpdateCampaignBiddingParams, WriteResult } from "./types";
import { DEFAULT_GUARDRAILS } from "./types";
import { isDemoAuth } from "@/lib/demo/constants";
import {
  demoAddKeyword,
  demoAddNegativeKeyword,
  demoEnableCampaign,
  demoEnableKeyword,
  demoPauseCampaign,
  demoPauseKeyword,
  demoRemoveCampaign,
  demoRemoveKeyword,
  demoRemoveNegativeKeyword,
  demoRenameAdGroup,
  demoRenameCampaign,
  demoUpdateBid,
  demoUpdateCampaignBudget,
} from "@/lib/demo/writes";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Fetch keyword text by criterion ID. Returns null if not found. */
async function fetchKeywordText(customer: any, criterionId: string): Promise<string | null> {
  try {
    const result = await customer.query(`
      SELECT ad_group_criterion.keyword.text
      FROM keyword_view
      WHERE ad_group_criterion.criterion_id = ${Number(criterionId)}
      LIMIT 1
    `);
    return (result as any[])[0]?.ad_group_criterion?.keyword?.text ?? null;
  } catch {
    return null;
  }
}

function isDatabaseContentionError(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    message.includes("database_error=2") ||
    message.includes("Multiple requests were attempting to modify the same resource")
  );
}

const BIDDING_STRATEGY_TYPE_NAME: Record<number, string> = {
  2: "ENHANCED_CPC",
  3: "MANUAL_CPC",
};

function normalizeBiddingStrategyType(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") return BIDDING_STRATEGY_TYPE_NAME[raw] ?? `UNKNOWN_${raw}`;
  return String(raw);
}

const DB_CONTENTION_BACKOFFS_MS = [
  { base: 200, jitter: 100 },
  { base: 500, jitter: 200 },
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Write Functions ─────────────────────────────────────────────────

export async function pauseKeyword(
  auth: AuthContext,
  campaignId: string,
  adGroupId: string,
  criterionId: string,
  guardrails = DEFAULT_GUARDRAILS,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoPauseKeyword(criterionId);
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

  // Pull every keyword in the campaign (positives + negatives) so we can
  // (a) blast-radius count the active positives and (b) detect the
  // "agent tried to pause a negative" case before we make a write call.
  // Production traces showed agents retrying pauseKeyword on negatives 13×
  // despite the API error explicitly naming the right tool — so we now
  // short-circuit with a structured nextTool hint instead of letting the
  // mutation fail.
  const countResult = await customer.query(`
    SELECT ad_group_criterion.criterion_id,
           ad_group_criterion.keyword.text,
           ad_group_criterion.status,
           ad_group_criterion.negative
    FROM keyword_view
    WHERE campaign.id = ${cid}
    LIMIT 5000
  `);
  type KeywordRow = {
    ad_group_criterion?: {
      criterion_id?: string | number;
      keyword?: { text?: string };
      status?: number;
      negative?: boolean;
    };
  };
  const rows = countResult as KeywordRow[];
  let targetRow: KeywordRow | undefined = rows.find(
    (r) => String(r.ad_group_criterion?.criterion_id) === String(criterionId),
  );

  // Campaigns with >5000 keywords would silently lose the target row to the
  // LIMIT cap and the negative short-circuit wouldn't fire. Run a targeted
  // lookup as a fallback so the precheck stays reliable on large campaigns.
  // Cheap: single-row query, only fires when the bulk query was truncated.
  if (!targetRow) {
    const targeted = await customer.query(`
      SELECT ad_group_criterion.criterion_id,
             ad_group_criterion.keyword.text,
             ad_group_criterion.status,
             ad_group_criterion.negative
      FROM keyword_view
      WHERE ad_group_criterion.criterion_id = ${Number(criterionId)}
      LIMIT 1
    `);
    targetRow = (targeted as KeywordRow[])[0];
  }
  const keywordText = targetRow?.ad_group_criterion?.keyword?.text ?? null;

  // If the criterion is a negative keyword, pausing is structurally impossible
  // in Google Ads. Return a structured nextTool hint so the agent calls
  // removeNegativeKeyword next instead of retrying.
  if (targetRow?.ad_group_criterion?.negative === true) {
    return {
      success: false,
      action: "pause_keyword",
      entityId: criterionId,
      beforeValue: "NEGATIVE",
      afterValue: "NEGATIVE",
      label: keywordText,
      error: `Keyword ${criterionId}${keywordText ? ` ("${keywordText}")` : ""} is a NEGATIVE keyword. Google Ads has no pause state for negatives — call \`removeNegativeKeyword\` to remove it (and \`addNegativeKeyword\` to re-add later).`,
      nextTool: removeNegativeKeywordHint(
        campaignId,
        keywordText,
        `Criterion ${criterionId} is a negative keyword; pause is not a valid operation for negatives.`,
      ),
    };
  }

  const totalActive = rows.filter(
    (r) =>
      r.ad_group_criterion?.negative !== true &&
      Number(r.ad_group_criterion?.status) === STATUS.ENABLED,
  ).length;

  // Count how many are already paused this session (tracked externally)
  // For single-action guardrail, we check: can't pause if it would exceed threshold
  if (totalActive <= 1) {
    return {
      success: false,
      action: "pause_keyword",
      entityId: criterionId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      label: keywordText,
      error: "Cannot pause the only active keyword in this campaign",
    };
  }

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_criterion" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${normalizeCustomerId(auth.customerId)}/adGroupCriteria/${adGroupId}~${criterionId}`,
          status: STATUS.PAUSED,
        },
      },
    ]);

    return {
      success: true,
      action: "pause_keyword",
      entityId: criterionId,
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
      label: keywordText,
    };
  } catch (error) {
    const rawMsg = extractErrorMessage(error);
    const errorMsg = rewriteRemovedResourceError(rewriteNegativePauseError(rawMsg), `Keyword ${criterionId}`);
    // Belt-and-suspenders: if the API tells us this is a negative (precheck
    // raced an external edit, or our query data was stale), still surface the
    // structured hint so the agent has a typed routing signal.
    const nextTool = isNegativePauseError(rawMsg)
      ? removeNegativeKeywordHint(
          campaignId,
          keywordText,
          `Google Ads rejected the pause: criterion ${criterionId} is a negative keyword.`,
        )
      : undefined;
    return {
      success: false,
      action: "pause_keyword",
      entityId: criterionId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      label: keywordText,
      error: errorMsg,
      ...(nextTool ? { nextTool } : {}),
    };
  }
}

export async function enableKeyword(
  auth: AuthContext,
  adGroupId: string,
  criterionId: string,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoEnableKeyword(criterionId);
  const customer = getCustomer(auth);

  // Fetch keyword text for logging
  const keywordText = await fetchKeywordText(customer, criterionId);

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_criterion" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${normalizeCustomerId(auth.customerId)}/adGroupCriteria/${adGroupId}~${criterionId}`,
          status: STATUS.ENABLED,
        },
      },
    ]);

    return {
      success: true,
      action: "enable_keyword",
      entityId: criterionId,
      beforeValue: "PAUSED",
      afterValue: "ENABLED",
      label: keywordText,
    };
  } catch (error) {
    return {
      success: false,
      action: "enable_keyword",
      entityId: criterionId,
      beforeValue: "PAUSED",
      afterValue: "PAUSED",
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Keyword ${criterionId}`),
    };
  }
}

export async function addKeyword(
  auth: AuthContext,
  adGroupId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "BROAD",
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoAddKeyword(keywordText, matchType);
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const text = keywordText.trim();
  if (!text) {
    return { success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: "", error: "Keyword text cannot be empty" };
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "ad_group_criterion" as any,
        operation: "create",
        resource: {
          ad_group: `customers/${cid}/adGroups/${adGroupId}`,
          status: STATUS.ENABLED,
          keyword: {
            text,
            match_type: MATCH_TYPE[matchType],
          },
        },
      },
    ]);

    // Extract the new criterion ID from the batch mutate response
    // mutateResources uses GoogleAdsService.mutate → mutate_operation_responses[0].ad_group_criterion_result.resource_name
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.ad_group_criterion_result?.resource_name as string | undefined;
    const criterionId = resourceName?.split("~").pop() ?? "";

    if (!criterionId) {
      // Without criterionId we cannot support undo — fail rather than store an unparseable fallback
      return {
        success: false,
        action: "add_keyword",
        entityId: "",
        beforeValue: "",
        afterValue: text,
        error: "Keyword was created but criterion ID could not be extracted from response — undo unavailable. Verify the keyword exists in Google Ads.",
      };
    }

    return {
      success: true,
      action: "add_keyword",
      entityId: criterionId,
      beforeValue: adGroupId, // stored for undo (removeKeyword needs adGroupId + criterionId)
      afterValue: `${text} (${matchType})`,
    };
  } catch (error) {
    const msg = extractErrorMessage(error);
    return {
      success: false,
      action: "add_keyword",
      entityId: "",
      beforeValue: "",
      afterValue: text,
      error: msg.includes("ALREADY_EXISTS")
        ? `Keyword "${text}" already exists in this ad group`
        : msg,
    };
  }
}

export async function removeKeyword(
  auth: AuthContext,
  adGroupId: string,
  criterionId: string,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoRemoveKeyword(criterionId);
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Fetch keyword text before removal
  const keywordText = await fetchKeywordText(customer, criterionId);

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_criterion" as any,
        operation: "remove",
        resource: `customers/${cid}/adGroupCriteria/${adGroupId}~${criterionId}` as any,
      },
    ]);

    return {
      success: true,
      action: "remove_keyword",
      entityId: criterionId,
      beforeValue: criterionId,
      afterValue: "",
      label: keywordText,
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_keyword",
      entityId: criterionId,
      beforeValue: criterionId,
      afterValue: criterionId,
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Keyword ${criterionId}`),
    };
  }
}

export async function updateBid(
  auth: AuthContext,
  campaignId: string,
  adGroupId: string,
  criterionId: string,
  newBidMicros: number,
  guardrails = DEFAULT_GUARDRAILS,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoUpdateBid(criterionId, newBidMicros);
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

  // Single query: fetch bidding strategy + current bid + keyword text together
  const preCheckResult = await customer.query(`
    SELECT
      campaign.bidding_strategy_type,
      ad_group_criterion.cpc_bid_micros,
      ad_group_criterion.keyword.text
    FROM keyword_view
    WHERE campaign.id = ${cid}
      AND ad_group_criterion.criterion_id = ${Number(criterionId)}
    LIMIT 1
  `);
  const row = (preCheckResult as any[])[0];
  const keywordText: string | null = row?.ad_group_criterion?.keyword?.text ?? null;
  const strategy = normalizeBiddingStrategyType(row?.campaign?.bidding_strategy_type);
  const manualStrategies = ["MANUAL_CPC", "ENHANCED_CPC"];
  if (strategy && !manualStrategies.includes(strategy)) {
    return {
      success: false,
      action: "update_bid",
      entityId: criterionId,
      beforeValue: "N/A",
      afterValue: String(newBidMicros),
      label: keywordText,
      error: `Bid changes not supported for ${strategy} strategy. Only MANUAL_CPC and ENHANCED_CPC allow individual bid overrides. Consider adjusting campaign budget instead.`,
    };
  }

  const currentBidMicros = row?.ad_group_criterion?.cpc_bid_micros ?? 0;

  if (currentBidMicros > 0) {
    const changePct = Math.abs(newBidMicros - currentBidMicros) / currentBidMicros;
    if (changePct > guardrails.maxBidChangePct) {
      const rejection = guardrailRejection("bid", changePct, guardrails.maxBidChangePct);
      return {
        success: false,
        action: "update_bid",
        entityId: criterionId,
        beforeValue: String(currentBidMicros),
        afterValue: String(newBidMicros),
        label: keywordText,
        error: rejection.error,
        nextTool: rejection.nextTool,
      };
    }
  }

  if (newBidMicros <= 0) {
    return {
      success: false,
      action: "update_bid",
      entityId: criterionId,
      beforeValue: String(currentBidMicros),
      afterValue: String(newBidMicros),
      label: keywordText,
      error: "Bid must be greater than zero",
    };
  }

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_criterion" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${normalizeCustomerId(auth.customerId)}/adGroupCriteria/${adGroupId}~${criterionId}`,
          cpc_bid_micros: newBidMicros,
        },
      },
    ]);

    return {
      success: true,
      action: "update_bid",
      entityId: criterionId,
      beforeValue: String(currentBidMicros),
      afterValue: String(newBidMicros),
      label: keywordText,
    };
  } catch (error) {
    return {
      success: false,
      action: "update_bid",
      entityId: criterionId,
      beforeValue: String(currentBidMicros),
      afterValue: String(newBidMicros),
      label: keywordText,
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Keyword ${criterionId}`),
    };
  }
}

export async function addNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "PHRASE",
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoAddNegativeKeyword(campaignId, keywordText);
  const customer = getCustomer(auth);
  safeEntityId(campaignId);

  const text = keywordText.trim();
  if (!text) {
    return {
      success: false,
      action: "add_negative_keyword",
      entityId: "",
      beforeValue: "",
      afterValue: text,
      error: "Keyword text cannot be empty",
    };
  }

  let lastError = "";
  for (let attempt = 0; attempt <= DB_CONTENTION_BACKOFFS_MS.length; attempt += 1) {
    try {
      await customer.mutateResources([
        {
          entity: "campaign_criterion" as any,
          operation: "create",
          resource: {
            campaign: `customers/${normalizeCustomerId(auth.customerId)}/campaigns/${campaignId}`,
            negative: true,
            keyword: {
              text,
              match_type: MATCH_TYPE[matchType],
            },
          },
        },
      ]);

      return {
        success: true,
        action: "add_negative_keyword",
        entityId: text,
        beforeValue: "",
        afterValue: `${text}|${matchType}`,
      };
    } catch (error) {
      const msg = extractErrorMessage(error);
      lastError = msg.includes("ALREADY_EXISTS")
        ? `Negative keyword "${text}" already exists in this campaign`
        : msg;

      const backoff = DB_CONTENTION_BACKOFFS_MS[attempt];
      if (!backoff || !isDatabaseContentionError(lastError)) break;
      await sleep(backoff.base + Math.floor(Math.random() * (backoff.jitter + 1)));
    }
  }

  return {
    success: false,
    action: "add_negative_keyword",
    entityId: text,
    beforeValue: "",
    afterValue: `${text}|${matchType}`,
    error: lastError,
  };
}

export async function removeNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
  matchType?: "BROAD" | "PHRASE" | "EXACT",
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoRemoveNegativeKeyword(keywordText);
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

  try {
    // Find the negative keyword criterion by text (and optionally matchType).
    // Query all negatives for the campaign and filter in code to avoid GAQL string interpolation.
    const result = await customer.query(`
      SELECT campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
      FROM campaign_criterion
      WHERE campaign.id = ${cid}
        AND campaign_criterion.negative = TRUE
        AND campaign_criterion.type = 'KEYWORD'
    `);

    const allNegatives = (result as Array<{
      campaign_criterion?: {
        criterion_id?: string | number;
        keyword?: { text?: string; match_type?: number };
      };
    }>);
    const match = allNegatives.find((row) => {
      if (row.campaign_criterion?.keyword?.text !== keywordText) return false;
      if (matchType && row.campaign_criterion?.keyword?.match_type !== MATCH_TYPE[matchType]) return false;
      return true;
    });
    const criterionId = match?.campaign_criterion?.criterion_id;
    if (!criterionId) {
      // The agent built the removal plan from search-term data without
      // verifying — surface the actual list so it abandons the bad plan
      // after one call instead of re-running the same lookup 50× per session.
      // Slice before formatting: campaigns can carry up to ~10k negatives and
      // we only show the first 20.
      const total = allNegatives.length;
      const sample = allNegatives.slice(0, 20)
        .map((row) => {
          const text = row.campaign_criterion?.keyword?.text;
          const mt = row.campaign_criterion?.keyword?.match_type;
          if (!text) return null;
          // Don't lie about match types we can't decode — calling an unmapped
          // code "PHRASE" would push the agent toward the wrong matchType arg
          // on the follow-up call.
          const mtName = typeof mt === "number" ? MATCH_TYPE_NAME[mt] ?? "UNKNOWN" : "UNKNOWN";
          return `"${text}" (${mtName})`;
        })
        .filter((s): s is string => s !== null);

      const more = total > sample.length ? ` ... and ${total - sample.length} more` : "";
      const inventory = total === 0
        ? `Campaign ${campaignId} has no negative keywords at all — verify the campaign ID, or call \`addNegativeKeyword\` if you intended to add this term.`
        : `Campaign ${campaignId} has ${total} negative keyword${total === 1 ? "" : "s"}: ${sample.join(", ")}${more}.`;

      return {
        success: false,
        action: "remove_negative_keyword",
        entityId: keywordText,
        beforeValue: keywordText,
        afterValue: "",
        error: `Negative keyword "${keywordText}"${matchType ? ` (${matchType})` : ""} not found in campaign ${campaignId}. ${inventory} Re-plan against the actual list before retrying.`,
        nextTool: total === 0
          ? {
              name: "addNegativeKeyword",
              reason: `No negatives exist on campaign ${campaignId}; if you wanted to block "${keywordText}", add it instead.`,
              args: { campaignId, keyword: keywordText, ...(matchType ? { matchType } : {}) },
            }
          : undefined,
      };
    }

    const resolvedMatchType = MATCH_TYPE_NAME[match.campaign_criterion?.keyword?.match_type as number] ?? "PHRASE";
    const customerId = normalizeCustomerId(auth.customerId);
    await customer.mutateResources([
      {
        entity: "campaign_criterion" as any,
        operation: "remove",
        resource: `customers/${customerId}/campaignCriteria/${cid}~${criterionId}` as any,
      },
    ]);

    return {
      success: true,
      action: "remove_negative_keyword",
      entityId: keywordText,
      beforeValue: `${keywordText}|${resolvedMatchType}`,
      afterValue: "",
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_negative_keyword",
      entityId: keywordText,
      beforeValue: keywordText,
      afterValue: "",
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Campaign ${campaignId}`),
    };
  }
}

export async function updateCampaignBudget(
  auth: AuthContext,
  campaignId: string,
  newDailyBudgetMicros: number,
  guardrails = DEFAULT_GUARDRAILS,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoUpdateCampaignBudget(campaignId, newDailyBudgetMicros);
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

  // Single query: fetch budget resource name + current amount together
  const result = await customer.query(`
    SELECT
      campaign.campaign_budget,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.id = ${cid}
    LIMIT 1
  `);
  const row = (result as any[])[0];
  const budgetResourceName = row?.campaign?.campaign_budget;

  if (!budgetResourceName) {
    return {
      success: false,
      action: "update_budget",
      entityId: campaignId,
      beforeValue: "unknown",
      afterValue: String(newDailyBudgetMicros),
      error: "Could not find campaign budget resource",
    };
  }

  const currentBudgetMicros = row?.campaign_budget?.amount_micros ?? 0;

  // Enforce guardrail
  if (currentBudgetMicros > 0) {
    const changePct =
      Math.abs(newDailyBudgetMicros - currentBudgetMicros) / currentBudgetMicros;
    if (changePct > guardrails.maxBudgetChangePct) {
      const rejection = guardrailRejection("budget", changePct, guardrails.maxBudgetChangePct);
      return {
        success: false,
        action: "update_budget",
        entityId: campaignId,
        beforeValue: String(currentBudgetMicros),
        afterValue: String(newDailyBudgetMicros),
        error: rejection.error,
        nextTool: rejection.nextTool,
      };
    }
  }

  if (newDailyBudgetMicros < 1_000_000) {
    return {
      success: false,
      action: "update_budget",
      entityId: campaignId,
      beforeValue: String(currentBudgetMicros),
      afterValue: String(newDailyBudgetMicros),
      error: "Daily budget must be at least $1.00 (1,000,000 micros)",
    };
  }

  try {
    await customer.mutateResources([
      {
        entity: "campaign_budget" as any,
        operation: "update",
        resource: {
          resource_name: budgetResourceName,
          amount_micros: newDailyBudgetMicros,
        },
      },
    ]);

    return {
      success: true,
      action: "update_budget",
      entityId: campaignId,
      beforeValue: String(currentBudgetMicros),
      afterValue: String(newDailyBudgetMicros),
    };
  } catch (error) {
    return {
      success: false,
      action: "update_budget",
      entityId: campaignId,
      beforeValue: String(currentBudgetMicros),
      afterValue: String(newDailyBudgetMicros),
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Campaign ${campaignId}`),
    };
  }
}

export async function updateCampaignBidding(
  auth: AuthContext,
  campaignId: string,
  params: UpdateCampaignBiddingParams,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) {
    return {
      success: true,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue: "TARGET_CPA",
      afterValue: params.biddingStrategy,
    };
  }
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);
  const customerId = normalizeCustomerId(auth.customerId);
  const campaignResourceName = `customers/${customerId}/campaigns/${cid}`;

  // Fetch current bidding strategy for beforeValue
  const result = await customer.query(`
    SELECT
      campaign.bidding_strategy_type,
      campaign.target_cpa.target_cpa_micros,
      campaign.maximize_conversions.target_cpa_micros,
      campaign.target_roas.target_roas,
      campaign.target_impression_share.location,
      campaign.target_impression_share.location_fraction_micros,
      campaign.target_impression_share.cpc_bid_ceiling_micros
    FROM campaign
    WHERE campaign.id = ${cid}
    LIMIT 1
  `);
  const row = (result as any[])[0];
  if (!row) {
    return {
      success: false,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue: "unknown",
      afterValue: params.biddingStrategy,
      error: "Campaign not found",
    };
  }

  const currentStrategy = row.campaign?.bidding_strategy_type ?? "UNKNOWN";
  const currentTargetCpa = row.campaign?.target_cpa?.target_cpa_micros
    ?? row.campaign?.maximize_conversions?.target_cpa_micros
    ?? null;
  const currentTargetRoas = row.campaign?.target_roas?.target_roas ?? null;
  const currentTis = row.campaign?.target_impression_share ?? null;

  const beforeValue = JSON.stringify({
    strategy: currentStrategy,
    targetCpaMicros: currentTargetCpa,
    targetRoas: currentTargetRoas,
    impressionShareLocation: currentTis?.location ?? null,
    locationFractionMicros: currentTis?.location_fraction_micros ?? null,
    cpcBidCeilingMicros: currentTis?.cpc_bid_ceiling_micros ?? null,
  });

  // Validate params
  if (params.biddingStrategy === "TARGET_CPA" && params.targetCpaMicros == null) {
    return {
      success: false,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue,
      afterValue: params.biddingStrategy,
      error: "targetCpaMicros is required for TARGET_CPA strategy",
    };
  }
  if (params.biddingStrategy === "TARGET_ROAS" && params.targetRoas == null) {
    return {
      success: false,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue,
      afterValue: params.biddingStrategy,
      error: "targetRoas is required for TARGET_ROAS strategy (e.g. 2.0 = 200% ROAS)",
    };
  }
  if (params.targetRoas != null && params.targetRoas <= 0) {
    return {
      success: false,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue,
      afterValue: params.biddingStrategy,
      error: "Target ROAS must be greater than 0 (e.g. 2.0 = 200% return)",
    };
  }
  if (params.targetCpaMicros != null && params.targetCpaMicros < 100_000) {
    return {
      success: false,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue,
      afterValue: params.biddingStrategy,
      error: "Target CPA must be at least $0.10 (100,000 micros)",
    };
  }
  const fail = (error: string): WriteResult => ({
    success: false,
    action: "update_bidding",
    entityId: campaignId,
    beforeValue,
    afterValue: params.biddingStrategy,
    error,
  });

  if (params.biddingStrategy === "TARGET_IMPRESSION_SHARE") {
    if (params.impressionShareLocation == null) {
      return fail("impressionShareLocation is required for TARGET_IMPRESSION_SHARE (ANYWHERE_ON_PAGE | TOP_OF_PAGE | ABSOLUTE_TOP_OF_PAGE)");
    }
    if (params.locationFractionMicros == null) {
      return fail("locationFractionMicros is required for TARGET_IMPRESSION_SHARE (1–1_000_000, where 950_000 = 95%)");
    }
    if (params.locationFractionMicros < 1 || params.locationFractionMicros > 1_000_000) {
      return fail("locationFractionMicros must be between 1 and 1_000_000 (e.g. 950_000 = 95%)");
    }
    if (params.cpcBidCeilingMicros == null) {
      return fail("cpcBidCeilingMicros is required for TARGET_IMPRESSION_SHARE — without a ceiling Google can bid unbounded to hit the IS target");
    }
    if (params.cpcBidCeilingMicros < 10_000) {
      return fail("cpcBidCeilingMicros must be at least $0.01 (10,000 micros)");
    }
  }

  // cpcBidCeilingMicros is meaningful only for TARGET_IMPRESSION_SHARE
  // (required) and MAXIMIZE_CLICKS (optional, sets target_spend.cpc_bid_ceiling_micros).
  // Other strategies have no campaign-level CPC ceiling field. Previously the
  // code silently dropped the value for MAXIMIZE_CLICKS and silently accepted-
  // then-ignored it for the rest — both confusing.
  if (
    params.cpcBidCeilingMicros != null &&
    params.biddingStrategy !== "TARGET_IMPRESSION_SHARE" &&
    params.biddingStrategy !== "MAXIMIZE_CLICKS"
  ) {
    return fail(
      `cpcBidCeilingMicros is not valid for ${params.biddingStrategy}. It's required for TARGET_IMPRESSION_SHARE and optional for MAXIMIZE_CLICKS — other strategies (TARGET_CPA, TARGET_ROAS, MAXIMIZE_CONVERSIONS, MAXIMIZE_CONVERSION_VALUE, MANUAL_CPC) have no campaign-level CPC ceiling.`,
    );
  }
  if (params.biddingStrategy === "MAXIMIZE_CLICKS" && params.cpcBidCeilingMicros != null && params.cpcBidCeilingMicros < 10_000) {
    return fail("cpcBidCeilingMicros must be at least $0.01 (10,000 micros)");
  }

  // For non-conversion strategies, auto-clear campaign-specific goals
  // (otherwise Google silently ignores the bidding change). TARGET_IMPRESSION_SHARE
  // is presence-based, not conversion-based, so it needs the same treatment.
  const isNonConversionStrategy =
    params.biddingStrategy === "MAXIMIZE_CLICKS" ||
    params.biddingStrategy === "MANUAL_CPC" ||
    params.biddingStrategy === "TARGET_IMPRESSION_SHARE";

  let goalConfigCleared = false;
  if (isNonConversionStrategy) {
    try {
      const goalResult = await customer.query(`
        SELECT conversion_goal_campaign_config.goal_config_level
        FROM conversion_goal_campaign_config
        WHERE campaign.id = ${cid}
        LIMIT 1
      `);
      const goalRow = (goalResult as any[])[0];
      const currentGoalLevel = goalRow?.conversion_goal_campaign_config?.goal_config_level;
      // 3 = CAMPAIGN (campaign-specific goals set)
      // Handle both numeric (3) and string ("CAMPAIGN") enum representations
      if (currentGoalLevel === 3 || currentGoalLevel === "CAMPAIGN") {
        await customer.mutateResources([
          {
            entity: "conversion_goal_campaign_config" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${customerId}/conversionGoalCampaignConfigs/${cid}`,
              goal_config_level: 2, // CUSTOMER — revert to account-level goals
            },
          },
        ]);
        goalConfigCleared = true;
      }
    } catch {
      // Goal config query/mutation failed — proceed with bidding change anyway
    }
  }

  // Build the campaign resource with the new bidding strategy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resource: Record<string, any> = {
    resource_name: campaignResourceName,
  };

  switch (params.biddingStrategy) {
    case "TARGET_CPA":
      resource.target_cpa = { target_cpa_micros: params.targetCpaMicros };
      break;
    case "MAXIMIZE_CONVERSIONS":
      // target_cpa_micros: 0 = no CPA cap. Must set a field explicitly so the
      // library includes it in the update mask (empty {} gets no mask paths).
      resource.maximize_conversions = { target_cpa_micros: params.targetCpaMicros ?? 0 };
      break;
    case "MAXIMIZE_CONVERSION_VALUE":
      // target_roas: 0 = no ROAS target. Same update-mask issue as above.
      resource.maximize_conversion_value = { target_roas: params.targetRoas ?? 0 };
      break;
    case "TARGET_ROAS":
      resource.target_roas = { target_roas: params.targetRoas };
      break;
    case "MAXIMIZE_CLICKS":
      // An empty {} is skipped by the library's update mask computation (no field mask paths
      // generated for empty objects), so we must set an explicit field value.
      // When the caller doesn't pass cpcBidCeilingMicros, 10_000_000_000 micros = $10,000
      // ceiling — effectively uncapped. Previously the hardcoded value was written
      // unconditionally, silently overwriting any user-provided ceiling — agents had no way
      // to lower an oversized cap without leaving MAXIMIZE_CLICKS entirely.
      resource.target_spend = {
        cpc_bid_ceiling_micros: params.cpcBidCeilingMicros ?? 10_000_000_000,
      };
      break;
    case "MANUAL_CPC":
      resource.manual_cpc = { enhanced_cpc_enabled: false };
      break;
    case "TARGET_IMPRESSION_SHARE":
      resource.target_impression_share = {
        location: params.impressionShareLocation,
        location_fraction_micros: params.locationFractionMicros,
        cpc_bid_ceiling_micros: params.cpcBidCeilingMicros,
      };
      break;
  }

  const afterValue = JSON.stringify({
    strategy: params.biddingStrategy,
    targetCpaMicros: params.targetCpaMicros ?? null,
    targetRoas: params.targetRoas ?? null,
    ...(params.biddingStrategy === "TARGET_IMPRESSION_SHARE" && {
      impressionShareLocation: params.impressionShareLocation,
      locationFractionMicros: params.locationFractionMicros,
      cpcBidCeilingMicros: params.cpcBidCeilingMicros,
    }),
    ...(params.biddingStrategy === "MAXIMIZE_CLICKS" && {
      // Report the effective ceiling (user value or the 10B default). This
      // closes the silent-overwrite trap: if a user passed 1.0 and we wrote
      // 10_000_000_000, the afterValue used to show only `strategy: "MAXIMIZE_CLICKS"`
      // and the change-tracking log lost the actual value.
      cpcBidCeilingMicros: params.cpcBidCeilingMicros ?? 10_000_000_000,
    }),
    ...(goalConfigCleared && { goalConfigCleared: true }),
  });

  try {
    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "update",
        resource,
      },
    ]);

    // Post-mutation verification: ensure the change actually stuck
    const verifyResult = await customer.query(`
      SELECT campaign.bidding_strategy_type
      FROM campaign
      WHERE campaign.id = ${cid}
      LIMIT 1
    `);
    const verifyRow = (verifyResult as any[])[0];
    const actualStrategy = verifyRow?.campaign?.bidding_strategy_type;

    // Map strategy names to expected enum values (numeric) and internal names (string)
    // The google-ads-api library returns numeric enums, but we handle strings defensively
    const expectedStrategyMap: Record<string, { num: number; str: string }> = {
      TARGET_CPA: { num: 6, str: "TARGET_CPA" },
      MAXIMIZE_CONVERSIONS: { num: 10, str: "MAXIMIZE_CONVERSIONS" },
      MAXIMIZE_CONVERSION_VALUE: { num: 11, str: "MAXIMIZE_CONVERSION_VALUE" },
      TARGET_ROAS: { num: 8, str: "TARGET_ROAS" },       // 7 is deprecated TARGET_OUTRANK_SHARE
      MAXIMIZE_CLICKS: { num: 9, str: "TARGET_SPEND" },  // API internal name
      MANUAL_CPC: { num: 3, str: "MANUAL_CPC" },
      TARGET_IMPRESSION_SHARE: { num: 15, str: "TARGET_IMPRESSION_SHARE" },
    };
    const expected = expectedStrategyMap[params.biddingStrategy];

    if (expected != null && actualStrategy != null &&
        actualStrategy !== expected.num && actualStrategy !== expected.str) {
      return {
        success: false,
        action: "update_bidding",
        entityId: campaignId,
        beforeValue,
        afterValue,
        error: `Bidding change was accepted by the API but did not take effect (strategy is still ${actualStrategy}). This may be caused by campaign-level constraints (e.g. campaign-specific conversion goals or marketing objective). Try changing the campaign's conversion goal settings first.`,
      };
    }

    return {
      success: true,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue,
      afterValue,
    };
  } catch (error) {
    return {
      success: false,
      action: "update_bidding",
      entityId: campaignId,
      beforeValue,
      afterValue,
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Campaign ${campaignId}`),
    };
  }
}

// ─── Campaign Goal Config ─────────────────────────────────────────

/** GoalConfigLevel enum: CUSTOMER = 2, CAMPAIGN = 3 */
const GOAL_CONFIG_LEVEL = { CUSTOMER: 2, CAMPAIGN: 3 } as const;
const GOAL_CONFIG_LABEL: Record<number, string> = { 2: "CUSTOMER", 3: "CAMPAIGN" };

export type GoalConfigLevel = "CUSTOMER" | "CAMPAIGN";

/**
 * Update a campaign's conversion goal config level.
 * CUSTOMER = use account-level conversion goals.
 * CAMPAIGN = use campaign-specific conversion goals.
 */
export async function updateCampaignGoalConfig(
  auth: AuthContext,
  campaignId: string,
  level: GoalConfigLevel,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) {
    return {
      success: true,
      action: "update_goal_config",
      entityId: campaignId,
      beforeValue: "CUSTOMER",
      afterValue: level,
    };
  }
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);
  const customerId = normalizeCustomerId(auth.customerId);

  // Query current goal config level
  let currentLevel = "UNKNOWN";
  try {
    const result = await customer.query(`
      SELECT conversion_goal_campaign_config.goal_config_level
      FROM conversion_goal_campaign_config
      WHERE campaign.id = ${cid}
      LIMIT 1
    `);
    const row = (result as any[])[0];
    if (row) {
      const rawLevel = row.conversion_goal_campaign_config?.goal_config_level;
      currentLevel = GOAL_CONFIG_LABEL[rawLevel] ?? String(rawLevel);
    } else {
      // No config row = campaign uses account-level goals (CUSTOMER)
      currentLevel = "CUSTOMER";
    }
  } catch {
    // If query fails, proceed anyway — the mutation will surface any real error
  }

  // Skip if already at the desired level
  if (currentLevel === level) {
    return {
      success: true,
      action: "update_goal_config",
      entityId: campaignId,
      beforeValue: currentLevel,
      afterValue: level,
    };
  }

  const resourceName = `customers/${customerId}/conversionGoalCampaignConfigs/${cid}`;

  try {
    await customer.mutateResources([
      {
        entity: "conversion_goal_campaign_config" as any,
        operation: "update",
        resource: {
          resource_name: resourceName,
          goal_config_level: GOAL_CONFIG_LEVEL[level],
        },
      },
    ]);

    return {
      success: true,
      action: "update_goal_config",
      entityId: campaignId,
      beforeValue: currentLevel,
      afterValue: level,
    };
  } catch (error) {
    return {
      success: false,
      action: "update_goal_config",
      entityId: campaignId,
      beforeValue: currentLevel,
      afterValue: level,
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Campaign ${campaignId}`),
    };
  }
}

export async function pauseCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoPauseCampaign(campaignId);
  const customer = getCustomer(auth);
  safeEntityId(campaignId);

  try {
    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${normalizeCustomerId(auth.customerId)}/campaigns/${campaignId}`,
          status: STATUS.PAUSED,
        },
      },
    ]);

    return {
      success: true,
      action: "pause_campaign",
      entityId: campaignId,
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    };
  } catch (error) {
    let msg = extractErrorMessage(error);
    // Provide actionable message for trial/experiment campaigns
    if (msg.toLowerCase().includes("trial") || msg.toLowerCase().includes("experiment") || msg.includes("CANNOT_MODIFY_FOR_TRIAL_CAMPAIGN")) {
      msg = `Cannot pause this campaign — it may be a trial/experiment campaign. Trial campaigns are controlled by their experiment and cannot be paused directly. Pause the base campaign or end the experiment instead. (Original error: ${msg})`;
    }
    msg = rewriteRemovedResourceError(msg, `Campaign ${campaignId}`);
    return {
      success: false,
      action: "pause_campaign",
      entityId: campaignId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      error: msg,
    };
  }
}

export async function enableCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoEnableCampaign(campaignId);
  const customer = getCustomer(auth);
  safeEntityId(campaignId);

  try {
    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${normalizeCustomerId(auth.customerId)}/campaigns/${campaignId}`,
          status: STATUS.ENABLED,
        },
      },
    ]);

    return {
      success: true,
      action: "enable_campaign",
      entityId: campaignId,
      beforeValue: "PAUSED",
      afterValue: "ENABLED",
    };
  } catch (error) {
    return {
      success: false,
      action: "enable_campaign",
      entityId: campaignId,
      beforeValue: "PAUSED",
      afterValue: "PAUSED",
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Campaign ${campaignId}`),
    };
  }
}

export async function removeCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoRemoveCampaign(campaignId);
  const customer = getCustomer(auth);
  const normalizedCampaignId = safeEntityId(campaignId);

  try {
    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "remove",
        resource: `customers/${normalizeCustomerId(auth.customerId)}/campaigns/${normalizedCampaignId}` as any,
      },
    ]);

    return {
      success: true,
      action: "remove_campaign",
      entityId: campaignId,
      beforeValue: "PAUSED",
      afterValue: "REMOVED",
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_campaign",
      entityId: campaignId,
      beforeValue: "PAUSED",
      afterValue: "PAUSED",
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Campaign ${campaignId}`),
    };
  }
}

// ─── Rename Campaign / Ad Group ─────────────────────────────────────────

export async function renameCampaign(
  auth: AuthContext,
  campaignId: string,
  newName: string,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoRenameCampaign(campaignId, newName);
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const id = safeEntityId(campaignId);

  const trimmed = newName.trim();
  if (!trimmed) {
    return { success: false, action: "rename_campaign", entityId: campaignId, beforeValue: "", afterValue: "", error: "Campaign name cannot be empty" };
  }

  try {
    // Fetch current name for undo
    const rows = await customer.query(`
      SELECT campaign.name FROM campaign WHERE campaign.id = ${id} LIMIT 1
    `);
    const oldName = (rows as any[])[0]?.campaign?.name ?? "";

    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/campaigns/${campaignId}`,
          name: trimmed,
        },
      },
    ]);

    return {
      success: true,
      action: "rename_campaign",
      entityId: campaignId,
      beforeValue: oldName,
      afterValue: trimmed,
    };
  } catch (error) {
    return {
      success: false,
      action: "rename_campaign",
      entityId: campaignId,
      beforeValue: "",
      afterValue: trimmed,
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Campaign ${campaignId}`),
    };
  }
}

// ─── Ad Group Bid / Settings Update ───────────────────────────────────

export type UpdateAdGroupParams = {
  /**
   * New ad-group default max CPC bid, in micros. Only honored for
   * MANUAL_CPC / ENHANCED_CPC campaigns; for smart-bidding strategies
   * the field is set but ignored by Google. Subject to the
   * `maxBidChangePct` guardrail unless the current bid is the
   * campaign-default placeholder (null or 0), in which case the
   * first-time-set bypasses the cap so agents can ramp a freshly
   * created ad group from 0.01€ to a working value.
   */
  cpcBidMicros?: number;
  /**
   * Override the campaign's target CPA at the ad-group level, in
   * micros. Only effective on TARGET_CPA / MAXIMIZE_CONVERSIONS
   * campaigns; surfaces a warning otherwise rather than failing —
   * Google still accepts the write, it just won't influence bidding.
   */
  targetCpaMicros?: number;
  /** ENABLED or PAUSED. Subsumes the older pauseAdGroup pattern (not yet exposed). */
  status?: "ENABLED" | "PAUSED";
  /** Rename. Equivalent to `renameAdGroup` but bundleable with other changes. */
  name?: string;
};

/**
 * Update an ad group's default CPC bid, target CPA, status, and/or name in
 * one atomic mutate. Companion to `updateBid` (per-keyword override) and
 * `updateCampaignBudget` (campaign-level money).
 *
 * Common use case: freshly-built MANUAL_CPC campaigns where Google created
 * each ad group with `cpc_bid_micros = 10000` (€0.01). At that bid no
 * keywords will win auctions, so the campaign launches and produces zero
 * impressions. Raising the default to a market-realistic value (~€1) is the
 * standard unblock — but with the 25% guardrail and a current value of
 * 10_000 micros, the cap would force 200+ tiny steps. We bypass the cap
 * when the current value is null/0 (first-time set), matching how
 * `updateCampaignBudget` would behave if budgets started at $0.
 */
export async function updateAdGroup(
  auth: AuthContext,
  adGroupId: string,
  params: UpdateAdGroupParams,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const agId = safeEntityId(adGroupId, "ad group");

  // Validate name first so an explicit empty/whitespace name reports the
  // clearer "name cannot be empty" rather than the generic "at least one
  // field" — the caller obviously meant to set name and we should say so.
  if (params.name !== undefined && !params.name.trim()) {
    return {
      success: false,
      action: "update_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: "",
      error: "Ad group name cannot be empty",
    };
  }

  const hasAnyField =
    params.cpcBidMicros !== undefined ||
    params.targetCpaMicros !== undefined ||
    params.status !== undefined ||
    params.name !== undefined;
  if (!hasAnyField) {
    return {
      success: false,
      action: "update_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: "",
      error: "Provide at least one field to update: cpcBidMicros, targetCpaMicros, status, or name",
    };
  }
  if (params.cpcBidMicros !== undefined && params.cpcBidMicros <= 0) {
    return {
      success: false,
      action: "update_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: "",
      error: "cpcBidMicros must be greater than zero",
    };
  }
  if (params.targetCpaMicros !== undefined && params.targetCpaMicros < 100_000) {
    return {
      success: false,
      action: "update_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: "",
      error: "Target CPA must be at least $0.10 (100,000 micros)",
    };
  }

  // Fetch current state for beforeValue + first-time-set detection.
  let currentName = "";
  let currentStatus: string | number | null = null;
  let currentCpcBidMicros: number | null = null;
  let currentTargetCpaMicros: number | null = null;
  let strategy = "UNKNOWN";
  try {
    const rows = await customer.query(`
      SELECT
        ad_group.name,
        ad_group.status,
        ad_group.cpc_bid_micros,
        ad_group.target_cpa_micros,
        campaign.bidding_strategy_type
      FROM ad_group
      WHERE ad_group.id = ${agId}
      LIMIT 1
    `);
    const row = (rows as any[])[0];
    if (!row) {
      return {
        success: false,
        action: "update_ad_group",
        entityId: adGroupId,
        beforeValue: "",
        afterValue: "",
        error: `Ad group ${adGroupId} not found`,
      };
    }
    currentName = row.ad_group?.name ?? "";
    currentStatus = row.ad_group?.status ?? null;
    currentCpcBidMicros = row.ad_group?.cpc_bid_micros != null ? Number(row.ad_group.cpc_bid_micros) : null;
    currentTargetCpaMicros = row.ad_group?.target_cpa_micros != null ? Number(row.ad_group.target_cpa_micros) : null;
    strategy = normalizeBiddingStrategyName(row.campaign?.bidding_strategy_type);
  } catch (fetchError) {
    return {
      success: false,
      action: "update_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: "",
      error: `Could not read current ad group before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  // Normalize current status to its string name once so every result path
  // (guardrail rejection, success, error) reports the same shape.
  const currentStatusName = typeof currentStatus === "number"
    ? (currentStatus === STATUS.ENABLED ? "ENABLED" : currentStatus === STATUS.PAUSED ? "PAUSED" : String(currentStatus))
    : currentStatus;
  const beforeValue = JSON.stringify({
    name: currentName,
    status: currentStatusName,
    cpcBidMicros: currentCpcBidMicros,
    targetCpaMicros: currentTargetCpaMicros,
  });

  // Guardrail check on cpcBidMicros. Skip ONLY when there's no real
  // ad-group-level bid yet — `cpc_bid_micros` is either null (inheriting
  // the campaign default) or 0 (set-but-unset). Any positive existing
  // value is treated as a real bid, even Google's €0.01 (10,000 micros)
  // placeholder, because we can't reliably distinguish a placeholder
  // from an intentional low bid by value alone. Trade-off: an account
  // that launched with the literal 10K micro default loses the
  // first-time-set bypass on the first ramp; raise the account-level
  // guardrail before the bumps and reset it after.
  if (
    params.cpcBidMicros !== undefined &&
    currentCpcBidMicros != null &&
    currentCpcBidMicros > 0
  ) {
    const changePct = Math.abs(params.cpcBidMicros - currentCpcBidMicros) / currentCpcBidMicros;
    if (changePct > guardrails.maxBidChangePct) {
      const rejection = guardrailRejection("bid", changePct, guardrails.maxBidChangePct);
      return {
        success: false,
        action: "update_ad_group",
        entityId: adGroupId,
        beforeValue,
        afterValue: JSON.stringify({ cpcBidMicros: params.cpcBidMicros }),
        error: rejection.error,
        nextTool: rejection.nextTool,
      };
    }
  }

  // Build the mutate resource. ad_group fields are flat top-level, so
  // the library emits a flat field mask (verified via Phase 4 probe).
  const resource: Record<string, unknown> = {
    resource_name: `customers/${cid}/adGroups/${agId}`,
  };
  if (params.cpcBidMicros !== undefined) resource.cpc_bid_micros = params.cpcBidMicros;
  if (params.targetCpaMicros !== undefined) resource.target_cpa_micros = params.targetCpaMicros;
  if (params.status !== undefined) resource.status = STATUS[params.status];
  if (params.name !== undefined) resource.name = params.name.trim();
  const afterValue = JSON.stringify({
    name: params.name?.trim() ?? currentName,
    status: params.status ?? currentStatusName,
    cpcBidMicros: params.cpcBidMicros ?? currentCpcBidMicros,
    targetCpaMicros: params.targetCpaMicros ?? currentTargetCpaMicros,
  });

  // Warn-but-don't-block when targetCpaMicros is set on a non-conversion
  // strategy. The write succeeds (Google accepts it) but won't influence
  // bidding — surfacing the warning prevents the silent no-op trap that
  // burned us on cpcBidCeiling for MAXIMIZE_CLICKS.
  const warnings: string[] = [];
  if (
    params.targetCpaMicros !== undefined &&
    strategy !== "UNKNOWN" &&
    strategy !== "TARGET_CPA" &&
    strategy !== "MAXIMIZE_CONVERSIONS"
  ) {
    warnings.push(
      `targetCpaMicros was set, but campaign uses ${strategy} bidding — the value is stored on the ad group but won't influence bidding until the campaign switches to TARGET_CPA or MAXIMIZE_CONVERSIONS.`,
    );
  }

  try {
    await customer.mutateResources([
      {
        entity: "ad_group" as any,
        operation: "update",
        resource,
      },
    ]);

    // Pre-existing pattern (see updateConversionAction): pack warnings into
    // the `label` field as "Warning: …" so they reach the operations log
    // without expanding WriteResult.
    const labelPieces: string[] = [];
    const baseLabel = params.name?.trim() ?? currentName;
    if (baseLabel) labelPieces.push(baseLabel);
    if (warnings.length > 0) labelPieces.push(`Warning: ${warnings.join(". ")}`);

    return {
      success: true,
      action: "update_ad_group",
      entityId: adGroupId,
      beforeValue,
      afterValue,
      ...(labelPieces.length > 0 ? { label: labelPieces.join(" — ") } : {}),
    };
  } catch (error) {
    return {
      success: false,
      action: "update_ad_group",
      entityId: adGroupId,
      beforeValue,
      afterValue,
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Ad group ${adGroupId}`),
    };
  }
}

export async function renameAdGroup(
  auth: AuthContext,
  campaignId: string,
  adGroupId: string,
  newName: string,
): Promise<WriteResult> {
  if (isDemoAuth(auth)) return demoRenameAdGroup(adGroupId, newName, campaignId);
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  safeEntityId(campaignId);

  const trimmed = newName.trim();
  if (!trimmed) {
    return { success: false, action: "rename_ad_group", entityId: adGroupId, beforeValue: "", afterValue: "", error: "Ad group name cannot be empty" };
  }

  try {
    // Fetch current name for undo
    const rows = await customer.query(`
      SELECT ad_group.name FROM ad_group WHERE ad_group.id = ${safeEntityId(adGroupId)} LIMIT 1
    `);
    const oldName = (rows as any[])[0]?.ad_group?.name ?? "";

    await customer.mutateResources([
      {
        entity: "ad_group" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/adGroups/${adGroupId}`,
          name: trimmed,
        },
      },
    ]);

    return {
      success: true,
      action: "rename_ad_group",
      entityId: adGroupId,
      beforeValue: oldName,
      afterValue: trimmed,
      campaignId,
    };
  } catch (error) {
    return {
      success: false,
      action: "rename_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: trimmed,
      error: rewriteRemovedResourceError(extractErrorMessage(error), `Ad group ${adGroupId}`),
    };
  }
}
