/**
 * Portfolio bidding strategies (RMF C.96, C.97, M.96, M.97).
 *
 * Portfolio strategies are shared `bidding_strategy` resources that multiple
 * campaigns can reference via `campaign.bidding_strategy = bidding_strategies/{id}`.
 * This is distinct from "standard" bidding where the target CPA / ROAS is set
 * directly on the campaign resource (handled in writes.ts:updateCampaignBidding).
 */

import { getCachedCustomer, getCustomer } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

// BiddingStrategyStatus: ENABLED=2, REMOVED=4
const BS_STATUS = { ENABLED: 2, REMOVED: 4 } as const;

export type PortfolioStrategyType = "TARGET_CPA" | "TARGET_ROAS" | "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CONVERSION_VALUE";

export type CreateBiddingStrategyParams = {
  name: string;
  type: PortfolioStrategyType;
  /** Required for TARGET_CPA; optional cap for MAXIMIZE_CONVERSIONS. */
  targetCpaMicros?: number;
  /** Required for TARGET_ROAS; optional cap for MAXIMIZE_CONVERSION_VALUE. Format: 2.0 = 200% ROAS. */
  targetRoas?: number;
};

export type UpdateBiddingStrategyParams = {
  biddingStrategyId: string;
  name?: string;
  targetCpaMicros?: number;
  targetRoas?: number;
};

export type BiddingStrategyRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  targetCpaMicros: number | null;
  targetRoas: number | null;
  linkedCampaignCount: number;
};

// ─── Reads ──────────────────────────────────────────────────────────

/** List all portfolio bidding strategies on the account (excluding REMOVED). */
export async function listBiddingStrategies(auth: AuthContext): Promise<BiddingStrategyRow[]> {
  const customer = getCachedCustomer(auth);

  const strategyResult = await customer.query(`
    SELECT
      bidding_strategy.id,
      bidding_strategy.name,
      bidding_strategy.type,
      bidding_strategy.status,
      bidding_strategy.target_cpa.target_cpa_micros,
      bidding_strategy.target_roas.target_roas,
      bidding_strategy.maximize_conversions.target_cpa_micros,
      bidding_strategy.maximize_conversion_value.target_roas,
      bidding_strategy.campaign_count
    FROM bidding_strategy
    WHERE bidding_strategy.status != 'REMOVED'
    LIMIT 500
  `);

  return (strategyResult as any[]).map((row) => {
    const bs = row.bidding_strategy ?? {};
    const targetCpaMicros = bs.target_cpa?.target_cpa_micros
      ?? bs.maximize_conversions?.target_cpa_micros
      ?? null;
    const targetRoas = bs.target_roas?.target_roas
      ?? bs.maximize_conversion_value?.target_roas
      ?? null;
    return {
      id: String(bs.id ?? ""),
      name: bs.name ?? "",
      type: String(bs.type ?? "UNKNOWN"),
      status: String(bs.status ?? "UNKNOWN"),
      targetCpaMicros: targetCpaMicros != null ? Number(targetCpaMicros) : null,
      targetRoas: targetRoas != null ? Number(targetRoas) : null,
      linkedCampaignCount: Number(bs.campaign_count ?? 0),
    };
  });
}

/**
 * R.130 — Bidding Strategy performance report.
 * Required metrics: clicks, cost_micros, impressions, average_cpc,
 * conversions, cost_per_conversion. Status is required when showing
 * paused/active/removed strategies.
 */
export async function getBiddingStrategyPerformance(
  auth: AuthContext,
  params?: { days?: number; includeRemoved?: boolean },
): Promise<{
  strategies: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    clicks: number;
    costMicros: number;
    impressions: number;
    averageCpcMicros: number;
    conversions: number;
    costPerConversionMicros: number;
  }>;
  dateRange: { startDate: string; endDate: string };
}> {
  const customer = getCachedCustomer(auth);
  const days = Math.max(1, Math.min(365, params?.days ?? 30));
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const toYmd = (d: Date) => d.toISOString().slice(0, 10);
  const startDate = toYmd(start);
  const endDate = toYmd(end);

  const statusFilter = params?.includeRemoved
    ? ""
    : "AND bidding_strategy.status != 'REMOVED'";

  const result = await customer.query(`
    SELECT
      bidding_strategy.id,
      bidding_strategy.name,
      bidding_strategy.type,
      bidding_strategy.status,
      metrics.clicks,
      metrics.cost_micros,
      metrics.impressions,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM bidding_strategy
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ${statusFilter}
    LIMIT 500
  `);

  const strategies = (result as any[]).map((row) => {
    const bs = row.bidding_strategy ?? {};
    const m = row.metrics ?? {};
    return {
      id: String(bs.id ?? ""),
      name: bs.name ?? "",
      type: String(bs.type ?? "UNKNOWN"),
      status: String(bs.status ?? "UNKNOWN"),
      clicks: Number(m.clicks ?? 0),
      costMicros: Number(m.cost_micros ?? 0),
      impressions: Number(m.impressions ?? 0),
      averageCpcMicros: Number(m.average_cpc ?? 0),
      conversions: Number(m.conversions ?? 0),
      costPerConversionMicros: Number(m.cost_per_conversion ?? 0),
    };
  });

  return { strategies, dateRange: { startDate, endDate } };
}

// ─── Writes ─────────────────────────────────────────────────────────

function validateParams(type: PortfolioStrategyType, targetCpaMicros?: number, targetRoas?: number): string | null {
  if (type === "TARGET_CPA" && targetCpaMicros == null) {
    return "targetCpaMicros is required for TARGET_CPA strategy";
  }
  if (type === "TARGET_ROAS" && targetRoas == null) {
    return "targetRoas is required for TARGET_ROAS strategy (e.g. 2.0 = 200% ROAS)";
  }
  if (targetCpaMicros != null && targetCpaMicros < 100_000) {
    return "Target CPA must be at least $0.10 (100,000 micros)";
  }
  if (targetRoas != null && targetRoas <= 0) {
    return "Target ROAS must be greater than 0";
  }
  return null;
}

export async function createBiddingStrategy(
  auth: AuthContext,
  params: CreateBiddingStrategyParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);

  if (!params.name || !params.name.trim()) {
    return {
      success: false,
      action: "create_bidding_strategy",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Strategy name cannot be empty",
    };
  }

  const err = validateParams(params.type, params.targetCpaMicros, params.targetRoas);
  if (err) {
    return {
      success: false,
      action: "create_bidding_strategy",
      entityId: "",
      beforeValue: "",
      afterValue: params.type,
      error: err,
    };
  }

  const resource: Record<string, unknown> = {
    name: params.name.trim(),
  };
  switch (params.type) {
    case "TARGET_CPA":
      resource.target_cpa = { target_cpa_micros: params.targetCpaMicros };
      break;
    case "TARGET_ROAS":
      resource.target_roas = { target_roas: params.targetRoas };
      break;
    case "MAXIMIZE_CONVERSIONS":
      resource.maximize_conversions = { target_cpa_micros: params.targetCpaMicros ?? 0 };
      break;
    case "MAXIMIZE_CONVERSION_VALUE":
      resource.maximize_conversion_value = { target_roas: params.targetRoas ?? 0 };
      break;
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "bidding_strategy" as any,
        operation: "create",
        resource,
      },
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const rn = responses[0]?.bidding_strategy_result?.resource_name as string | undefined;
    const id = rn?.split("/").pop() ?? "";

    return {
      success: true,
      action: "create_bidding_strategy",
      entityId: id,
      beforeValue: "",
      afterValue: JSON.stringify({
        name: params.name,
        type: params.type,
        targetCpaMicros: params.targetCpaMicros ?? null,
        targetRoas: params.targetRoas ?? null,
      }),
      label: params.name,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_bidding_strategy",
      entityId: "",
      beforeValue: "",
      afterValue: params.type,
      error: extractErrorMessage(error),
    };
  }
}

export async function updateBiddingStrategy(
  auth: AuthContext,
  params: UpdateBiddingStrategyParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const sid = safeEntityId(params.biddingStrategyId);
  const customerId = normalizeCustomerId(auth.customerId);
  const resourceName = `customers/${customerId}/biddingStrategies/${sid}`;

  // Fetch current state
  const currentResult = await customer.query(`
    SELECT
      bidding_strategy.id,
      bidding_strategy.name,
      bidding_strategy.type,
      bidding_strategy.target_cpa.target_cpa_micros,
      bidding_strategy.target_roas.target_roas,
      bidding_strategy.maximize_conversions.target_cpa_micros,
      bidding_strategy.maximize_conversion_value.target_roas
    FROM bidding_strategy
    WHERE bidding_strategy.id = ${sid}
    LIMIT 1
  `);
  const row = (currentResult as any[])[0]?.bidding_strategy;
  if (!row) {
    return {
      success: false,
      action: "update_bidding_strategy",
      entityId: params.biddingStrategyId,
      beforeValue: "",
      afterValue: "",
      error: `Bidding strategy ${params.biddingStrategyId} not found`,
    };
  }

  const type = String(row.type);
  const beforeValue = JSON.stringify({
    name: row.name,
    type,
    targetCpaMicros: row.target_cpa?.target_cpa_micros ?? row.maximize_conversions?.target_cpa_micros ?? null,
    targetRoas: row.target_roas?.target_roas ?? row.maximize_conversion_value?.target_roas ?? null,
  });

  if (params.targetCpaMicros != null && params.targetCpaMicros < 100_000) {
    return {
      success: false,
      action: "update_bidding_strategy",
      entityId: params.biddingStrategyId,
      beforeValue,
      afterValue: "",
      error: "Target CPA must be at least $0.10 (100,000 micros)",
    };
  }
  if (params.targetRoas != null && params.targetRoas <= 0) {
    return {
      success: false,
      action: "update_bidding_strategy",
      entityId: params.biddingStrategyId,
      beforeValue,
      afterValue: "",
      error: "Target ROAS must be greater than 0",
    };
  }

  const resource: Record<string, unknown> = { resource_name: resourceName };
  if (params.name != null && params.name.trim()) {
    resource.name = params.name.trim();
  }
  if (params.targetCpaMicros != null) {
    // Which field to set depends on the existing strategy type
    if (type === "TARGET_CPA" || type === "6") {
      resource.target_cpa = { target_cpa_micros: params.targetCpaMicros };
    } else if (type === "MAXIMIZE_CONVERSIONS" || type === "10") {
      resource.maximize_conversions = { target_cpa_micros: params.targetCpaMicros };
    } else {
      return {
        success: false,
        action: "update_bidding_strategy",
        entityId: params.biddingStrategyId,
        beforeValue,
        afterValue: "",
        error: `Cannot set targetCpaMicros on strategy of type ${type}`,
      };
    }
  }
  if (params.targetRoas != null) {
    if (type === "TARGET_ROAS" || type === "8") {
      resource.target_roas = { target_roas: params.targetRoas };
    } else if (type === "MAXIMIZE_CONVERSION_VALUE" || type === "11") {
      resource.maximize_conversion_value = { target_roas: params.targetRoas };
    } else {
      return {
        success: false,
        action: "update_bidding_strategy",
        entityId: params.biddingStrategyId,
        beforeValue,
        afterValue: "",
        error: `Cannot set targetRoas on strategy of type ${type}`,
      };
    }
  }

  try {
    await customer.mutateResources([
      {
        entity: "bidding_strategy" as any,
        operation: "update",
        resource,
      },
    ]);

    return {
      success: true,
      action: "update_bidding_strategy",
      entityId: params.biddingStrategyId,
      beforeValue,
      afterValue: JSON.stringify({
        name: params.name ?? row.name,
        type,
        targetCpaMicros: params.targetCpaMicros ?? null,
        targetRoas: params.targetRoas ?? null,
      }),
    };
  } catch (error) {
    return {
      success: false,
      action: "update_bidding_strategy",
      entityId: params.biddingStrategyId,
      beforeValue,
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}

/**
 * "Remove" a portfolio bidding strategy. Google Ads API requires REMOVED
 * strategies to be unreferenced by any campaign; the caller is responsible
 * for unlinking campaigns first.
 */
export async function removeBiddingStrategy(
  auth: AuthContext,
  biddingStrategyId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const sid = safeEntityId(biddingStrategyId);
  const customerId = normalizeCustomerId(auth.customerId);
  const resourceName = `customers/${customerId}/biddingStrategies/${sid}`;

  try {
    await customer.mutateResources([
      {
        entity: "bidding_strategy" as any,
        operation: "remove",
        resource: resourceName as any,
      },
    ]);

    return {
      success: true,
      action: "remove_bidding_strategy",
      entityId: biddingStrategyId,
      beforeValue: "",
      afterValue: "REMOVED",
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_bidding_strategy",
      entityId: biddingStrategyId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}

/**
 * Link a campaign to a portfolio bidding strategy (C.96/97 via portfolio path,
 * M.96/97 when editing an existing campaign).
 *
 * This sets `campaign.bidding_strategy = biddingStrategies/{id}` and clears
 * any standard (campaign-level) bidding config.
 */
export async function linkCampaignToBiddingStrategy(
  auth: AuthContext,
  campaignId: string,
  biddingStrategyId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);
  const sid = safeEntityId(biddingStrategyId);
  const customerId = normalizeCustomerId(auth.customerId);
  const campaignResourceName = `customers/${customerId}/campaigns/${cid}`;
  const strategyResourceName = `customers/${customerId}/biddingStrategies/${sid}`;

  // Fetch current link for beforeValue
  const currentResult = await customer.query(`
    SELECT campaign.bidding_strategy, campaign.bidding_strategy_type
    FROM campaign
    WHERE campaign.id = ${cid}
    LIMIT 1
  `);
  const row = (currentResult as any[])[0];
  if (!row) {
    return {
      success: false,
      action: "link_campaign_to_bidding_strategy",
      entityId: campaignId,
      beforeValue: "",
      afterValue: biddingStrategyId,
      error: "Campaign not found",
    };
  }
  const beforeValue = row.campaign?.bidding_strategy
    ? String(row.campaign.bidding_strategy)
    : String(row.campaign?.bidding_strategy_type ?? "STANDARD");

  try {
    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "update",
        resource: {
          resource_name: campaignResourceName,
          bidding_strategy: strategyResourceName,
        },
      },
    ]);

    return {
      success: true,
      action: "link_campaign_to_bidding_strategy",
      entityId: campaignId,
      beforeValue,
      afterValue: strategyResourceName,
    };
  } catch (error) {
    return {
      success: false,
      action: "link_campaign_to_bidding_strategy",
      entityId: campaignId,
      beforeValue,
      afterValue: biddingStrategyId,
      error: extractErrorMessage(error),
    };
  }
}
