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
  /** Human-readable label for the entity (e.g. keyword text). Stored in operations log. */
  label?: string | null;
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

/** Singleton client — reuse across calls to avoid re-instantiation. */
let _clientInstance: GoogleAdsApi | null = null;

export function getClient() {
  if (!_clientInstance) {
    _clientInstance = new GoogleAdsApi({
      client_id: requiredEnv("GOOGLE_ADS_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_ADS_CLIENT_SECRET"),
      developer_token: requiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    });
  }
  return _clientInstance;
}

export function getCustomer(auth: AuthContext) {
  return getClient().Customer({
    customer_id: normalizeCustomerId(auth.customerId),
    refresh_token: auth.refreshToken,
  });
}

// ─── Query Cache ────────────────────────────────────────────────────
//
// In-memory TTL cache for read queries. Keyed by customerId + GAQL.
// Mutations invalidate all entries for the affected customerId.

const CACHE_TTL_MS = 45_000; // 45 seconds

type CacheEntry = {
  data: any;
  expiresAt: number;
};

const queryCache = new Map<string, CacheEntry>();

function cacheKey(customerId: string, query: string): string {
  return `${normalizeCustomerId(customerId)}::${query.replace(/\s+/g, " ").trim()}`;
}

/** Invalidate all cached queries for a customer (call after mutations). */
export function invalidateCache(customerId: string) {
  const prefix = `${normalizeCustomerId(customerId)}::`;
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) queryCache.delete(key);
  }
}

/** Clear the entire cache (used by Refresh buttons). */
export function clearCache() {
  queryCache.clear();
}

/**
 * Get a customer client with cached queries.
 * customer.query() results are cached with a TTL. Use for read-only functions.
 */
function getCachedCustomer(auth: AuthContext) {
  const raw = getCustomer(auth);
  const customerId = auth.customerId;

  return new Proxy(raw, {
    get(target, prop) {
      if (prop === "query") {
        return async (query: string) => {
          const key = cacheKey(customerId, query);
          const now = Date.now();
          const cached = queryCache.get(key);
          if (cached && cached.expiresAt > now) {
            return cached.data;
          }
          const result = await target.query(query);
          queryCache.set(key, { data: result, expiresAt: now + CACHE_TTL_MS });
          return result;
        };
      }
      return (target as any)[prop];
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract a meaningful error message from Google Ads API errors.
 * The google-ads-api library throws GoogleAdsFailure objects (not Error instances)
 * with an `errors` array containing detailed failure info.
 */
function extractErrorMessage(
  error: unknown,
  options: { log?: boolean } = {},
): string {
  if (options.log !== false) {
    console.error("[google-ads] API error:", error);
  }

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
  const customer = getCachedCustomer(auth);
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
          error: extractErrorMessage(error, { log: false }),
        };
      }
    }),
  );
}

export async function listCampaigns(
  auth: AuthContext,
  options: { limit?: number; includeRemoved?: boolean; days?: number } = {},
) {
  const customer = getCachedCustomer(auth);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const conditions: string[] = [];
  if (options.days != null) {
    const { start, end } = getDateRange(options.days);
    conditions.push(`segments.date BETWEEN '${start}' AND '${end}'`);
  }
  if (!options.includeRemoved) {
    conditions.push("campaign.status != 'REMOVED'");
  }
  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign.network_settings.target_content_network,
      campaign.tracking_url_template,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    ${whereClause}
    ORDER BY metrics.impressions DESC
    LIMIT ${limit}
  `);

  return (result as any[]).map((row) => ({
    id: String(row.campaign.id),
    name: row.campaign.name ?? "Untitled campaign",
    status: row.campaign.status ?? "UNKNOWN",
    channelType: row.campaign.advertising_channel_type ?? "UNKNOWN",
    biddingStrategy: row.campaign.bidding_strategy_type ?? "UNKNOWN",
    networkDisplayEnabled: row.campaign.network_settings?.target_content_network ?? false,
    trackingTemplate: row.campaign.tracking_url_template ?? null,
    impressions: row.metrics.impressions ?? 0,
    clicks: row.metrics.clicks ?? 0,
    cost: micros(row.metrics.cost_micros),
    conversions: row.metrics.conversions ?? 0,
  }));
}

type PerfTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
};

type PerfTotalsWithRatios = PerfTotals & {
  ctr: number;
  averageCpc: number;
  cpa: number | null;
  roas: number | null;
};

function computeRatios(t: PerfTotals): PerfTotalsWithRatios {
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    averageCpc: t.clicks > 0 ? t.cost / t.clicks : 0,
    cpa: t.conversions > 0 ? t.cost / t.conversions : null,
    roas: t.cost > 0 ? t.conversionValue / t.cost : null,
  };
}

function sumTotals(rows: PerfTotals[]): PerfTotals {
  return rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      cost: acc.cost + row.cost,
      conversions: acc.conversions + row.conversions,
      conversionValue: acc.conversionValue + row.conversionValue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
  );
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

async function queryPerformanceRows(
  customer: any,
  campaignId: number,
  start: string,
  end: string,
) {
  const result = await customer.query(`
    SELECT
      campaign.id, campaign.name,
      segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY segments.date ASC
  `);

  return {
    campaignName: (result as any[])[0]?.campaign?.name ?? "Unknown",
    rows: (result as any[]).map((row: any) => ({
      date: row.segments.date,
      impressions: row.metrics.impressions ?? 0,
      clicks: row.metrics.clicks ?? 0,
      cost: micros(row.metrics.cost_micros),
      conversions: row.metrics.conversions ?? 0,
      conversionValue: row.metrics.conversions_value ?? 0,
      ctr: row.metrics.ctr ?? 0,
      averageCpc: micros(row.metrics.average_cpc),
    })),
  };
}

export type CampaignPerformanceOptions = {
  /** Number of days to look back (alternative to startDate/endDate). Default 30. */
  days?: number;
  /** Explicit start date (YYYY-MM-DD). Overrides days when both startDate and endDate are set. */
  startDate?: string;
  /** Explicit end date (YYYY-MM-DD). Overrides days when both startDate and endDate are set. */
  endDate?: string;
  /** Include a comparison with the previous period of equal length. */
  comparePreviousPeriod?: boolean;
};

export async function getCampaignPerformance(
  auth: AuthContext,
  campaignId: string,
  daysOrOptions: number | CampaignPerformanceOptions = 30,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const opts: CampaignPerformanceOptions =
    typeof daysOrOptions === "number" ? { days: daysOrOptions } : daysOrOptions;

  let start: string;
  let end: string;
  let periodDays: number;

  if (opts.startDate || opts.endDate) {
    if (!opts.startDate || !opts.endDate) {
      throw new Error("Both startDate and endDate are required when specifying a date range");
    }
    start = opts.startDate;
    end = opts.endDate;
    periodDays = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
    ) + 1;
    if (periodDays < 1) {
      throw new Error("startDate must be before or equal to endDate");
    }
    if (periodDays > 365) {
      throw new Error("Date range cannot exceed 365 days");
    }
  } else {
    periodDays = Math.min(Math.max(opts.days ?? 30, 1), 365);
    ({ start, end } = getDateRange(periodDays));
  }

  const { campaignName, rows } = await queryPerformanceRows(customer, id, start, end);
  const totals = computeRatios(sumTotals(rows));

  const base = {
    campaignId,
    campaignName,
    dateRange: { start, end, days: periodDays },
    totals,
    daily: rows,
  };

  if (!opts.comparePreviousPeriod) return base;

  // Compute previous period of equal length ending the day before `start`
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - periodDays + 1);

  const prev = await queryPerformanceRows(
    customer, id, formatDate(prevStart), formatDate(prevEnd),
  );
  const prevTotals = computeRatios(sumTotals(prev.rows));

  return {
    ...base,
    comparison: {
      dateRange: {
        start: formatDate(prevStart),
        end: formatDate(prevEnd),
        days: periodDays,
      },
      totals: prevTotals,
      daily: prev.rows,
      changes: {
        impressions: pctChange(totals.impressions, prevTotals.impressions),
        clicks: pctChange(totals.clicks, prevTotals.clicks),
        cost: pctChange(totals.cost, prevTotals.cost),
        conversions: pctChange(totals.conversions, prevTotals.conversions),
        conversionValue: pctChange(totals.conversionValue, prevTotals.conversionValue),
        ctr: pctChange(totals.ctr, prevTotals.ctr),
        averageCpc: pctChange(totals.averageCpc, prevTotals.averageCpc),
      },
    },
  };
}

export async function getKeywords(
  auth: AuthContext,
  campaignId: string,
  days = 30,
  limit = 50,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      ad_group.id,
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
      adGroupId: String(row.ad_group?.id ?? ""),
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
  const customer = getCachedCustomer(auth);
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

export async function getNegativeKeywords(
  auth: AuthContext,
  campaignId: string,
  limit = 100,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedLimit = Math.min(Math.max(limit, 1), 500);

  const result = await customer.query(`
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type,
      campaign_criterion.negative
    FROM campaign_criterion
    WHERE campaign.id = ${id}
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
    LIMIT ${boundedLimit}
  `);

  return (result as any[]).map((row: any) => ({
    criterionId: String(row.campaign_criterion?.criterion_id ?? ""),
    text: row.campaign_criterion?.keyword?.text ?? "",
    matchType: row.campaign_criterion?.keyword?.match_type ?? "UNKNOWN",
  }));
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
const MATCH_TYPE_NAME: Record<number, "EXACT" | "PHRASE" | "BROAD"> = { 2: "EXACT", 3: "PHRASE", 4: "BROAD" };

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
 * Remove a campaign using the Google Ads remove mutation.
 * Used for undoing campaign creation and explicit campaign deletion.
 */
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
  const customer = getCachedCustomer(auth);
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
  const customer = getCachedCustomer(auth);
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
  days = 30,
  limit = 50,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const bounded = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

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
      AND segments.date BETWEEN '${start}' AND '${end}'
      ${adGroupFilter}
    ORDER BY metrics.impressions DESC
    LIMIT ${bounded}
  `);

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    ads: (result as any[]).map((row) => {
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
    }),
  };
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

export type AdAsset = { text: string; pin?: number };

export type UpdateAdAssetsParams = {
  headlines: AdAsset[];
  descriptions: AdAsset[];
};

/** Convert raw API pinned_field value (number or string) to user-facing pin number (1-3). */
function pinnedFieldToPin(raw: unknown): number | undefined {
  if (!raw) return undefined;
  const s = String(raw);
  if (s === "HEADLINE_1" || s === "2") return 1;
  if (s === "HEADLINE_2" || s === "3") return 2;
  if (s === "HEADLINE_3" || s === "4") return 3;
  if (s === "DESCRIPTION_1" || s === "5") return 1;
  if (s === "DESCRIPTION_2" || s === "6") return 2;
  return undefined;
}

/** Convert user-facing pin number to Google Ads API pinned_field string for headlines. */
function headlinePinnedField(pin: number | undefined): string | undefined {
  if (pin === 1) return "HEADLINE_1";
  if (pin === 2) return "HEADLINE_2";
  if (pin === 3) return "HEADLINE_3";
  return undefined;
}

/** Convert user-facing pin number to Google Ads API pinned_field string for descriptions. */
function descriptionPinnedField(pin: number | undefined): string | undefined {
  if (pin === 1) return "DESCRIPTION_1";
  if (pin === 2) return "DESCRIPTION_2";
  return undefined;
}

export async function updateAdAssets(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
  params: UpdateAdAssetsParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const entityId = `${adGroupId}~${adId}`;

  const rsaError = validateRsaAssets(
    params.headlines.map((h) => h.text),
    params.descriptions.map((d) => d.text),
  );
  if (rsaError) {
    return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: rsaError };
  }

  // Validate pin values
  for (const h of params.headlines) {
    if (h.pin !== undefined && (h.pin < 1 || h.pin > 3 || !Number.isInteger(h.pin))) {
      return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: `Invalid headline pin ${h.pin}: must be 1, 2, or 3` };
    }
  }
  for (const d of params.descriptions) {
    if (d.pin !== undefined && (d.pin < 1 || d.pin > 2 || !Number.isInteger(d.pin))) {
      return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: `Invalid description pin ${d.pin}: must be 1 or 2` };
    }
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
      h: (row.headlines ?? []).map((x: any) => {
        const asset: AdAsset = { text: x.text ?? "" };
        const pin = pinnedFieldToPin(x.pinned_field);
        if (pin !== undefined) asset.pin = pin;
        return asset;
      }),
      d: (row.descriptions ?? []).map((x: any) => {
        const asset: AdAsset = { text: x.text ?? "" };
        const pin = pinnedFieldToPin(x.pinned_field);
        if (pin !== undefined) asset.pin = pin;
        return asset;
      }),
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
            headlines: params.headlines.map((h) => {
              const asset: Record<string, unknown> = { text: h.text };
              const pf = headlinePinnedField(h.pin);
              if (pf) asset.pinned_field = pf;
              return asset;
            }),
            descriptions: params.descriptions.map((d) => {
              const asset: Record<string, unknown> = { text: d.text };
              const pf = descriptionPinnedField(d.pin);
              if (pf) asset.pinned_field = pf;
              return asset;
            }),
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
  if (updates.length === 0) return [];

  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Group by campaign to batch-fetch bidding strategy + current bids
  const byCampaign = new Map<string, BulkBidUpdate[]>();
  for (const u of updates) {
    const arr = byCampaign.get(u.campaignId) ?? [];
    arr.push(u);
    byCampaign.set(u.campaignId, arr);
  }

  // 1 query per campaign: fetch strategy + all keyword bids at once
  const preCheckData = new Map<string, { strategy: string; bidMicros: number }>();
  for (const [campaignId, group] of byCampaign) {
    const campId = safeEntityId(campaignId);
    const criterionIds = group.map((u) => Number(u.criterionId)).join(",");
    const rows = await customer.query(`
      SELECT
        campaign.bidding_strategy_type,
        ad_group_criterion.criterion_id,
        ad_group_criterion.cpc_bid_micros
      FROM keyword_view
      WHERE campaign.id = ${campId}
        AND ad_group_criterion.criterion_id IN (${criterionIds})
    `);
    for (const row of rows as any[]) {
      const critId = String(row.ad_group_criterion?.criterion_id ?? "");
      preCheckData.set(`${campaignId}:${critId}`, {
        strategy: row.campaign?.bidding_strategy_type ?? "UNKNOWN",
        bidMicros: row.ad_group_criterion?.cpc_bid_micros ?? 0,
      });
    }
  }

  // Validate all updates and build mutations
  const results: Array<WriteResult & { input: BulkBidUpdate }> = [];
  const validMutations: Array<{ update: BulkBidUpdate; newBidMicros: number; currentBidMicros: number }> = [];
  const manualStrategies = ["MANUAL_CPC", "ENHANCED_CPC"];

  for (const u of updates) {
    const newBidMicros = toMicros(u.newBidDollars);
    const data = preCheckData.get(`${u.campaignId}:${u.criterionId}`);

    if (!data) {
      results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: "N/A", afterValue: String(newBidMicros), error: "Keyword not found", input: u });
      continue;
    }
    if (data.strategy && !manualStrategies.includes(data.strategy)) {
      results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: "N/A", afterValue: String(newBidMicros), error: `Bid changes not supported for ${data.strategy} strategy`, input: u });
      continue;
    }
    if (newBidMicros <= 0) {
      results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: String(data.bidMicros), afterValue: String(newBidMicros), error: "Bid must be greater than zero", input: u });
      continue;
    }
    if (data.bidMicros > 0) {
      const changePct = Math.abs(newBidMicros - data.bidMicros) / data.bidMicros;
      if (changePct > guardrails.maxBidChangePct) {
        results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: String(data.bidMicros), afterValue: String(newBidMicros), error: `Bid change of ${(changePct * 100).toFixed(0)}% exceeds maximum allowed ${(guardrails.maxBidChangePct * 100).toFixed(0)}%`, input: u });
        continue;
      }
    }
    validMutations.push({ update: u, newBidMicros, currentBidMicros: data.bidMicros });
  }

  // Batch mutate in chunks to avoid API limits and isolate failures
  const CHUNK_SIZE = 10;
  for (let i = 0; i < validMutations.length; i += CHUNK_SIZE) {
    const chunk = validMutations.slice(i, i + CHUNK_SIZE);
    try {
      await customer.mutateResources(
        chunk.map(({ update, newBidMicros }) => ({
          entity: "ad_group_criterion" as any,
          operation: "update" as const,
          resource: {
            resource_name: `customers/${cid}/adGroupCriteria/${update.adGroupId}~${update.criterionId}`,
            cpc_bid_micros: newBidMicros,
          },
        })),
      );
      for (const { update, newBidMicros, currentBidMicros } of chunk) {
        results.push({ success: true, action: "update_bid", entityId: update.criterionId, beforeValue: String(currentBidMicros), afterValue: String(newBidMicros), input: update });
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      for (const { update, newBidMicros, currentBidMicros } of chunk) {
        results.push({ success: false, action: "update_bid", entityId: update.criterionId, beforeValue: String(currentBidMicros), afterValue: String(newBidMicros), error: msg, input: update });
      }
    }
  }

  return results;
}

// ─── Bulk Keyword Operations ────────────────────────────────────────────

export type BulkPauseKeywordInput = {
  campaignId: string;
  adGroupId: string;
  criterionId: string;
};

export async function bulkPauseKeywords(
  auth: AuthContext,
  keywords: BulkPauseKeywordInput[],
  _guardrails = DEFAULT_GUARDRAILS,
): Promise<Array<WriteResult & { input: BulkPauseKeywordInput }>> {
  if (keywords.length === 0) return [];

  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Group by campaign to batch-check active keyword counts
  const byCampaign = new Map<string, BulkPauseKeywordInput[]>();
  for (const k of keywords) {
    const arr = byCampaign.get(k.campaignId) ?? [];
    arr.push(k);
    byCampaign.set(k.campaignId, arr);
  }

  // 1 query per campaign: count active keywords
  const activeCountByCampaign = new Map<string, number>();
  for (const campaignId of byCampaign.keys()) {
    const campId = safeEntityId(campaignId);
    const countResult = await customer.query(`
      SELECT ad_group_criterion.criterion_id
      FROM keyword_view
      WHERE campaign.id = ${campId}
        AND ad_group_criterion.status = 'ENABLED'
    `);
    activeCountByCampaign.set(campaignId, (countResult as any[]).length);
  }

  // Validate: ensure we don't pause all active keywords in any campaign
  const results: Array<WriteResult & { input: BulkPauseKeywordInput }> = [];
  const validKeywords: BulkPauseKeywordInput[] = [];

  for (const [campaignId, group] of byCampaign) {
    const activeCount = activeCountByCampaign.get(campaignId) ?? 0;
    if (group.length >= activeCount) {
      // Would pause all keywords — reject the whole group
      for (const k of group) {
        results.push({ success: false, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: `Cannot pause ${group.length} of ${activeCount} active keywords — would leave campaign with none`, input: k });
      }
    } else {
      validKeywords.push(...group);
    }
  }

  // Batch mutate in chunks to avoid API limits and isolate failures
  const CHUNK_SIZE = 10;
  for (let i = 0; i < validKeywords.length; i += CHUNK_SIZE) {
    const chunk = validKeywords.slice(i, i + CHUNK_SIZE);
    try {
      await customer.mutateResources(
        chunk.map((k) => ({
          entity: "ad_group_criterion" as any,
          operation: "update" as const,
          resource: {
            resource_name: `customers/${cid}/adGroupCriteria/${k.adGroupId}~${k.criterionId}`,
            status: STATUS.PAUSED,
          },
        })),
      );
      for (const k of chunk) {
        results.push({ success: true, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "PAUSED", input: k });
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      for (const k of chunk) {
        results.push({ success: false, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: msg, input: k });
      }
    }
  }

  return results;
}

export type BulkAddKeywordInput = {
  keyword: string;
  matchType?: "BROAD" | "PHRASE" | "EXACT";
};

export async function bulkAddKeywords(
  auth: AuthContext,
  adGroupId: string,
  keywords: BulkAddKeywordInput[],
): Promise<Array<WriteResult & { input: BulkAddKeywordInput }>> {
  if (keywords.length === 0) return [];

  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Validate inputs
  const valid: Array<{ input: BulkAddKeywordInput; text: string; matchType: "BROAD" | "PHRASE" | "EXACT" }> = [];
  const results: Array<WriteResult & { input: BulkAddKeywordInput }> = [];

  for (const k of keywords) {
    const text = k.keyword.trim();
    if (!text) {
      results.push({ success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: "", error: "Keyword text cannot be empty", input: k });
    } else {
      valid.push({ input: k, text, matchType: k.matchType ?? "BROAD" });
    }
  }

  if (valid.length === 0) return results;

  // Batch mutate in chunks to avoid API limits and isolate failures
  const CHUNK_SIZE = 10;
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    try {
      const response = await customer.mutateResources(
        chunk.map(({ text, matchType }) => ({
          entity: "ad_group_criterion" as any,
          operation: "create" as const,
          resource: {
            ad_group: `customers/${cid}/adGroups/${adGroupId}`,
            status: STATUS.ENABLED,
            keyword: {
              text,
              match_type: MATCH_TYPE[matchType],
            },
          },
        })),
      );

      const responses = (response as any)?.mutate_operation_responses ?? [];
      for (let j = 0; j < chunk.length; j++) {
        const { input, text, matchType } = chunk[j];
        const resourceName = responses[j]?.ad_group_criterion_result?.resource_name as string | undefined;
        const criterionId = resourceName?.split("~").pop() ?? "";
        if (criterionId) {
          results.push({ success: true, action: "add_keyword", entityId: criterionId, beforeValue: adGroupId, afterValue: `${text} (${matchType})`, input });
        } else {
          results.push({ success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: text, error: "Keyword created but criterion ID could not be extracted", input });
        }
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      for (const { input, text } of chunk) {
        results.push({
          success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: text,
          error: msg.includes("ALREADY_EXISTS") ? `Keyword "${text}" already exists in this ad group` : msg,
          input,
        });
      }
    }
  }

  return results;
}

// ─── Move Keywords ──────────────────────────────────────────────────────

export type MoveKeywordsResult = {
  success: boolean;
  added: Array<WriteResult & { criterionId: string }>;
  paused: Array<WriteResult & { criterionId: string }>;
  error?: string;
};

export async function moveKeywords(
  auth: AuthContext,
  campaignId: string,
  fromAdGroupId: string,
  toAdGroupId: string,
  criterionIds: string[],
  matchType: "BROAD" | "PHRASE" | "EXACT" = "PHRASE",
): Promise<MoveKeywordsResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

  // Step 1: Look up keyword text for each criterionId from the source ad group
  const result = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type
    FROM keyword_view
    WHERE campaign.id = ${cid}
      AND ad_group.id = ${safeEntityId(fromAdGroupId)}
      AND ad_group_criterion.criterion_id IN (${criterionIds.map((id) => safeEntityId(id)).join(",")})
  `);

  const keywordMap = new Map<string, { text: string }>();
  for (const row of result as any[]) {
    const critId = String(row.ad_group_criterion?.criterion_id ?? "");
    const text = row.ad_group_criterion?.keyword?.text ?? "";
    if (critId && text) keywordMap.set(critId, { text });
  }

  // Validate all keywords were found
  const missing = criterionIds.filter((id) => !keywordMap.has(id));
  if (missing.length > 0) {
    return {
      success: false,
      added: [],
      paused: [],
      error: `Could not find keywords for criterion IDs: ${missing.join(", ")}`,
    };
  }

  // Step 2: Add keywords to the destination ad group
  const added: Array<WriteResult & { criterionId: string }> = [];
  const CHUNK_SIZE = 5;
  for (let i = 0; i < criterionIds.length; i += CHUNK_SIZE) {
    const chunk = criterionIds.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (critId) => {
        const kw = keywordMap.get(critId)!;
        const addResult = await addKeyword(auth, toAdGroupId, kw.text, matchType);
        return { ...addResult, criterionId: critId };
      }),
    );
    added.push(...chunkResults);
  }

  // If any adds failed, roll back successful adds and abort
  const addFailures = added.filter((r) => !r.success);
  if (addFailures.length > 0) {
    // Best-effort cleanup: remove successfully-added keywords from destination
    const successfulAdds = added.filter((r) => r.success && r.entityId);
    for (const add of successfulAdds) {
      try {
        await removeKeyword(auth, toAdGroupId, add.entityId);
      } catch {
        // Cleanup failure is logged but doesn't change the error result
      }
    }
    return {
      success: false,
      added,
      paused: [],
      error: `${addFailures.length} keyword(s) failed to add to destination — rolled back ${successfulAdds.length} successful add(s), originals left untouched`,
    };
  }

  // Step 3: Pause keywords in the source ad group (sequential to respect guardrails)
  const paused: Array<WriteResult & { criterionId: string }> = [];
  for (const critId of criterionIds) {
    const pauseResult = await pauseKeyword(auth, campaignId, fromAdGroupId, critId);
    paused.push({ ...pauseResult, criterionId: critId });
  }

  const pauseFailures = paused.filter((r) => !r.success);
  return {
    success: pauseFailures.length === 0,
    added,
    paused,
    error: pauseFailures.length > 0
      ? `Keywords added successfully but ${pauseFailures.length} failed to pause in source — may be duplicated`
      : undefined,
  };
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

// ─── Analytics & Settings ────────────────────────────────────────────

export async function getImpressionShare(
  auth: AuthContext,
  campaignId: string,
  days: number,
) {
  const customer = getCachedCustomer(auth);
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
  const customer = getCachedCustomer(auth);

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
  const customer = getCachedCustomer(auth);

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
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  // 2 queries instead of 3: campaign settings + combined location/schedule criteria
  const [campaignResult, criteriaResult] = await Promise.all([
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
        campaign_criterion.type,
        campaign_criterion.criterion_id,
        campaign_criterion.negative,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.proximity.address.city_name,
        campaign_criterion.proximity.address.postal_code,
        campaign_criterion.proximity.radius,
        campaign_criterion.proximity.radius_units,
        campaign_criterion.proximity.geo_point.latitude_in_micro_degrees,
        campaign_criterion.proximity.geo_point.longitude_in_micro_degrees,
        campaign_criterion.ad_schedule.day_of_week,
        campaign_criterion.ad_schedule.start_hour,
        campaign_criterion.ad_schedule.start_minute,
        campaign_criterion.ad_schedule.end_hour,
        campaign_criterion.ad_schedule.end_minute,
        campaign_criterion.bid_modifier
      FROM campaign_criterion
      WHERE campaign.id = ${id}
        AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY', 'AD_SCHEDULE')
      LIMIT 100
    `),
  ]);

  const c = (campaignResult as any[])[0]?.campaign ?? {};
  const ns = c.network_settings ?? {};

  // Split combined criteria by type
  // google-ads-api returns enum fields as numeric values, not strings
  const CRITERION_TYPE = { LOCATION: 7, AD_SCHEDULE: 9, PROXIMITY: 17 } as const;
  const locationRows = (criteriaResult as any[]).filter((r) => r.campaign_criterion?.type === CRITERION_TYPE.LOCATION);
  const proximityRows = (criteriaResult as any[]).filter((r) => r.campaign_criterion?.type === CRITERION_TYPE.PROXIMITY);
  const scheduleRows = (criteriaResult as any[]).filter((r) => r.campaign_criterion?.type === CRITERION_TYPE.AD_SCHEDULE);

  const locations = locationRows.map((row) => {
    const cc = row.campaign_criterion ?? {};
    const geoConst = cc.location?.geo_target_constant ?? "";
    const geoId = geoConst ? geoConst.replace("geoTargetConstants/", "") : null;
    return {
      criterionId: String(cc.criterion_id ?? ""),
      negative: cc.negative ?? false,
      geoTargetConstantId: geoId,
    };
  });

  const proximityTargets = proximityRows.map((row) => {
    const cc = row.campaign_criterion ?? {};
    const prox = cc.proximity ?? {};
    const addr = prox.address ?? {};
    const geo = prox.geo_point ?? {};
    return {
      criterionId: String(cc.criterion_id ?? ""),
      negative: cc.negative ?? false,
      cityName: addr.city_name ?? null,
      postalCode: addr.postal_code ?? null,
      radius: prox.radius ?? null,
      radiusUnits: prox.radius_units ?? null,
      latitudeMicroDegrees: geo.latitude_in_micro_degrees ?? null,
      longitudeMicroDegrees: geo.longitude_in_micro_degrees ?? null,
    };
  });

  const adSchedule = scheduleRows
    .sort((a, b) => (a.campaign_criterion?.ad_schedule?.day_of_week ?? 0) - (b.campaign_criterion?.ad_schedule?.day_of_week ?? 0))
    .map((row) => {
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
    proximityTargeting: proximityTargets.length > 0 ? proximityTargets : null,
    adSchedule: adSchedule.length > 0 ? adSchedule : null,
  };
}

export async function getRecommendations(
  auth: AuthContext,
  campaignId?: string,
) {
  const customer = getCachedCustomer(auth);
  const campaignFilter = campaignId
    ? `AND campaign.id = ${safeEntityId(campaignId)}`
    : "";

  try {
    const result = await customer.query(`
      SELECT
        recommendation.resource_name,
        recommendation.type,
        recommendation.dismissed,
        recommendation.campaign
      FROM recommendation
      WHERE recommendation.dismissed = FALSE
        ${campaignFilter}
      LIMIT 25
    `);

    const recommendations = (result as any[]).map((row) => {
      const rec = row.recommendation ?? {};
      // resource_name format: customers/{cid}/campaigns/{id} — extract last segment
      const campId = rec.campaign ? (rec.campaign.match(/\/campaigns\/(\d+)$/)?.[1] ?? null) : null;
      return {
        type: String(rec.type ?? "UNKNOWN"),
        campaignId: campId ?? null,
      };
    });
    return { recommendations };
  } catch (error) {
    // Recommendations API may not be available for all accounts
    return { recommendations: [], error: extractErrorMessage(error) };
  }
}

// ─── Update Campaign Settings ───────────────────────────────────────

export interface UpdateCampaignSettingsParams {
  networks?: {
    googleSearch?: boolean;
    searchPartners?: boolean;
    displayNetwork?: boolean;
  };
  locationTargeting?: {
    add?: string[];    // geo target constant resource names or IDs
    remove?: string[]; // geo target constant resource names or IDs
  };
  negativeLocationTargeting?: {
    add?: string[];
    remove?: string[];
  };
}

interface CampaignSettingsResult {
  success: boolean;
  results: WriteResult[];
  error?: string;
}

/** Normalize a geo target input to a full resource name. Accepts "2840", "geoTargetConstants/2840", etc. */
function toGeoTargetConstant(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("geoTargetConstants/")) return trimmed;
  return `geoTargetConstants/${trimmed}`;
}

export async function updateCampaignSettings(
  auth: AuthContext,
  campaignId: string,
  params: UpdateCampaignSettingsParams,
): Promise<CampaignSettingsResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);
  const customerId = normalizeCustomerId(auth.customerId);
  const campaignResourceName = `customers/${customerId}/campaigns/${cid}`;
  const results: WriteResult[] = [];

  // 1. Update network settings
  if (params.networks) {
    try {
      // Fetch current settings to record beforeValue
      const current = await customer.query(`
        SELECT
          campaign.network_settings.target_google_search,
          campaign.network_settings.target_search_network,
          campaign.network_settings.target_content_network
        FROM campaign
        WHERE campaign.id = ${cid}
        LIMIT 1
      `);
      const ns = (current as any[])[0]?.campaign?.network_settings ?? {};
      const before = {
        googleSearch: ns.target_google_search ?? false,
        searchPartners: ns.target_search_network ?? false,
        displayNetwork: ns.target_content_network ?? false,
      };

      const after = {
        googleSearch: params.networks.googleSearch ?? before.googleSearch,
        searchPartners: params.networks.searchPartners ?? before.searchPartners,
        displayNetwork: params.networks.displayNetwork ?? before.displayNetwork,
      };

      await customer.mutateResources([
        {
          entity: "campaign" as any,
          operation: "update",
          resource: {
            resource_name: campaignResourceName,
            network_settings: {
              target_google_search: after.googleSearch,
              target_search_network: after.searchPartners,
              target_content_network: after.displayNetwork,
            },
          },
        },
      ]);

      results.push({
        success: true,
        action: "update_campaign_networks",
        entityId: campaignId,
        beforeValue: JSON.stringify(before),
        afterValue: JSON.stringify(after),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "update_campaign_networks",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  // 2. Add location targeting criteria
  const locAdds = [
    ...(params.locationTargeting?.add ?? []).map((g) => ({ geo: g, negative: false })),
    ...(params.negativeLocationTargeting?.add ?? []).map((g) => ({ geo: g, negative: true })),
  ];

  if (locAdds.length > 0) {
    try {
      const operations = locAdds.map(({ geo, negative }) => ({
        entity: "campaign_criterion" as any,
        operation: "create" as const,
        resource: {
          campaign: campaignResourceName,
          negative,
          location: {
            geo_target_constant: toGeoTargetConstant(geo),
          },
        },
      }));

      await customer.mutateResources(operations as any);

      results.push({
        success: true,
        action: "add_campaign_location",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(locAdds.map((l) => ({
          geo: toGeoTargetConstant(l.geo),
          negative: l.negative,
        }))),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "add_campaign_location",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(locAdds.map((l) => l.geo)),
        error: extractErrorMessage(error),
      });
    }
  }

  // 3. Remove location targeting criteria
  // Separate positive and negative removals to avoid conflating them
  const positiveRemoves = (params.locationTargeting?.remove ?? []).map((g) => ({ geo: g, negative: false }));
  const negativeRemoves = (params.negativeLocationTargeting?.remove ?? []).map((g) => ({ geo: g, negative: true }));
  const locRemoves = [...positiveRemoves, ...negativeRemoves];

  if (locRemoves.length > 0) {
    try {
      // Look up criterion resource names for the given geo target constants
      const criteriaResult = await customer.query(`
        SELECT
          campaign_criterion.resource_name,
          campaign_criterion.location.geo_target_constant,
          campaign_criterion.negative
        FROM campaign_criterion
        WHERE campaign.id = ${cid}
          AND campaign_criterion.type = 'LOCATION'
        LIMIT 200
      `);

      // Match by BOTH geo target constant AND negative flag to avoid removing the wrong criterion
      const toRemove = locRemoves
        .map(({ geo, negative }) => {
          const full = toGeoTargetConstant(geo);
          const match = (criteriaResult as any[]).find((r) => {
            const cc = r.campaign_criterion ?? {};
            return cc.location?.geo_target_constant === full && cc.negative === negative;
          });
          return match ? {
            resourceName: match.campaign_criterion.resource_name as string,
            geo: full,
            negative,
          } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (toRemove.length > 0) {
        const operations = toRemove.map(({ resourceName }) => ({
          entity: "campaign_criterion" as any,
          operation: "remove" as const,
          resource: resourceName as any,
        }));

        await customer.mutateResources(operations as any);

        results.push({
          success: true,
          action: "remove_campaign_location",
          entityId: campaignId,
          beforeValue: JSON.stringify(toRemove.map((t) => ({
            geo: t.geo,
            negative: t.negative,
          }))),
          afterValue: "",
        });
      }

      // Report any not-found criteria
      const notFound = locRemoves.filter(({ geo, negative }) => {
        const full = toGeoTargetConstant(geo);
        return !toRemove.some((t) => t.geo === full && t.negative === negative);
      });
      if (notFound.length > 0) {
        results.push({
          success: false,
          action: "remove_campaign_location",
          entityId: campaignId,
          beforeValue: "",
          afterValue: "",
          error: `Location criteria not found for: ${notFound.map((n) => `${n.geo}${n.negative ? " (negative)" : ""}`).join(", ")}`,
        });
      }
    } catch (error) {
      results.push({
        success: false,
        action: "remove_campaign_location",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  if (results.length === 0) {
    return { success: false, results: [], error: "No settings to update — provide at least one of: networks, locationTargeting, negativeLocationTargeting" };
  }

  return {
    success: results.every((r) => r.success),
    results,
  };
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

  const customer = getCachedCustomer(auth);
  const rows = await customer.query(query);
  return { rowCount: rows.length, rows: rows.slice(0, 50) };
}
