/**
 * Composable "view" functions for narrow dashboard slices.
 *
 * Each view fires only the GAQL queries it needs (3–5) instead of the
 * full 19-query `runAudit` fan-out. They compose the shared primitives
 * from `./queries` and `./change-index` so the Phase 5 cache coalesces
 * identical queries across views. A dashboard that calls `runAudit` once
 * and then `getWasteFindings` gets cache hits on every shared query.
 *
 * Views are pure data functions — the MCP adapter is thin.
 */

import { getCachedCustomer } from "../client";
import { extractErrorMessage, getDateRange, micros, normalizeCustomerId } from "../helpers";
import { MATCH_TYPE_NAME } from "../client";
import type { AuthContext } from "../types";
import type {
  FindingList,
  LandingPage,
  WastedItem,
  SearchTermItem,
  ChangeEventSummary,
} from "../audit";
import { toFindingList } from "../audit";
import {
  queryCampaigns,
  queryAdGroups,
  queryChangeEvents,
  queryLandingPages,
  querySearchTerms,
  queryZeroConversionKeywords,
} from "./queries";
import { buildChangeIndex, buildNameMaps } from "./change-index";

// ─── Shared utilities ───────────────────────────────────────────────

/** Compute the audit date window, returning both the main range and the
 *  change_event-clamped range (change_event is hard-capped at 30 days). */
function resolveDateWindow(days: number) {
  const boundedDays = Math.min(Math.max(days, 1), 90);
  const { start, end } = getDateRange(boundedDays);
  const changeEventDays = Math.min(boundedDays, 30);
  const { start: changeEventStart } = getDateRange(changeEventDays);
  return { start, end, boundedDays, changeEventStart };
}

/** Collect `(settled, label)` errors into one flat array, preserving any
 *  partial success semantics across view queries. */
function settled<T>(
  results: PromiseSettledResult<T>[],
  labels: readonly string[],
): { values: (T | null)[]; errors: string[] } {
  const values: (T | null)[] = [];
  const errors: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      values.push(r.value);
    } else {
      values.push(null);
      errors.push(`${labels[i]}: ${extractErrorMessage(r.reason, { log: false })}`);
    }
  }
  return { values, errors };
}

// ─── getAccountChanges ──────────────────────────────────────────────

export interface AccountChangesResponse {
  dateRange: { start: string; end: string; days: number };
  totalChanges: number;
  byUser: Array<{ userEmail: string | null; count: number }>;
  byResourceType: Array<{ resourceType: string; count: number }>;
  byClientType: Array<{ clientType: string; count: number }>;
  changes: FindingList<ChangeEventSummary>;
  errors?: string[];
}

/**
 * Every account-modifying edit inside the lookback window, with
 * aggregated counts by user / resource type / client type.
 *
 * Queries: 3 (campaigns + ad_groups for name lookup, change_event).
 * Change_event is capped at 30 rolling days by the Google Ads API;
 * `days` is clamped to that cap.
 */
export async function getAccountChanges(
  auth: AuthContext,
  days = 30,
  limit = 50,
): Promise<AccountChangesResponse> {
  const customer = getCachedCustomer(auth);
  const { end, changeEventStart } = resolveDateWindow(days);
  const customerId = normalizeCustomerId(auth.customerId);
  const effectiveDays = Math.min(Math.max(days, 1), 30);

  const results = await Promise.allSettled([
    customer.query(queryCampaigns(changeEventStart, end)),
    customer.query(queryAdGroups()),
    customer.query(queryChangeEvents(changeEventStart, end)),
  ]);
  const { values, errors } = settled(results, ["campaigns", "ad_groups", "change_events"]);
  const [campaignRows, adGroupRows, changeEventRows] = values as [
    unknown[] | null,
    unknown[] | null,
    unknown[] | null,
  ];

  const nameMaps = buildNameMaps(campaignRows, adGroupRows);
  const idx = buildChangeIndex(changeEventRows, customerId, end, nameMaps);

  const byUserMap = new Map<string | null, number>();
  const byResourceTypeMap = new Map<string, number>();
  const byClientTypeMap = new Map<string, number>();
  for (const c of idx.allChanges) {
    byUserMap.set(c.userEmail, (byUserMap.get(c.userEmail) ?? 0) + 1);
    byResourceTypeMap.set(c.resourceType, (byResourceTypeMap.get(c.resourceType) ?? 0) + 1);
    byClientTypeMap.set(c.clientType, (byClientTypeMap.get(c.clientType) ?? 0) + 1);
  }

  const response: AccountChangesResponse = {
    dateRange: { start: changeEventStart, end, days: effectiveDays },
    totalChanges: idx.allChanges.length,
    byUser: Array.from(byUserMap.entries())
      .map(([userEmail, count]) => ({ userEmail, count }))
      .sort((a, b) => b.count - a.count),
    byResourceType: Array.from(byResourceTypeMap.entries())
      .map(([resourceType, count]) => ({ resourceType, count }))
      .sort((a, b) => b.count - a.count),
    byClientType: Array.from(byClientTypeMap.entries())
      .map(([clientType, count]) => ({ clientType, count }))
      .sort((a, b) => b.count - a.count),
    changes: toFindingList(idx.allChanges, limit, () => 0),
  };
  if (errors.length > 0) response.errors = errors;
  return response;
}

// ─── getLandingPagePerformance ──────────────────────────────────────

export interface LandingPagePerformanceResponse {
  dateRange: { start: string; end: string; days: number };
  landingPages: FindingList<LandingPage>;
  errors?: string[];
}

/**
 * Landing page performance sorted by spend.
 *
 * Queries: 1 (landing_page_view). No change attribution since landing
 * pages aren't themselves editable entities.
 */
export async function getLandingPagePerformance(
  auth: AuthContext,
  days = 30,
  limit = 15,
): Promise<LandingPagePerformanceResponse> {
  const customer = getCachedCustomer(auth);
  const { start, end, boundedDays } = resolveDateWindow(days);

  const results = await Promise.allSettled([customer.query(queryLandingPages(start, end))]);
  const { values, errors } = settled(results, ["landing_pages"]);
  const [rows] = values as [unknown[] | null];

  const pages: LandingPage[] = (rows ?? []).map((row) => {
    const r = row as {
      landing_page_view?: { unexpanded_final_url?: string };
      metrics?: { cost_micros?: number; clicks?: number; conversions?: number };
    };
    const spend = micros(r.metrics?.cost_micros);
    const clicks = r.metrics?.clicks ?? 0;
    const conv = r.metrics?.conversions ?? 0;
    return {
      url: r.landing_page_view?.unexpanded_final_url ?? "",
      spend,
      clicks,
      conversions: conv,
      cpa: conv > 0 ? spend / conv : null,
      conversionRate: clicks > 0 ? conv / clicks : 0,
    };
  });

  const response: LandingPagePerformanceResponse = {
    dateRange: { start, end, days: boundedDays },
    landingPages: toFindingList(pages, limit, (p) => p.spend),
  };
  if (errors.length > 0) response.errors = errors;
  return response;
}

// ─── getWasteFindings ───────────────────────────────────────────────

export interface WasteFindingsResponse {
  dateRange: { start: string; end: string; days: number };
  accountCpa: number | null;
  /** `accountCpa * 2` — spend above this on a zero-conv keyword is flagged. */
  wasteThreshold: number | null;
  totalWaste: number;
  /** `totalWaste / totalSpend`, as a percentage. */
  wasteRate: number;
  wastedKeywords: FindingList<WastedItem>;
  wastedSearchTerms: FindingList<SearchTermItem>;
  errors?: string[];
}

/**
 * Zero-conversion keywords burning more than 2x the account CPA, plus
 * search terms with 10+ clicks and zero conversions. Each finding carries
 * a `recentChange` pointer so callers can skip items already being fixed.
 *
 * Queries: 5 (campaigns, ad_groups, search_term_view, keyword_view
 * zero-conv, change_event) — vs 19 for full `audit`. Q1 and Q9 are shared
 * with other views so the cache coalesces within a dashboard session.
 */
export async function getWasteFindings(
  auth: AuthContext,
  days = 30,
  limit = 10,
): Promise<WasteFindingsResponse> {
  const customer = getCachedCustomer(auth);
  const { start, end, boundedDays, changeEventStart } = resolveDateWindow(days);
  const customerId = normalizeCustomerId(auth.customerId);
  const criterionResourcePrefix = `customers/${customerId}/adGroupCriteria/`;

  const results = await Promise.allSettled([
    customer.query(queryCampaigns(start, end)),
    customer.query(queryAdGroups()),
    customer.query(querySearchTerms(start, end)),
    customer.query(queryZeroConversionKeywords(start, end)),
    customer.query(queryChangeEvents(changeEventStart, end)),
  ]);
  const { values, errors } = settled(results, [
    "campaigns",
    "ad_groups",
    "search_terms",
    "zero_conv_keywords",
    "change_events",
  ]);
  const [campaignRows, adGroupRows, searchTermRows, zeroConvRows, changeEventRows] =
    values as [
      unknown[] | null,
      unknown[] | null,
      unknown[] | null,
      unknown[] | null,
      unknown[] | null,
    ];

  // Account-level totals to compute threshold.
  let totalSpend = 0;
  let totalConversions = 0;
  for (const row of campaignRows ?? []) {
    const m = (row as { metrics?: { cost_micros?: number; conversions?: number } }).metrics ?? {};
    totalSpend += micros(m.cost_micros);
    totalConversions += m.conversions ?? 0;
  }
  const accountCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
  const wasteThreshold = accountCpa != null ? accountCpa * 2 : Infinity;

  const nameMaps = buildNameMaps(campaignRows, adGroupRows);
  const idx = buildChangeIndex(changeEventRows, customerId, end, nameMaps);

  const wastedKeywords: WastedItem[] = [];
  for (const row of zeroConvRows ?? []) {
    const r = row as {
      campaign?: { id?: unknown; name?: string };
      ad_group?: { id?: unknown; name?: string };
      ad_group_criterion?: {
        criterion_id?: unknown;
        keyword?: { text?: string; match_type?: number };
      };
      metrics?: { cost_micros?: number; clicks?: number };
    };
    const spend = micros(r.metrics?.cost_micros);
    if (spend <= wasteThreshold) continue;
    const criterionId = r.ad_group_criterion?.criterion_id != null
      ? String(r.ad_group_criterion.criterion_id)
      : "";
    const adGroupId = r.ad_group?.id != null ? String(r.ad_group.id) : null;
    const campaignId = r.campaign?.id != null ? String(r.campaign.id) : null;
    const resourceName = adGroupId && criterionId
      ? `${criterionResourcePrefix}${adGroupId}~${criterionId}`
      : null;
    const rawMatchType = r.ad_group_criterion?.keyword?.match_type;
    wastedKeywords.push({
      text: r.ad_group_criterion?.keyword?.text ?? "",
      matchType:
        (typeof rawMatchType === "number" ? MATCH_TYPE_NAME[rawMatchType] : rawMatchType) ??
        "UNKNOWN",
      campaignName: r.campaign?.name ?? "",
      adGroupName: r.ad_group?.name ?? "",
      spend,
      clicks: r.metrics?.clicks ?? 0,
      qualityScore: null, // QS lookup is in Q4 — skipped in waste view (cached separately for full audit)
      recentChange: idx.resolveRecentChange({ resourceName, adGroupId, campaignId }),
    });
  }
  wastedKeywords.sort((a, b) => b.spend - a.spend);
  const keywordWaste = wastedKeywords.reduce((s, k) => s + k.spend, 0);

  const wastedSearchTerms: SearchTermItem[] = [];
  let searchTermWaste = 0;
  for (const row of searchTermRows ?? []) {
    const r = row as {
      campaign?: { id?: unknown; name?: string };
      ad_group?: { id?: unknown; name?: string };
      search_term_view?: { search_term?: string };
      metrics?: { cost_micros?: number; clicks?: number; conversions?: number };
    };
    const conv = r.metrics?.conversions ?? 0;
    const clicks = r.metrics?.clicks ?? 0;
    if (conv > 0 || clicks < 10) continue;
    const spend = micros(r.metrics?.cost_micros);
    searchTermWaste += spend;
    const adGroupId = r.ad_group?.id != null ? String(r.ad_group.id) : null;
    const campaignId = r.campaign?.id != null ? String(r.campaign.id) : null;
    wastedSearchTerms.push({
      term: r.search_term_view?.search_term ?? "",
      campaignName: r.campaign?.name ?? "",
      adGroupName: r.ad_group?.name ?? "",
      spend,
      clicks,
      conversions: 0,
      recentChange: idx.resolveRecentChange({ adGroupId, campaignId }),
    });
  }
  wastedSearchTerms.sort((a, b) => b.spend - a.spend);

  const totalWaste = keywordWaste + searchTermWaste;
  const wasteRate = totalSpend > 0 ? (totalWaste / totalSpend) * 100 : 0;

  const response: WasteFindingsResponse = {
    dateRange: { start, end, days: boundedDays },
    accountCpa,
    wasteThreshold: accountCpa != null ? wasteThreshold : null,
    totalWaste,
    wasteRate,
    wastedKeywords: toFindingList(wastedKeywords, limit, (k) => k.spend),
    wastedSearchTerms: toFindingList(wastedSearchTerms, limit, (t) => t.spend),
  };
  if (errors.length > 0) response.errors = errors;
  return response;
}
