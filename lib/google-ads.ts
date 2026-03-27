import { GoogleAdsApi } from "google-ads-api";
import { getRequiredEnv } from "@/lib/env";

// ─── Types ───────────────────────────────────────────────────────────

export type ConnectedAccount = {
  id: string;
  name: string;
};

/** Parse a JSON-encoded customer_ids string into ConnectedAccount[]. */
export function parseCustomerIds(raw: string | null | undefined): ConnectedAccount[] {
  if (!raw || raw === "[]") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is ConnectedAccount =>
        typeof item === "object" && item !== null && "id" in item,
    );
  } catch {
    return [];
  }
}

/** Derive a display name from a JSON-encoded customer_ids string. */
export function deriveCustomerName(raw: string | null | undefined): string {
  const accounts = parseCustomerIds(raw);
  if (accounts.length === 0) return "Google Ads Account";
  return accounts.map((a) => a.name || a.id).join(", ");
}

export type AuthContext = {
  refreshToken: string;
  customerId: string;
  customerIds?: ConnectedAccount[];
};

/**
 * Resolve the target account ID for a tool call.
 * If accountId is provided and is in the session's connected accounts, use it.
 * Otherwise fall back to the default customerId.
 */
export function resolveAccountId(auth: AuthContext, accountId?: string): string {
  if (!accountId) return auth.customerId;
  if (auth.customerIds?.some((a) => a.id === accountId)) return accountId;
  return auth.customerId;
}

/** Build an AuthContext targeting a specific account (for per-tool targeting). */
export function authForAccount(auth: AuthContext, accountId?: string): AuthContext {
  const targetId = resolveAccountId(auth, accountId);
  return { ...auth, customerId: targetId };
}

export type Guardrails = {
  maxBidChangePct: number;      // e.g. 0.25 = 25%
  maxBudgetChangePct: number;   // e.g. 0.50 = 50%
  maxKeywordPausePct: number;   // e.g. 0.30 = 30%
};

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxBidChangePct: 0.25,
  maxBudgetChangePct: 0.50,
  maxKeywordPausePct: 0.30,
};

export type WriteResult = {
  success: boolean;
  action: string;
  entityId: string;
  beforeValue: string;
  afterValue: string;
  error?: string;
};

// ─── Constants ───────────────────────────────────────────────────────

/** Google Ads API status enum values */
const STATUS = {
  ENABLED: 2,
  PAUSED: 3,
} as const;

// ─── Client Factory ──────────────────────────────────────────────────

function requiredEnv(name: string): string {
  return getRequiredEnv(name);
}

function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/-/g, "").trim();
}

export function getClient() {
  return new GoogleAdsApi({
    client_id: requiredEnv("GOOGLE_ADS_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_ADS_CLIENT_SECRET"),
    developer_token: requiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
  });
}

export function getCustomer(auth: AuthContext) {
  return getClient().Customer({
    customer_id: normalizeCustomerId(auth.customerId),
    refresh_token: auth.refreshToken,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(days - 1, 0));
  return { start: formatDate(start), end: formatDate(end) };
}

/** Convert micros (Google Ads) to dollars */
function micros(v: number | undefined): number {
  return v ? v / 1_000_000 : 0;
}

/** Convert dollars to micros (Google Ads) */
export function toMicros(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}

function safeCampaignId(campaignId: string): number {
  const id = Number(campaignId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Invalid campaign ID: ${campaignId}`);
  }
  return id;
}

// ─── Read Functions ──────────────────────────────────────────────────

export async function getAccountInfo(auth: AuthContext) {
  const customer = getCustomer(auth);
  const result = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.test_account,
      customer.manager
    FROM customer
    LIMIT 1
  `);
  const row = (result as any[])[0]?.customer;
  return {
    id: String(row?.id ?? normalizeCustomerId(auth.customerId)),
    name: row?.descriptive_name ?? "Untitled account",
    currencyCode: row?.currency_code ?? null,
    timeZone: row?.time_zone ?? null,
    isTestAccount: Boolean(row?.test_account),
    isManager: Boolean(row?.manager),
  };
}

export async function listAccessibleCustomers(refreshToken: string) {
  const client = getClient();
  const response = (await client.listAccessibleCustomers(refreshToken)) as {
    resource_names?: string[];
  };

  return Promise.all(
    (response.resource_names ?? []).map(async (resourceName) => {
      const customerId = resourceName.replace("customers/", "");
      try {
        const info = await getAccountInfo({ refreshToken, customerId });
        return info;
      } catch (error) {
        return {
          id: customerId,
          name: "Unavailable",
          currencyCode: null,
          timeZone: null,
          isTestAccount: false,
          isManager: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
  );
}

export async function listCampaigns(
  auth: AuthContext,
  options: { limit?: number; includeRemoved?: boolean } = {},
) {
  const customer = getCustomer(auth);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const where = options.includeRemoved
    ? ""
    : "WHERE campaign.status != 'REMOVED'";

  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    ${where}
    ORDER BY metrics.impressions DESC
    LIMIT ${limit}
  `);

  return (result as any[]).map((row) => ({
    id: String(row.campaign.id),
    name: row.campaign.name ?? "Untitled campaign",
    status: row.campaign.status ?? "UNKNOWN",
    channelType: row.campaign.advertising_channel_type ?? "UNKNOWN",
    biddingStrategy: row.campaign.bidding_strategy_type ?? "UNKNOWN",
    impressions: row.metrics.impressions ?? 0,
    clicks: row.metrics.clicks ?? 0,
    cost: micros(row.metrics.cost_micros),
    conversions: row.metrics.conversions ?? 0,
  }));
}

export async function getCampaignPerformance(
  auth: AuthContext,
  campaignId: string,
  days: number,
) {
  const customer = getCustomer(auth);
  const id = safeCampaignId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      campaign.id, campaign.name,
      segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE campaign.id = ${id}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY segments.date ASC
  `);

  const rows = (result as any[]).map((row) => ({
    date: row.segments.date,
    impressions: row.metrics.impressions ?? 0,
    clicks: row.metrics.clicks ?? 0,
    cost: micros(row.metrics.cost_micros),
    conversions: row.metrics.conversions ?? 0,
    conversionValue: row.metrics.conversions_value ?? 0,
    ctr: row.metrics.ctr ?? 0,
    averageCpc: micros(row.metrics.average_cpc),
  }));

  const totals = rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      cost: acc.cost + row.cost,
      conversions: acc.conversions + row.conversions,
      conversionValue: acc.conversionValue + row.conversionValue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
  );

  return {
    campaignId,
    campaignName: (result as any[])[0]?.campaign?.name ?? "Unknown",
    dateRange: { start, end, days: boundedDays },
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      averageCpc: totals.clicks > 0 ? totals.cost / totals.clicks : 0,
      cpa: totals.conversions > 0 ? totals.cost / totals.conversions : null,
      roas: totals.cost > 0 ? totals.conversionValue / totals.cost : null,
    },
    daily: rows,
  };
}

export async function getKeywords(
  auth: AuthContext,
  campaignId: string,
  days = 30,
  limit = 50,
) {
  const customer = getCustomer(auth);
  const id = safeCampaignId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.average_cpc, metrics.conversions
    FROM keyword_view
    WHERE campaign.id = ${id}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY metrics.impressions DESC
    LIMIT ${boundedLimit}
  `);

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    keywords: (result as any[]).map((row) => ({
      criterionId: String(row.ad_group_criterion.criterion_id),
      adGroupName: row.ad_group?.name ?? "Unknown",
      text: row.ad_group_criterion.keyword?.text ?? "",
      status: row.ad_group_criterion.status ?? "UNKNOWN",
      qualityScore: row.ad_group_criterion.quality_info?.quality_score ?? null,
      impressions: row.metrics.impressions ?? 0,
      clicks: row.metrics.clicks ?? 0,
      ctr: row.metrics.ctr ?? 0,
      cost: micros(row.metrics.cost_micros),
      averageCpc: micros(row.metrics.average_cpc),
      conversions: row.metrics.conversions ?? 0,
    })),
  };
}

export async function getSearchTermReport(
  auth: AuthContext,
  campaignId: string,
  days = 30,
  limit = 50,
) {
  const customer = getCustomer(auth);
  const id = safeCampaignId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.name,
      ad_group.name,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE campaign.id = ${id}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY metrics.cost_micros DESC
    LIMIT ${boundedLimit}
  `);

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    searchTerms: (result as any[]).map((row) => ({
      searchTerm: row.search_term_view.search_term ?? "",
      status: row.search_term_view.status ?? "UNKNOWN",
      campaignName: row.campaign?.name ?? "Unknown",
      adGroupName: row.ad_group?.name ?? "Unknown",
      impressions: row.metrics.impressions ?? 0,
      clicks: row.metrics.clicks ?? 0,
      ctr: row.metrics.ctr ?? 0,
      cost: micros(row.metrics.cost_micros),
      conversions: row.metrics.conversions ?? 0,
    })),
  };
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
  const cid = safeCampaignId(campaignId);

  // Check blast radius: count active keywords in campaign
  const countResult = await customer.query(`
    SELECT ad_group_criterion.criterion_id
    FROM keyword_view
    WHERE campaign.id = ${cid}
      AND ad_group_criterion.status = 'ENABLED'
  `);
  const totalActive = (countResult as any[]).length;

  // Count how many are already paused this session (tracked externally)
  // For single-action guardrail, we check: can't pause if it would exceed threshold
  if (totalActive <= 1) {
    return {
      success: false,
      action: "pause_keyword",
      entityId: criterionId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
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
    };
  } catch (error) {
    return {
      success: false,
      action: "pause_keyword",
      entityId: criterionId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function enableKeyword(
  auth: AuthContext,
  adGroupId: string,
  criterionId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);

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
    };
  } catch (error) {
    return {
      success: false,
      action: "enable_keyword",
      entityId: criterionId,
      beforeValue: "PAUSED",
      afterValue: "PAUSED",
      error: error instanceof Error ? error.message : "Unknown error",
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
  const cid = safeCampaignId(campaignId);

  // Check bidding strategy — manual bid overrides only work on MANUAL_CPC / ENHANCED_CPC
  const campaignResult = await customer.query(`
    SELECT campaign.bidding_strategy_type
    FROM campaign
    WHERE campaign.id = ${cid}
    LIMIT 1
  `);
  const strategy = (campaignResult as any[])[0]?.campaign?.bidding_strategy_type;
  const manualStrategies = ["MANUAL_CPC", "ENHANCED_CPC"];
  if (strategy && !manualStrategies.includes(strategy)) {
    return {
      success: false,
      action: "update_bid",
      entityId: criterionId,
      beforeValue: "N/A",
      afterValue: String(newBidMicros),
      error: `Bid changes not supported for ${strategy} strategy. Only MANUAL_CPC and ENHANCED_CPC allow individual bid overrides. Consider adjusting campaign budget instead.`,
    };
  }

  // Get current bid to enforce guardrail
  const currentResult = await customer.query(`
    SELECT ad_group_criterion.cpc_bid_micros
    FROM keyword_view
    WHERE campaign.id = ${cid}
      AND ad_group_criterion.criterion_id = ${Number(criterionId)}
    LIMIT 1
  `);
  const currentBidMicros =
    (currentResult as any[])[0]?.ad_group_criterion?.cpc_bid_micros ?? 0;

  if (currentBidMicros > 0) {
    const changePct = Math.abs(newBidMicros - currentBidMicros) / currentBidMicros;
    if (changePct > guardrails.maxBidChangePct) {
      return {
        success: false,
        action: "update_bid",
        entityId: criterionId,
        beforeValue: String(currentBidMicros),
        afterValue: String(newBidMicros),
        error: `Bid change of ${(changePct * 100).toFixed(0)}% exceeds maximum allowed ${(guardrails.maxBidChangePct * 100).toFixed(0)}%. Adjust guardrails via setGoals if needed.`,
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
    };
  } catch (error) {
    return {
      success: false,
      action: "update_bid",
      entityId: criterionId,
      beforeValue: String(currentBidMicros),
      afterValue: String(newBidMicros),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function addNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  safeCampaignId(campaignId);

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
            match_type: 2, // PHRASE match
          },
        },
      },
    ]);

    return {
      success: true,
      action: "add_negative_keyword",
      entityId: text,
      beforeValue: "",
      afterValue: text,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      action: "add_negative_keyword",
      entityId: text,
      beforeValue: "",
      afterValue: text,
      error: msg.includes("ALREADY_EXISTS")
        ? `Negative keyword "${text}" already exists in this campaign`
        : msg,
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
  const cid = safeCampaignId(campaignId);

  // Get current budget
  const result = await customer.query(`
    SELECT campaign.campaign_budget
    FROM campaign
    WHERE campaign.id = ${cid}
    LIMIT 1
  `);
  const budgetResourceName = (result as any[])[0]?.campaign?.campaign_budget;

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

  // Get current budget amount
  const budgetResult = await customer.query(`
    SELECT campaign_budget.amount_micros
    FROM campaign_budget
    WHERE campaign_budget.resource_name = '${budgetResourceName}'
    LIMIT 1
  `);
  const currentBudgetMicros =
    (budgetResult as any[])[0]?.campaign_budget?.amount_micros ?? 0;

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
        error: `Budget change of ${(changePct * 100).toFixed(0)}% exceeds maximum allowed ${(guardrails.maxBudgetChangePct * 100).toFixed(0)}%. Adjust guardrails via setGoals if needed.`,
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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function pauseCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  safeCampaignId(campaignId);

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
    return {
      success: false,
      action: "pause_campaign",
      entityId: campaignId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function enableCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  safeCampaignId(campaignId);

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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── Remove Negative Keyword (for undo) ─────────────────────────────

export async function removeNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = safeCampaignId(campaignId);

  try {
    // Find the negative keyword criterion by text.
    // Query all negatives for the campaign and filter in code to avoid GAQL string interpolation.
    const result = await customer.query(`
      SELECT campaign_criterion.resource_name, campaign_criterion.keyword.text
      FROM campaign_criterion
      WHERE campaign.id = ${cid}
        AND campaign_criterion.negative = TRUE
        AND campaign_criterion.type = 'KEYWORD'
    `);

    const match = (result as any[]).find(
      (row) => row.campaign_criterion?.keyword?.text === keywordText,
    );
    const resourceName = match?.campaign_criterion?.resource_name;
    if (!resourceName) {
      return {
        success: false,
        action: "remove_negative_keyword",
        entityId: keywordText,
        beforeValue: keywordText,
        afterValue: "",
        error: `Negative keyword "${keywordText}" not found in campaign ${campaignId}`,
      };
    }

    await customer.mutateResources([
      {
        entity: "campaign_criterion" as any,
        operation: "remove",
        resource: { resource_name: resourceName },
      },
    ]);

    return {
      success: true,
      action: "remove_negative_keyword",
      entityId: keywordText,
      beforeValue: keywordText,
      afterValue: "",
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_negative_keyword",
      entityId: keywordText,
      beforeValue: keywordText,
      afterValue: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── Create Campaign ─────────────────────────────────────────────────

export type CreateCampaignParams = {
  campaignName: string;
  dailyBudgetDollars: number;
  keywords: string[];
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  biddingStrategy?: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CLICKS" | "MANUAL_CPC";
  keywordMatchType?: "BROAD" | "PHRASE" | "EXACT";
};

export type CreateCampaignResult = {
  success: boolean;
  campaignName: string;
  campaignId?: string;
  adGroupId?: string;
  keywordCount?: number;
  dailyBudget?: number;
  biddingStrategy?: string;
  error?: string;
};

const MATCH_TYPE = { EXACT: 2, PHRASE: 3, BROAD: 4 } as const;

/**
 * Create a complete Search campaign: budget + campaign + ad group + keywords + RSA.
 * All resources are created atomically via batch mutate with temporary resource names.
 * Campaign starts PAUSED for safety — use enableCampaign to go live.
 */
export async function createSearchCampaign(
  auth: AuthContext,
  params: CreateCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // ── Validation ──
  if (params.headlines.length < 3 || params.headlines.length > 15) {
    return { success: false, campaignName: params.campaignName, error: "Responsive Search Ads require 3-15 headlines" };
  }
  if (params.descriptions.length < 2 || params.descriptions.length > 4) {
    return { success: false, campaignName: params.campaignName, error: "Responsive Search Ads require 2-4 descriptions" };
  }
  const longHeadline = params.headlines.find((h) => h.length > 30);
  if (longHeadline) {
    return { success: false, campaignName: params.campaignName, error: `Headline exceeds 30 chars: "${longHeadline}"` };
  }
  const longDesc = params.descriptions.find((d) => d.length > 90);
  if (longDesc) {
    return { success: false, campaignName: params.campaignName, error: `Description exceeds 90 chars: "${longDesc}"` };
  }
  if (params.dailyBudgetDollars < 1) {
    return { success: false, campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  }
  if (params.keywords.length < 1) {
    return { success: false, campaignName: params.campaignName, error: "At least 1 keyword is required" };
  }
  if (!params.finalUrl.startsWith("http")) {
    return { success: false, campaignName: params.campaignName, error: "Final URL must start with http:// or https://" };
  }

  const matchType = MATCH_TYPE[params.keywordMatchType ?? "BROAD"];
  const biddingStrategy = params.biddingStrategy ?? "MAXIMIZE_CONVERSIONS";

  // Build bidding strategy fields for campaign resource
  const biddingFields: Record<string, unknown> = {};
  switch (biddingStrategy) {
    case "MAXIMIZE_CONVERSIONS":
      biddingFields.maximize_conversions = {};
      break;
    case "MAXIMIZE_CLICKS":
      biddingFields.maximize_clicks = {};
      break;
    case "MANUAL_CPC":
      biddingFields.manual_cpc = { enhanced_cpc_enabled: false };
      break;
  }

  // Temporary resource names for atomic batch creation
  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const adGroupTemp = `customers/${cid}/adGroups/-3`;

  const operations: Array<{
    entity: string;
    operation: string;
    resource: Record<string, unknown>;
  }> = [
    // 1. Campaign Budget
    {
      entity: "campaign_budget",
      operation: "create",
      resource: {
        resource_name: budgetTemp,
        name: `${params.campaignName} Budget`,
        amount_micros: toMicros(params.dailyBudgetDollars),
        delivery_method: 2, // STANDARD
        explicitly_shared: false,
      },
    },
    // 2. Campaign (starts PAUSED)
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 2, // SEARCH
        campaign_budget: budgetTemp,
        network_settings: {
          target_google_search: true,
          target_search_network: false,
        },
        ...biddingFields,
      },
    },
    // 3. Ad Group
    {
      entity: "ad_group",
      operation: "create",
      resource: {
        resource_name: adGroupTemp,
        name: `${params.campaignName} - Ad Group 1`,
        campaign: campaignTemp,
        status: STATUS.ENABLED,
        type: 2, // SEARCH_STANDARD
      },
    },
    // 4. Keywords
    ...params.keywords.map((keyword) => ({
      entity: "ad_group_criterion",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        keyword: {
          text: keyword.trim(),
          match_type: matchType,
        },
      } as Record<string, unknown>,
    })),
    // 5. Responsive Search Ad
    {
      entity: "ad_group_ad",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        ad: {
          final_urls: [params.finalUrl],
          responsive_search_ad: {
            headlines: params.headlines.map((text) => ({ text })),
            descriptions: params.descriptions.map((text) => ({ text })),
          },
        },
      },
    },
  ];

  try {
    const response = await customer.mutateResources(operations as any);

    // Extract the real campaign ID from the batch response
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignResourceName =
      responses[1]?.campaign_result?.resource_name as string | undefined;
    let campaignId = campaignResourceName?.split("/").pop();

    // Fallback: query by name if we can't extract from response
    if (!campaignId) {
      const queryResult = await customer.query(`
        SELECT campaign.id, campaign.name
        FROM campaign
        WHERE campaign.status = 'PAUSED'
        ORDER BY campaign.id DESC
        LIMIT 10
      `);
      const match = (queryResult as any[]).find(
        (r) => r.campaign?.name === params.campaignName,
      );
      campaignId = String(match?.campaign?.id ?? "unknown");
    }

    // Extract ad group ID
    const adGroupResourceName =
      responses[2]?.ad_group_result?.resource_name as string | undefined;
    const adGroupId = adGroupResourceName?.split("/").pop();

    return {
      success: true,
      campaignName: params.campaignName,
      campaignId,
      adGroupId,
      keywordCount: params.keywords.length,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy,
    };
  } catch (error) {
    return {
      success: false,
      campaignName: params.campaignName,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Remove a campaign by setting its status to REMOVED.
 * Used for undoing campaign creation.
 */
export async function removeCampaign(
  auth: AuthContext,
  campaignId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  safeCampaignId(campaignId);

  try {
    await customer.mutateResources([
      {
        entity: "campaign" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${normalizeCustomerId(auth.customerId)}/campaigns/${campaignId}`,
          status: 4, // REMOVED
        },
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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── Safe GAQL Query ─────────────────────────────────────────────────

export async function runSafeGaqlReport(auth: AuthContext, rawQuery: string) {
  const query = rawQuery.trim();
  const normalized = query.toUpperCase();

  if (!normalized.startsWith("SELECT ")) {
    throw new Error("Only read-only SELECT GAQL queries are allowed.");
  }
  if (query.includes(";")) {
    throw new Error("Semicolons are not allowed in GAQL queries.");
  }

  const forbidden = [" INSERT ", " UPDATE ", " DELETE ", " CREATE ", " ALTER ", " DROP ", " TRUNCATE "];
  if (forbidden.some((term) => ` ${normalized} `.includes(term))) {
    throw new Error("The query contains forbidden keywords.");
  }

  const customer = getCustomer(auth);
  const rows = await customer.query(query);
  return { rowCount: rows.length, rows: rows.slice(0, 50) };
}
