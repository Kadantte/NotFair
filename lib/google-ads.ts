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
  userId?: string | null;
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
  /** Owning campaign ID — set by operations that resolve it as a side-effect (e.g. ad_group/ad tracking template updates). */
  campaignId?: string | null;
};

// ─── Constants ───────────────────────────────────────────────────────

/** Google Ads API status enum values */
const STATUS = {
  ENABLED: 2,
  PAUSED: 3,
} as const;

const AD_GROUP_TYPE = {
  SEARCH_STANDARD: 2,
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

/**
 * Extract a meaningful error message from Google Ads API errors.
 * The google-ads-api library throws GoogleAdsFailure objects (not Error instances)
 * with an `errors` array containing detailed failure info.
 */
function extractErrorMessage(error: unknown): string {
  // Always log the raw error for server-side debugging
  console.error("[google-ads] API error:", error);

  // Standard Error
  if (error instanceof Error) return error.message;

  // GoogleAdsFailure — has an `errors` array with `message` and `error_code` fields
  if (error && typeof error === "object" && "errors" in error) {
    const failures = (error as { errors: Array<{ message?: string; error_code?: Record<string, unknown> }> }).errors;
    if (Array.isArray(failures) && failures.length > 0) {
      const messages = failures.map((f) => {
        const code = f.error_code ? Object.entries(f.error_code).map(([k, v]) => `${k}=${v}`).join(", ") : "";
        return f.message ? `${f.message}${code ? ` (${code})` : ""}` : code;
      }).filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
  }

  // Fallback: try to stringify
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}

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

function safeEntityId(value: string, label = "campaign"): number {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Invalid ${label} ID: ${value}`);
  }
  return id;
}

function isValidFinalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns null if valid, or an error message string. */
function validateRsaAssets(headlines: string[], descriptions: string[]): string | null {
  if (headlines.length < 3 || headlines.length > 15) return "RSA requires 3-15 headlines";
  if (descriptions.length < 2 || descriptions.length > 4) return "RSA requires 2-4 descriptions";
  const longHeadline = headlines.find((h) => h.length > 30);
  if (longHeadline) return `Headline exceeds 30 chars: "${longHeadline}"`;
  const longDesc = descriptions.find((d) => d.length > 90);
  if (longDesc) return `Description exceeds 90 chars: "${longDesc}"`;
  return null;
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
          error: extractErrorMessage(error),
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
  const id = safeEntityId(campaignId);
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
  const id = safeEntityId(campaignId);
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
  const id = safeEntityId(campaignId);
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
  const cid = safeEntityId(campaignId);

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
      error: extractErrorMessage(error),
    };
  }
}

export async function addNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
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
    const msg = extractErrorMessage(error);
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
  const cid = safeEntityId(campaignId);

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
    return {
      success: false,
      action: "pause_campaign",
      entityId: campaignId,
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      error: extractErrorMessage(error),
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

// ─── Remove Negative Keyword (for undo) ─────────────────────────────

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

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_criterion" as any,
        operation: "remove",
        resource: {
          resource_name: `customers/${cid}/adGroupCriteria/${adGroupId}~${criterionId}`,
        },
      },
    ]);

    return {
      success: true,
      action: "remove_keyword",
      entityId: criterionId,
      beforeValue: criterionId,
      afterValue: "",
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

export async function removeNegativeKeyword(
  auth: AuthContext,
  campaignId: string,
  keywordText: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

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
      error: extractErrorMessage(error),
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
  const rsaError = validateRsaAssets(params.headlines, params.descriptions);
  if (rsaError) {
    return { success: false, campaignName: params.campaignName, error: rsaError };
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
      biddingFields.target_spend = {};
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
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
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
      error: extractErrorMessage(error),
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
  safeEntityId(campaignId);

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
      error: extractErrorMessage(error),
    };
  }
}

// ─── Tracking Templates ──────────────────────────────────────────────

export type TrackingTemplateLevel = "account" | "campaign" | "ad_group" | "ad";

/** Format: "account" | "campaign:{id}" | "ad_group:{id}" | "ad:{id}" */
export function encodeTrackingEntityId(level: TrackingTemplateLevel, entityId?: string): string {
  if (level === "account") return "account";
  return `${level}:${entityId}`;
}

export function decodeTrackingEntityId(encoded: string): { level: TrackingTemplateLevel; entityId?: string } {
  if (encoded === "account") return { level: "account" };
  const idx = encoded.indexOf(":");
  if (idx === -1) throw new Error(`Cannot undo: unrecognized tracking entity ID format "${encoded}"`);
  const level = encoded.slice(0, idx) as TrackingTemplateLevel;
  const entityId = encoded.slice(idx + 1);
  if (!["campaign", "ad_group", "ad"].includes(level)) {
    throw new Error(`Cannot undo: unknown tracking level "${level}" in entity ID "${encoded}"`);
  }
  return { level, entityId };
}

export async function getTrackingTemplate(
  auth: AuthContext,
  level: TrackingTemplateLevel,
  entityId?: string,
): Promise<{ level: string; entityId: string; trackingTemplate: string | null; campaignId?: string | null }> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  switch (level) {
    case "account": {
      const result = await customer.query(`
        SELECT customer.tracking_url_template
        FROM customer
        LIMIT 1
      `);
      const row = (result as any[])[0]?.customer;
      return { level, entityId: cid, trackingTemplate: row?.tracking_url_template ?? null };
    }
    case "campaign": {
      if (!entityId) throw new Error("entityId (campaignId) is required for campaign level");
      const id = safeEntityId(entityId);
      const result = await customer.query(`
        SELECT campaign.tracking_url_template
        FROM campaign
        WHERE campaign.id = ${id}
        LIMIT 1
      `);
      const row = (result as any[])[0]?.campaign;
      return { level, entityId, trackingTemplate: row?.tracking_url_template ?? null };
    }
    case "ad_group": {
      if (!entityId) throw new Error("entityId (adGroupId) is required for ad_group level");
      const id = Number(entityId);
      if (!Number.isFinite(id) || id <= 0) throw new Error(`Invalid adGroupId: ${entityId}`);
      // Single query fetches template + owning campaign in one round-trip
      const result = await customer.query(`
        SELECT ad_group.tracking_url_template, campaign.id
        FROM ad_group
        WHERE ad_group.id = ${id}
        LIMIT 1
      `);
      const row = (result as any[])[0];
      return {
        level,
        entityId,
        trackingTemplate: row?.ad_group?.tracking_url_template ?? null,
        campaignId: row?.campaign?.id ? String(row.campaign.id) : null,
      };
    }
    case "ad": {
      if (!entityId) throw new Error("entityId (adId) is required for ad level");
      const id = Number(entityId);
      if (!Number.isFinite(id) || id <= 0) throw new Error(`Invalid adId: ${entityId}`);
      // Single query fetches template + owning campaign in one round-trip
      const result = await customer.query(`
        SELECT ad_group_ad.ad.tracking_url_template, campaign.id
        FROM ad_group_ad
        WHERE ad_group_ad.ad.id = ${id}
        LIMIT 1
      `);
      const row = (result as any[])[0];
      return {
        level,
        entityId,
        trackingTemplate: row?.ad_group_ad?.ad?.tracking_url_template ?? null,
        campaignId: row?.campaign?.id ? String(row.campaign.id) : null,
      };
    }
  }
}

export async function setTrackingTemplate(
  auth: AuthContext,
  level: TrackingTemplateLevel,
  trackingTemplate: string,
  entityId?: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const encoded = encodeTrackingEntityId(level, entityId);

  if (trackingTemplate !== "" && !trackingTemplate.includes("{lpurl}")) {
    return {
      success: false,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue: "",
      afterValue: trackingTemplate,
      error: 'Tracking template must contain {lpurl} (e.g. "{lpurl}?utm_source=google&utm_medium=cpc"). Pass an empty string to clear the template.',
    };
  }

  // Fetch current state before writing — required for accurate undo record.
  // Also resolves the owning campaignId for ad_group/ad levels in the same query.
  // If the fetch fails, abort: a write with a wrong beforeValue cannot be safely undone.
  let prefetch: Awaited<ReturnType<typeof getTrackingTemplate>>;
  try {
    prefetch = await getTrackingTemplate(auth, level, entityId);
  } catch (fetchError) {
    return {
      success: false,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue: "",
      afterValue: trackingTemplate,
      error: `Could not read current tracking template before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  const beforeValue = prefetch.trackingTemplate ?? "";

  try {
    switch (level) {
      case "account":
        await customer.mutateResources([
          {
            entity: "customer" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      case "campaign": {
        if (!entityId) throw new Error("entityId (campaignId) is required");
        const campaignIdNum = safeEntityId(entityId);
        await customer.mutateResources([
          {
            entity: "campaign" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}/campaigns/${campaignIdNum}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      }
      case "ad_group": {
        if (!entityId) throw new Error("entityId (adGroupId) is required");
        const agId = Number(entityId);
        if (!Number.isFinite(agId) || agId <= 0) throw new Error(`Invalid adGroupId: ${entityId}`);
        await customer.mutateResources([
          {
            entity: "ad_group" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}/adGroups/${agId}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      }
      case "ad": {
        if (!entityId) throw new Error("entityId (adId) is required");
        const adId = Number(entityId);
        if (!Number.isFinite(adId) || adId <= 0) throw new Error(`Invalid adId: ${entityId}`);
        await customer.mutateResources([
          {
            entity: "ad" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}/ads/${adId}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      }
    }

    return {
      success: true,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue,
      afterValue: trackingTemplate,
      campaignId: prefetch.campaignId,
    };
  } catch (error) {
    return {
      success: false,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue,
      afterValue: trackingTemplate,
      error: extractErrorMessage(error),
    };
  }
}

// ─── Ad Group Management ─────────────────────────────────────────────

export async function listAdGroups(
  auth: AuthContext,
  campaignId: string,
  limit = 50,
) {
  const customer = getCustomer(auth);
  const id = safeEntityId(campaignId);
  const bounded = Math.min(Math.max(limit, 1), 100);

  const result = await customer.query(`
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${id}
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
    LIMIT ${bounded}
  `);

  return (result as any[]).map((row) => ({
    id: String(row.ad_group.id),
    name: row.ad_group.name ?? "Untitled ad group",
    status: row.ad_group.status ?? "UNKNOWN",
    type: row.ad_group.type ?? "UNKNOWN",
    impressions: row.metrics?.impressions ?? 0,
    clicks: row.metrics?.clicks ?? 0,
    cost: micros(row.metrics?.cost_micros),
    conversions: row.metrics?.conversions ?? 0,
  }));
}

export async function createAdGroup(
  auth: AuthContext,
  campaignId: string,
  adGroupName: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const campaignIdNum = safeEntityId(campaignId);

  if (!adGroupName.trim()) {
    return { success: false, action: "create_ad_group", entityId: "", beforeValue: "", afterValue: "", error: "Ad group name cannot be empty" };
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "ad_group" as any,
        operation: "create",
        resource: {
          name: adGroupName.trim(),
          campaign: `customers/${cid}/campaigns/${campaignIdNum}`,
          status: STATUS.ENABLED,
          type: AD_GROUP_TYPE.SEARCH_STANDARD,
        },
      },
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.ad_group_result?.resource_name as string | undefined;
    const adGroupId = resourceName?.split("/").pop() ?? "";

    if (!adGroupId) {
      return { success: false, action: "create_ad_group", entityId: "", beforeValue: "", afterValue: adGroupName, error: "Ad group created but ID could not be extracted from response" };
    }

    return {
      success: true,
      action: "create_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: adGroupName,
      campaignId,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_ad_group",
      entityId: "",
      beforeValue: "",
      afterValue: adGroupName,
      error: extractErrorMessage(error),
    };
  }
}

// ─── Ad Management ───────────────────────────────────────────────────

export async function listAds(
  auth: AuthContext,
  campaignId: string,
  adGroupId?: string,
  limit = 50,
) {
  const customer = getCustomer(auth);
  const id = safeEntityId(campaignId);
  const bounded = Math.min(Math.max(limit, 1), 100);

  const adGroupIdNum = adGroupId ? safeEntityId(adGroupId, "ad group") : null;
  const adGroupFilter = adGroupIdNum ? `AND ad_group.id = ${adGroupIdNum}` : "";

  const result = await customer.query(`
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group_ad
    WHERE campaign.id = ${id}
      AND ad_group_ad.status != 'REMOVED'
      ${adGroupFilter}
    ORDER BY metrics.impressions DESC
    LIMIT ${bounded}
  `);

  return (result as any[]).map((row) => {
    const ad = row.ad_group_ad?.ad ?? {};
    const rsa = ad.responsive_search_ad ?? {};
    return {
      adId: String(ad.id ?? ""),
      adName: ad.name ?? null,
      status: row.ad_group_ad?.status ?? "UNKNOWN",
      type: ad.type ?? "UNKNOWN",
      adGroupId: String(row.ad_group?.id ?? ""),
      adGroupName: row.ad_group?.name ?? "",
      finalUrls: ad.final_urls ?? [],
      headlines: (rsa.headlines ?? []).map((h: any) => h.text ?? ""),
      descriptions: (rsa.descriptions ?? []).map((d: any) => d.text ?? ""),
      impressions: row.metrics?.impressions ?? 0,
      clicks: row.metrics?.clicks ?? 0,
      cost: micros(row.metrics?.cost_micros),
      conversions: row.metrics?.conversions ?? 0,
    };
  });
}

export type CreateAdParams = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
};

export async function createAd(
  auth: AuthContext,
  adGroupId: string,
  params: CreateAdParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const rsaError = validateRsaAssets(params.headlines, params.descriptions);
  if (rsaError) {
    return { success: false, action: "create_ad", entityId: "", beforeValue: "", afterValue: "", error: rsaError };
  }
  let adGroupIdNum: number;
  try {
    adGroupIdNum = safeEntityId(adGroupId, "ad group");
  } catch (e) {
    return { success: false, action: "create_ad", entityId: "", beforeValue: "", afterValue: "", error: (e as Error).message };
  }
  if (!isValidFinalUrl(params.finalUrl)) {
    return { success: false, action: "create_ad", entityId: "", beforeValue: "", afterValue: "", error: "Final URL must start with http:// or https://" };
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "ad_group_ad" as any,
        operation: "create",
        resource: {
          ad_group: `customers/${cid}/adGroups/${adGroupIdNum}`,
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
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.ad_group_ad_result?.resource_name as string | undefined;
    // resource_name format: customers/{cid}/adGroupAds/{adGroupId}~{adId}
    const adId = resourceName?.split("~").pop() ?? "";

    if (!adId) {
      return { success: false, action: "create_ad", entityId: "", beforeValue: adGroupId, afterValue: params.finalUrl, error: "Ad created but ID could not be extracted from response" };
    }

    return {
      success: true,
      action: "create_ad",
      entityId: adId,
      beforeValue: adGroupId,
      afterValue: params.finalUrl,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_ad",
      entityId: "",
      beforeValue: adGroupId,
      afterValue: params.finalUrl,
      error: extractErrorMessage(error),
    };
  }
}

async function setAdStatus(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
  pause: boolean,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const action = pause ? "pause_ad" : "enable_ad";
  const targetStatus = pause ? STATUS.PAUSED : STATUS.ENABLED;

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_ad" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/adGroupAds/${adGroupId}~${adId}`,
          status: targetStatus,
        },
      },
    ]);

    return {
      success: true,
      action,
      entityId: adId,
      beforeValue: adGroupId, // stored for undo (needs adGroupId + adId)
      afterValue: pause ? "PAUSED" : "ENABLED",
    };
  } catch (error) {
    return {
      success: false,
      action,
      entityId: adId,
      beforeValue: adGroupId,
      afterValue: pause ? "ENABLED" : "PAUSED",
      error: extractErrorMessage(error),
    };
  }
}

export async function pauseAd(auth: AuthContext, adGroupId: string, adId: string): Promise<WriteResult> {
  return setAdStatus(auth, adGroupId, adId, true);
}

export async function enableAd(auth: AuthContext, adGroupId: string, adId: string): Promise<WriteResult> {
  return setAdStatus(auth, adGroupId, adId, false);
}

export async function updateAdFinalUrl(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
  finalUrl: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const entityId = `${adGroupId}~${adId}`;

  if (!isValidFinalUrl(finalUrl)) {
    return { success: false, action: "update_ad_final_url", entityId, beforeValue: "", afterValue: finalUrl, error: "Final URL must start with http:// or https://" };
  }

  let adIdNum: number;
  let adGroupIdNum: number;
  try {
    adIdNum = safeEntityId(adId, "ad");
    adGroupIdNum = safeEntityId(adGroupId, "ad group");
  } catch (e) {
    return { success: false, action: "update_ad_final_url", entityId, beforeValue: "", afterValue: finalUrl, error: (e as Error).message };
  }

  // Fetch current URL for undo record, scoped to the correct ad group.
  // Abort if fetch fails — proceeding with empty beforeValue would cause undo to set URL to "".
  let beforeValue: string;
  try {
    const current = await customer.query(`
      SELECT ad_group_ad.ad.final_urls
      FROM ad_group_ad
      WHERE ad_group_ad.ad.id = ${adIdNum}
        AND ad_group.id = ${adGroupIdNum}
      LIMIT 1
    `);
    beforeValue = (current as any[])[0]?.ad_group_ad?.ad?.final_urls?.[0] ?? "";
  } catch (fetchError) {
    return {
      success: false,
      action: "update_ad_final_url",
      entityId,
      beforeValue: "",
      afterValue: finalUrl,
      error: `Could not read current final URL before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  try {
    await customer.mutateResources([
      {
        entity: "ad" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/ads/${adId}`,
          final_urls: [finalUrl],
        },
      },
    ]);

    return {
      success: true,
      action: "update_ad_final_url",
      entityId,
      beforeValue,
      afterValue: finalUrl,
    };
  } catch (error) {
    return {
      success: false,
      action: "update_ad_final_url",
      entityId,
      beforeValue,
      afterValue: finalUrl,
      error: extractErrorMessage(error),
    };
  }
}

export type UpdateAdAssetsParams = {
  headlines: string[];
  descriptions: string[];
};

export async function updateAdAssets(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
  params: UpdateAdAssetsParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const entityId = `${adGroupId}~${adId}`;

  const rsaError = validateRsaAssets(params.headlines, params.descriptions);
  if (rsaError) {
    return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: rsaError };
  }

  let adIdNum: number;
  let adGroupIdNum: number;
  try {
    adIdNum = safeEntityId(adId, "ad");
    adGroupIdNum = safeEntityId(adGroupId, "ad group");
  } catch (e) {
    return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: (e as Error).message };
  }

  // Fetch current assets for undo record, scoped to the correct ad group.
  // Abort if fetch fails — proceeding with empty beforeValue would cause undo to restore empty assets.
  let beforeValue: string;
  try {
    const current = await customer.query(`
      SELECT
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions
      FROM ad_group_ad
      WHERE ad_group_ad.ad.id = ${adIdNum}
        AND ad_group.id = ${adGroupIdNum}
      LIMIT 1
    `);
    const row = (current as any[])[0]?.ad_group_ad?.ad?.responsive_search_ad ?? {};
    beforeValue = JSON.stringify({
      h: (row.headlines ?? []).map((x: any) => x.text ?? ""),
      d: (row.descriptions ?? []).map((x: any) => x.text ?? ""),
    });
  } catch (fetchError) {
    return {
      success: false,
      action: "update_ad_assets",
      entityId,
      beforeValue: "",
      afterValue: "",
      error: `Could not read current ad assets before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  const afterValue = JSON.stringify({
    h: params.headlines,
    d: params.descriptions,
  });

  try {
    await customer.mutateResources([
      {
        entity: "ad" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/ads/${adId}`,
          responsive_search_ad: {
            headlines: params.headlines.map((text) => ({ text })),
            descriptions: params.descriptions.map((text) => ({ text })),
          },
        },
      },
    ]);

    return {
      success: true,
      action: "update_ad_assets",
      entityId,
      beforeValue,
      afterValue,
    };
  } catch (error) {
    return {
      success: false,
      action: "update_ad_assets",
      entityId,
      beforeValue,
      afterValue,
      error: extractErrorMessage(error),
    };
  }
}

// ─── Bulk Operations ─────────────────────────────────────────────────

export type BulkBidUpdate = {
  campaignId: string;
  adGroupId: string;
  criterionId: string;
  newBidDollars: number;
};

export async function bulkUpdateBids(
  auth: AuthContext,
  updates: BulkBidUpdate[],
  guardrails = DEFAULT_GUARDRAILS,
): Promise<Array<WriteResult & { input: BulkBidUpdate }>> {
  const CHUNK_SIZE = 5;
  const results: Array<WriteResult & { input: BulkBidUpdate }> = [];
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (u) => {
        const result = await updateBid(auth, u.campaignId, u.adGroupId, u.criterionId, toMicros(u.newBidDollars), guardrails);
        return { ...result, input: u };
      }),
    );
    results.push(...chunkResults);
  }
  return results;
}

// ─── Analytics & Settings ────────────────────────────────────────────

export async function getImpressionShare(
  auth: AuthContext,
  campaignId: string,
  days: number,
) {
  const customer = getCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 90);
  const { start, end } = getDateRange(boundedDays);

  // Query without date segmentation to get Google's correctly weighted aggregate IS values
  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_absolute_top_impression_share,
      metrics.search_top_impression_share,
      metrics.search_exact_match_impression_share,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.id = ${id}
      AND segments.date BETWEEN '${start}' AND '${end}'
    LIMIT 1
  `);

  const row = (result as any[])[0];
  if (!row) {
    return { campaignId, days: boundedDays, impressionShare: null, message: "No data for this date range" };
  }

  const m = row.metrics ?? {};
  return {
    campaignId,
    campaignName: row.campaign?.name ?? "",
    dateRange: { start, end, days: boundedDays },
    impressionShare: m.search_impression_share ?? null,
    absoluteTopImpressionShare: m.search_absolute_top_impression_share ?? null,
    topImpressionShare: m.search_top_impression_share ?? null,
    exactMatchImpressionShare: m.search_exact_match_impression_share ?? null,
    budgetLostImpressionShare: m.search_budget_lost_impression_share ?? null,
    rankLostImpressionShare: m.search_rank_lost_impression_share ?? null,
    totalImpressions: m.impressions ?? 0,
    totalClicks: m.clicks ?? 0,
    totalCost: micros(m.cost_micros),
  };
}

export async function getConversionActions(auth: AuthContext) {
  const customer = getCustomer(auth);

  const result = await customer.query(`
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.category,
      conversion_action.include_in_conversions_metric,
      conversion_action.counting_type,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.always_use_default_value
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name ASC
  `);

  return (result as any[]).map((row) => {
    const ca = row.conversion_action ?? {};
    return {
      id: String(ca.id ?? ""),
      name: ca.name ?? "Untitled",
      type: ca.type ?? "UNKNOWN",
      status: ca.status ?? "UNKNOWN",
      category: ca.category ?? "UNKNOWN",
      includeInConversions: ca.include_in_conversions_metric ?? true,
      countingType: ca.counting_type ?? "UNKNOWN",
      defaultValue: ca.value_settings?.default_value ?? null,
      alwaysUseDefaultValue: ca.value_settings?.always_use_default_value ?? false,
    };
  });
}

export async function getAccountSettings(auth: AuthContext) {
  const customer = getCustomer(auth);

  const result = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.auto_tagging_enabled,
      customer.tracking_url_template,
      customer.conversion_tracking_setting.conversion_tracking_id,
      customer.conversion_tracking_setting.cross_account_conversion_tracking_id
    FROM customer
    LIMIT 1
  `);

  const row = (result as any[])[0]?.customer ?? {};
  return {
    id: String(row.id ?? normalizeCustomerId(auth.customerId)),
    name: row.descriptive_name ?? "Untitled account",
    autoTaggingEnabled: row.auto_tagging_enabled ?? false,
    trackingUrlTemplate: row.tracking_url_template ?? null,
    conversionTrackingId: row.conversion_tracking_setting?.conversion_tracking_id
      ? String(row.conversion_tracking_setting.conversion_tracking_id)
      : null,
    crossAccountConversionTrackingId: row.conversion_tracking_setting?.cross_account_conversion_tracking_id
      ? String(row.conversion_tracking_setting.cross_account_conversion_tracking_id)
      : null,
  };
}

export async function getCampaignSettings(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCustomer(auth);
  const id = safeEntityId(campaignId);

  const [campaignResult, locationResult, scheduleResult] = await Promise.all([
    customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.start_date,
        campaign.end_date,
        campaign.bidding_strategy_type,
        campaign.target_cpa.target_cpa_micros,
        campaign.target_roas.target_roas,
        campaign.maximize_conversions.target_cpa_micros,
        campaign.network_settings.target_google_search,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_content_network,
        campaign.geo_target_type_setting.positive_geo_target_type,
        campaign.geo_target_type_setting.negative_geo_target_type
      FROM campaign
      WHERE campaign.id = ${id}
      LIMIT 1
    `),
    customer.query(`
      SELECT
        campaign_criterion.criterion_id,
        campaign_criterion.negative,
        campaign_criterion.location.geo_target_constant
      FROM campaign_criterion
      WHERE campaign.id = ${id}
        AND campaign_criterion.type = 'LOCATION'
      LIMIT 50
    `),
    customer.query(`
      SELECT
        campaign_criterion.ad_schedule.day_of_week,
        campaign_criterion.ad_schedule.start_hour,
        campaign_criterion.ad_schedule.start_minute,
        campaign_criterion.ad_schedule.end_hour,
        campaign_criterion.ad_schedule.end_minute,
        campaign_criterion.bid_modifier
      FROM campaign_criterion
      WHERE campaign.id = ${id}
        AND campaign_criterion.type = 'AD_SCHEDULE'
      ORDER BY campaign_criterion.ad_schedule.day_of_week ASC
    `),
  ]);

  const c = (campaignResult as any[])[0]?.campaign ?? {};
  const ns = c.network_settings ?? {};

  const locations = (locationResult as any[]).map((row) => {
    const cc = row.campaign_criterion ?? {};
    const geoConst = cc.location?.geo_target_constant ?? "";
    const geoId = geoConst ? geoConst.replace("geoTargetConstants/", "") : null;
    return {
      criterionId: String(cc.criterion_id ?? ""),
      negative: cc.negative ?? false,
      geoTargetConstantId: geoId,
    };
  });

  const adSchedule = (scheduleResult as any[]).map((row) => {
    const cc = row.campaign_criterion ?? {};
    const sched = cc.ad_schedule ?? {};
    return {
      dayOfWeek: sched.day_of_week ?? "UNKNOWN",
      startHour: sched.start_hour ?? 0,
      startMinute: sched.start_minute ?? "ZERO",
      endHour: sched.end_hour ?? 0,
      endMinute: sched.end_minute ?? "ZERO",
      bidModifier: cc.bid_modifier ?? 1.0,
    };
  });

  return {
    id: String(c.id ?? campaignId),
    name: c.name ?? "",
    status: c.status ?? "UNKNOWN",
    startDate: c.start_date ?? null,
    endDate: c.end_date ?? null,
    biddingStrategy: c.bidding_strategy_type ?? "UNKNOWN",
    targetCpaMicros: c.target_cpa?.target_cpa_micros ?? c.maximize_conversions?.target_cpa_micros ?? null,
    targetRoas: c.target_roas?.target_roas ?? null,
    networks: {
      googleSearch: ns.target_google_search ?? false,
      searchPartners: ns.target_search_network ?? false,
      displayNetwork: ns.target_content_network ?? false,
    },
    locationTargeting: locations,
    adSchedule: adSchedule.length > 0 ? adSchedule : null,
  };
}

export async function getRecommendations(
  auth: AuthContext,
  campaignId?: string,
) {
  const customer = getCustomer(auth);
  const campaignFilter = campaignId
    ? `AND campaign.id = ${safeEntityId(campaignId)}`
    : "";

  try {
    const result = await customer.query(`
      SELECT
        recommendation.resource_name,
        recommendation.type,
        recommendation.dismissed,
        recommendation.campaign,
        recommendation.impact.base_metrics.impressions,
        recommendation.impact.base_metrics.clicks,
        recommendation.impact.base_metrics.cost_micros,
        recommendation.impact.base_metrics.conversions,
        recommendation.impact.potential_metrics.impressions,
        recommendation.impact.potential_metrics.clicks,
        recommendation.impact.potential_metrics.conversions
      FROM recommendation
      WHERE recommendation.dismissed = FALSE
        ${campaignFilter}
      LIMIT 25
    `);

    const recommendations = (result as any[]).map((row) => {
      const rec = row.recommendation ?? {};
      const base = rec.impact?.base_metrics ?? {};
      const potential = rec.impact?.potential_metrics ?? {};
      // resource_name format: customers/{cid}/campaigns/{id} — extract last segment
      const campId = rec.campaign ? (rec.campaign.match(/\/campaigns\/(\d+)$/)?.[1] ?? null) : null;
      return {
        type: rec.type ?? "UNKNOWN",
        campaignId: campId ?? null,
        baseMetrics: {
          impressions: base.impressions ?? 0,
          clicks: base.clicks ?? 0,
          cost: micros(base.cost_micros),
          conversions: base.conversions ?? 0,
        },
        potentialMetrics: {
          impressions: potential.impressions ?? 0,
          clicks: potential.clicks ?? 0,
          conversions: potential.conversions ?? 0,
        },
      };
    });
    return { recommendations };
  } catch (error) {
    // Recommendations API may not be available for all accounts
    return { recommendations: [], error: extractErrorMessage(error) };
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
