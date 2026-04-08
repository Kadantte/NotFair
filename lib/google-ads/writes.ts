import { getCustomer, MATCH_TYPE, MATCH_TYPE_NAME, STATUS } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, Guardrails, UpdateCampaignBiddingParams, WriteResult } from "./types";
import { DEFAULT_GUARDRAILS } from "./types";

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

// ─── Write Functions ─────────────────────────────────────────────────

export async function pauseKeyword(
  auth: AuthContext,
  campaignId: string,
  adGroupId: string,
  criterionId: string,
  guardrails = DEFAULT_GUARDRAILS,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

  // Check blast radius: count active keywords in campaign + fetch target keyword text
  const countResult = await customer.query(`
    SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text
    FROM keyword_view
    WHERE campaign.id = ${cid}
      AND ad_group_criterion.status = 'ENABLED'
  `);
  const totalActive = (countResult as any[]).length;
  const targetRow = (countResult as any[]).find(
    (r) => String(r.ad_group_criterion?.criterion_id) === String(criterionId),
  );
  const keywordText = targetRow?.ad_group_criterion?.keyword?.text ?? null;

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
    return {
      success: false,
      action: "pause_keyword",
      entityId: criterionId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      error: extractErrorMessage(error),
    };
  }
}

export async function enableKeyword(
  auth: AuthContext,
  adGroupId: string,
  criterionId: string,
): Promise<WriteResult> {
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
      error: extractErrorMessage(error),
    };
  }
}

export async function addKeyword(
  auth: AuthContext,
  adGroupId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "BROAD",
): Promise<WriteResult> {
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
      error: extractErrorMessage(error),
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
  const strategy = row?.campaign?.bidding_strategy_type;
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
      return {
        success: false,
        action: "update_bid",
        entityId: criterionId,
        beforeValue: String(currentBidMicros),
        afterValue: String(newBidMicros),
        label: keywordText,
        error: `Bid change of ${(changePct * 100).toFixed(0)}% exceeds maximum allowed ${(guardrails.maxBidChangePct * 100).toFixed(0)}%. Use setGuardrails to adjust limits.`,
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
      error: extractErrorMessage(error),
    };
  }
}

export async function addNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "PHRASE",
): Promise<WriteResult> {
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
    return {
      success: false,
      action: "add_negative_keyword",
      entityId: text,
      beforeValue: "",
      afterValue: `${text}|${matchType}`,
      error: msg.includes("ALREADY_EXISTS")
        ? `Negative keyword "${text}" already exists in this campaign`
        : msg,
    };
  }
}

export async function removeNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
  matchType?: "BROAD" | "PHRASE" | "EXACT",
): Promise<WriteResult> {
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

    const match = (result as any[]).find(
      (row) => {
        if (row.campaign_criterion?.keyword?.text !== keywordText) return false;
        if (matchType && row.campaign_criterion?.keyword?.match_type !== MATCH_TYPE[matchType]) return false;
        return true;
      },
    );
    const criterionId = match?.campaign_criterion?.criterion_id;
    if (!criterionId) {
      return {
        success: false,
        action: "remove_negative_keyword",
        entityId: keywordText,
        beforeValue: keywordText,
        afterValue: "",
        error: `Negative keyword "${keywordText}" not found in campaign ${campaignId}`,
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
      error: extractErrorMessage(error),
    };
  }
}

export async function updateCampaignBudget(
  auth: AuthContext,
  campaignId: string,
  newDailyBudgetMicros: number,
  guardrails = DEFAULT_GUARDRAILS,
): Promise<WriteResult> {
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
      return {
        success: false,
        action: "update_budget",
        entityId: campaignId,
        beforeValue: String(currentBudgetMicros),
        afterValue: String(newDailyBudgetMicros),
        error: `Budget change of ${(changePct * 100).toFixed(0)}% exceeds maximum allowed ${(guardrails.maxBudgetChangePct * 100).toFixed(0)}%. Use setGuardrails to adjust limits.`,
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
      error: extractErrorMessage(error),
    };
  }
}

export async function updateCampaignBidding(
  auth: AuthContext,
  campaignId: string,
  params: UpdateCampaignBiddingParams,
): Promise<WriteResult> {
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
      campaign.target_roas.target_roas
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

  const beforeValue = JSON.stringify({
    strategy: currentStrategy,
    targetCpaMicros: currentTargetCpa,
    targetRoas: currentTargetRoas,
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
      resource.maximize_conversions = params.targetCpaMicros
        ? { target_cpa_micros: params.targetCpaMicros }
        : {};
      break;
    case "TARGET_ROAS":
      resource.target_roas = { target_roas: params.targetRoas };
      break;
    case "MAXIMIZE_CLICKS":
      resource.target_spend = {};
      break;
    case "MANUAL_CPC":
      resource.manual_cpc = { enhanced_cpc_enabled: false };
      break;
  }

  const afterValue = JSON.stringify({
    strategy: params.biddingStrategy,
    targetCpaMicros: params.targetCpaMicros ?? null,
    targetRoas: params.targetRoas ?? null,
  });

  try {
    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "update",
        resource,
      },
    ]);

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
      error: extractErrorMessage(error),
    };
  }
}

export async function pauseCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
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
      error: extractErrorMessage(error),
    };
  }
}

export async function removeCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
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
      error: extractErrorMessage(error),
    };
  }
}

// ─── Rename Campaign / Ad Group ─────────────────────────────────────────

export async function renameCampaign(
  auth: AuthContext,
  campaignId: string,
  newName: string,
): Promise<WriteResult> {
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
      error: extractErrorMessage(error),
    };
  }
}

export async function renameAdGroup(
  auth: AuthContext,
  campaignId: string,
  adGroupId: string,
  newName: string,
): Promise<WriteResult> {
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
      error: extractErrorMessage(error),
    };
  }
}
