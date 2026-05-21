import { getCachedCustomer, getCustomer } from "../client";
import { extractErrorMessage, formatDate } from "../helpers";
import type { AuthContext } from "../types";

// ─── Safe GAQL Query ─────────────────────────────────────────────────

export const MAX_GAQL_LIMIT = 2000;
export const DEFAULT_GAQL_LIMIT = 200;
const GAQL_BYTE_BUDGET = 40 * 1024; // 40KB — keep responses agent-digestible.

const GAQL_LIMIT_RE = /\bLIMIT\s+(\d+)(?=\s*(?:PARAMETERS\b|$))/i;

/** Extract trailing `LIMIT N` from a GAQL query (LIMIT is always the last clause
 *  before optional PARAMETERS). Returns null when absent. */
export function extractGaqlLimit(query: string): number | null {
  const m = query.match(GAQL_LIMIT_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Rewrite (or append) `LIMIT N` in a GAQL query. Preserves a trailing
 *  PARAMETERS clause if present. */
export function rewriteGaqlLimit(query: string, newLimit: number): string {
  const trimmed = query.trim();
  if (GAQL_LIMIT_RE.test(trimmed)) {
    return trimmed.replace(GAQL_LIMIT_RE, `LIMIT ${newLimit}`);
  }
  const paramIdx = trimmed.search(/\bPARAMETERS\b/i);
  if (paramIdx !== -1) {
    return `${trimmed.slice(0, paramIdx).trimEnd()} LIMIT ${newLimit} ${trimmed.slice(paramIdx)}`;
  }
  return `${trimmed} LIMIT ${newLimit}`;
}

/** Parse `SELECT a, b, c FROM ...` into ["a", "b", "c"]. */
export function extractSelectFields(query: string): string[] {
  const m = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedValue(row: unknown, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let v: unknown = row;
  for (const p of parts) {
    if (!isRecord(v)) return null;
    v = v[p];
  }
  return v ?? null;
}

function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const COST_MICROS_RE = /metrics\.cost_micros$/i;

type GaqlSummary = {
  computedOverRowCount: number;
  sums: Record<string, number>;
  topByCost?: unknown[];
  bottomByCost?: unknown[];
};

const ORDER_BY_COST_RE = /\bORDER\s+BY\s+metrics\.cost_micros\b/i;

/** Aggregate numeric metric columns across the full fetched row set so callers
 *  can make decisions without reading every row.
 *  Skips top/bottom-by-cost when the query already orders by cost — in that
 *  case the rows slice IS the top and "bottom" would just mean "rank ≈ limit",
 *  not actual low-spenders in the population. */
export function buildGaqlSummary(
  rows: unknown[],
  selectFields: string[],
  query: string = "",
): GaqlSummary | null {
  if (rows.length === 0) return null;
  const metricFields = selectFields.filter((f) => /^metrics\./i.test(f));
  if (metricFields.length === 0) return null;

  const sums: Record<string, number> = {};
  for (const field of metricFields) {
    let sum = 0;
    let hasAny = false;
    for (const row of rows) {
      const n = toFiniteNumber(getNestedValue(row, field));
      if (n != null) {
        sum += n;
        hasAny = true;
      }
    }
    if (hasAny) sums[field] = sum;
  }

  const summary: GaqlSummary = { computedOverRowCount: rows.length, sums };

  const costField = metricFields.find((f) => COST_MICROS_RE.test(f));
  const alreadyOrderedByCost = ORDER_BY_COST_RE.test(query);
  if (costField && rows.length > 1 && !alreadyOrderedByCost) {
    const sorted = [...rows].sort((a, b) => {
      const av = toFiniteNumber(getNestedValue(a, costField)) ?? 0;
      const bv = toFiniteNumber(getNestedValue(b, costField)) ?? 0;
      return bv - av;
    });
    const sliceSize = Math.min(5, Math.floor(sorted.length / 2));
    if (sliceSize > 0) {
      summary.topByCost = sorted.slice(0, sliceSize);
      summary.bottomByCost = sorted.slice(-sliceSize).reverse();
    }
  }

  return summary;
}

/** Suggest follow-up actions when a query is truncated. Both flags can be true
 *  when byte-budget trimming kicks in on top of an already row-truncated set —
 *  the hint reflects both conditions so the agent sees the full picture. */
export function buildContinuationHint(
  query: string,
  returnedRowCount: number,
  effectiveLimit: number,
  flags: { rowTruncated: boolean; byteTruncated: boolean },
): string {
  const { rowTruncated, byteTruncated } = flags;
  const suggestions: string[] = [];
  if (!/\bsegments\.date\b/i.test(query)) {
    suggestions.push("add a date filter (e.g. `WHERE segments.date DURING LAST_7_DAYS`)");
  }
  if (!/\bcampaign\.id\s*(?:IN\s*\(|=)/i.test(query)) {
    suggestions.push("filter to specific campaigns (`WHERE campaign.id IN (...)`)");
  }
  if (rowTruncated && effectiveLimit < MAX_GAQL_LIMIT) {
    suggestions.push(`raise \`limit\` up to ${MAX_GAQL_LIMIT}`);
  }
  if (byteTruncated) {
    suggestions.push("select fewer columns to shrink row size");
  }
  const causes: string[] = [];
  if (rowTruncated) causes.push(`hit row limit of ${effectiveLimit}`);
  if (byteTruncated) causes.push(`exceeded byte budget (trimmed to ${returnedRowCount} rows)`);
  const cause = causes.length > 0
    ? `Truncated: ${causes.join(" and ")}.`
    : "Truncated.";
  const tail = suggestions.length > 0
    ? ` To see more: ${suggestions.join("; ")}.`
    : "";
  return `${cause}${tail}`;
}

export type GaqlReportMeta = {
  asOf: string;
  customerId: string;
  loginCustomerId: string | null;
  resource: string | null;
  dateRange: { start: string; end: string; source: "between" | "during"; days?: number } | null;
  currencyCode: string | null;
  timeZone: string | null;
  selectedFieldCount: number;
  requestedLimit: number;
  effectiveLimit: number;
  fetchedRowCount: number;
  returnedRowCount: number;
  truncated: boolean;
  excludeRemovedParents: boolean;
  reportingLagDays: number | null;
  filters: {
    campaignStatuses: { included: string[]; excluded: string[] };
    adGroupStatuses: { included: string[]; excluded: string[] };
    campaignTypes: { included: string[]; excluded: string[] };
  };
  dataCompleteness: {
    rows: "complete" | "truncated";
    searchTerms?: "privacy_threshold_limited";
    changeEvents?: "last_30_days_only";
    removedParents?: "excluded" | "included";
    reportingLag?: "same_day_or_realtime" | "lagged" | "unknown";
  };
  warnings: string[];
};

export type GaqlReport = {
  rowCount: number;
  requestedLimit: number;
  fetchedRowCount: number;
  truncated: boolean;
  truncationReason: "row_limit" | "byte_budget" | null;
  meta: GaqlReportMeta;
  summary?: GaqlSummary;
  continuationHint?: string;
  rows: unknown[];
};

export type RunSafeGaqlOptions = {
  /**
   * Most agent reads ask for current account state. GAQL does not implicitly
   * hide children of REMOVED campaigns/ad groups, so default to excluding them
   * when the queried resource has a campaign/ad group parent.
   */
  excludeRemovedParents?: boolean;
};

const DEFAULT_EXCLUDE_REMOVED_PARENTS = true;

const CAMPAIGN_SCOPED_RESOURCES = new Set([
  "campaign",
  "ad_group",
  "ad_group_ad",
  "keyword_view",
  "search_term_view",
  "landing_page_view",
  "campaign_criterion",
  "campaign_asset",
  "ad_group_criterion",
  "ad_group_asset",
  "asset_group",
  "asset_group_asset",
  "asset_group_product_group_view",
  "detail_placement_view",
  "display_keyword_view",
  "geographic_view",
  "group_placement_view",
  "location_view",
  "paid_organic_search_term_view",
  "shopping_performance_view",
  "user_location_view",
]);

const AD_GROUP_SCOPED_RESOURCES = new Set([
  "ad_group",
  "ad_group_ad",
  "keyword_view",
  "search_term_view",
  "ad_group_criterion",
  "ad_group_asset",
  "detail_placement_view",
  "display_keyword_view",
  "group_placement_view",
  "paid_organic_search_term_view",
]);

const SEGMENT_WHERE_SELECT_EXEMPTIONS = new Set([
  "segments.date",
  "segments.week",
  "segments.month",
  "segments.quarter",
  "segments.year",
]);

/**
 * GAQL only supports a fixed set of `DURING` date literals (TODAY, YESTERDAY,
 * LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH,
 * LAST_BUSINESS_WEEK, LAST_WEEK_MON_SUN, LAST_WEEK_SUN_SAT, THIS_WEEK_*).
 * Agents routinely emit invalid literals like `LAST_90_DAYS`, `LAST_60_DAYS`,
 * or `THIS_YEAR` — Google rejects these with `Invalid date literal supplied
 * for DURING operator` (query_error=22), and the agent has to retry.
 *
 * Auto-translate the most common invalid literals to a `BETWEEN '<start>' AND
 * '<end>'` clause so the query just works. We translate any `LAST_N_DAYS`
 * outside the supported set (7/14/30), plus `THIS_YEAR`/`LAST_YEAR`.
 */
export function rewriteInvalidDateLiterals(query: string, today: Date = new Date()): string {
  let out = query;

  // LAST_N_DAYS where N is not 7, 14, or 30 — translate to a rolling window
  // ending today. The window is N days long, matching Google's semantics
  // (LAST_30_DAYS = today + 29 prior days).
  out = out.replace(
    /\bDURING\s+LAST_(\d+)_DAYS\b/gi,
    (match, nStr: string) => {
      const n = Number(nStr);
      if (!Number.isFinite(n) || n <= 0) return match;
      if (n === 7 || n === 14 || n === 30) return match;
      const end = new Date(today);
      const start = new Date(today);
      start.setDate(end.getDate() - (n - 1));
      return `BETWEEN '${formatDate(start)}' AND '${formatDate(end)}'`;
    },
  );

  // THIS_YEAR — Jan 1 of current year through today.
  out = out.replace(/\bDURING\s+THIS_YEAR\b/gi, () => {
    const start = new Date(today.getFullYear(), 0, 1);
    return `BETWEEN '${formatDate(start)}' AND '${formatDate(today)}'`;
  });

  // LAST_YEAR — Jan 1 through Dec 31 of the previous calendar year.
  out = out.replace(/\bDURING\s+LAST_YEAR\b/gi, () => {
    const y = today.getFullYear() - 1;
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    return `BETWEEN '${formatDate(start)}' AND '${formatDate(end)}'`;
  });

  return out;
}

/**
 * Agents sometimes use GAQL preset date literals with equality syntax:
 * `segments.date = LAST_30_DAYS`. Google only accepts presets with DURING;
 * equality requires an explicit ISO date. Rewrite preset-like tokens to DURING
 * before the invalid-date-literal rewriter handles unsupported windows.
 */
export function rewritePresetDateEquality(query: string): string {
  return query.replace(
    /\bsegments\.date\s*=\s*['"]?([A-Z][A-Z0-9_]+)['"]?\b/gi,
    (_match, literal: string) => `segments.date DURING ${literal.toUpperCase()}`,
  );
}

function rawFieldForVirtualSibling(field: string): string | null {
  const lower = field.toLowerCase();
  if (lower.endsWith("_value")) {
    // Real Google Ads fields like metrics.conversion_value are genuine GAQL
    // fields, not MCP-added micros-to-major-unit siblings.
    if (/conversions?_value$/.test(lower)) return null;
    return field.replace(/_value$/i, "_micros");
  }
  if (!lower.endsWith("_name")) return null;
  // Real GAQL fields with this suffix are not MCP-added humanized siblings.
  if (/(canonical|descriptive|resource|conversion_action)_name$/.test(lower)) return null;
  return field.replace(/_name$/i, "");
}

/**
 * Humanized result rows add enum-name siblings like `campaign.status_name`
 * after GAQL runs. Agents sometimes feed those row fields back into the next
 * SELECT. Rewrite the safe enum-name form to the raw GAQL field so the query
 * works and the response still includes the humanized sibling.
 */
export function rewriteVirtualNameFields(query: string): string {
  return query.replace(
    /\b([a-z][\w]*(?:\.[a-z][\w]*)+_name)\b/gi,
    (match, field: string) => rawFieldForVirtualSibling(field) ?? match,
  );
}

function dateRangeForDuringLiteral(literal: string, today: Date): { start: Date; end: Date } | null {
  const upper = literal.toUpperCase();
  const end = new Date(today);
  const start = new Date(today);

  if (upper === "TODAY") return { start, end };
  if (upper === "YESTERDAY") {
    start.setDate(end.getDate() - 1);
    end.setDate(end.getDate() - 1);
    return { start, end };
  }

  const lastNDays = upper.match(/^LAST_(\d+)_DAYS$/);
  if (lastNDays) {
    const days = Number(lastNDays[1]);
    if (!Number.isFinite(days) || days <= 0) return null;
    start.setDate(end.getDate() - (days - 1));
    return { start, end };
  }

  if (upper === "THIS_MONTH") {
    start.setDate(1);
    return { start, end };
  }
  if (upper === "LAST_MONTH") {
    start.setMonth(end.getMonth() - 1, 1);
    end.setDate(0);
    return { start, end };
  }

  return null;
}

function explicitChangeEventWindow(start: string, end: string): string {
  return `change_event.change_date_time >= '${start} 00:00:00' AND change_event.change_date_time <= '${end} 23:59:59'`;
}

/**
 * Google rejects DURING/BETWEEN syntax on change_event.change_date_time even
 * when the date range is otherwise valid. Rewrite common agent-authored forms
 * into the explicit timestamp bounds that the change_event resource requires.
 */
export function rewriteChangeEventDateFilters(query: string, today: Date = new Date()): string {
  if (extractFromResource(query) !== "change_event") return query;

  return query
    .replace(
      /\bchange_event\.change_date_time\s+DURING\s+([A-Z0-9_]+)\b/gi,
      (match, literal: string) => {
        const range = dateRangeForDuringLiteral(literal, today);
        if (!range) return match;
        return explicitChangeEventWindow(formatDate(range.start), formatDate(range.end));
      },
    )
    .replace(
      /\bchange_event\.change_date_time\s+BETWEEN\s+['"](\d{4}-\d{2}-\d{2})[^'"]*['"]\s+AND\s+['"](\d{4}-\d{2}-\d{2})[^'"]*['"]/gi,
      (_match, start: string, end: string) => explicitChangeEventWindow(start, end),
    );
}

/**
 * Append a self-correcting hint to specific Google Ads errors so the agent's
 * next attempt has a clear path forward. Each tip names the exact next move
 * (which tool to call, which clause to add) so the LLM doesn't have to guess.
 *
 *   - query_error=32 ("Unrecognized field"): point to getResourceMetadata.
 *   - query_error=49 ("metric ... incompatible with FROM clause"): hint to
 *     switch the FROM resource (the metric usually lives on a different one).
 *   - query_error=22 ("Invalid date literal"): name the supported set and
 *     direct callers to BETWEEN — a backstop for literals our rewriter
 *     doesn't catch (e.g. typos like LAST_THIRTY_DAYS).
 *   - query_error=16 ("must be present in SELECT clause"): name the field
 *     and tell the agent to add it to SELECT (or drop it from WHERE).
 *   - query_error=18 ("Invalid enum value … in WHERE"): tell the agent to
 *     use the string enum name, not the numeric code.
 *   - query_error=53 ("unsupported metric" with segment): tell the agent
 *     the segment can't pair with that metric — drop one or the other.
 *   - change_event_error=2 (start date too old): name the 30-day cap.
 *   - change_event_error=3 (missing change_date_time filter): name the
 *     exact filter shape that change_event requires.
 */
export function enrichGaqlError(message: string): string {
  if (/Unrecognized fields? in the query/i.test(message)) {
    const aliasTips: string[] = [];
    if (/metrics\.average_cpc_micros\b/i.test(message)) {
      aliasTips.push("`metrics.average_cpc_micros` is not a GAQL field; select `metrics.average_cpc` instead.");
    }
    if (/metrics\.cost_per_conversion_micros\b/i.test(message)) {
      aliasTips.push("`metrics.cost_per_conversion_micros` is not a GAQL field; select `metrics.cost_per_conversion` instead.");
    }
    if (/metrics\.impression_share\b/i.test(message)) {
      aliasTips.push("`metrics.impression_share` is not a GAQL field; for Search campaigns use `metrics.search_impression_share` (or call getResourceMetadata for the right channel-specific impression-share metric).");
    }
    if (aliasTips.length > 0) {
      return `${message} Tip: ${aliasTips.join(" ")}`;
    }

    // Check whether the unrecognized field is a MCP virtual field (_value /
    // _name siblings added after the query runs). They look like GAQL fields
    // but don't exist in the schema — a targeted hint beats the generic one.
    const virtualMatch = message.match(/\b([\w.]+_(?:value|name))\b/);
    if (virtualMatch) {
      const field = virtualMatch[1];
      const rawField = rawFieldForVirtualSibling(field);
      if (rawField) {
        return `${message} Tip: \`${field}\` is a virtual field added by the MCP after the query runs — it does not exist in the GAQL schema and cannot be used in SELECT or WHERE. Instead, select the raw field (\`${rawField}\`) and the MCP will automatically attach \`${field}\` to every result row.`;
      }
    }
    return `${message} Tip: discover valid fields with the getResourceMetadata tool before retrying. Use the resource in your FROM clause — for example, if the query says \`FROM campaign\`, call \`getResourceMetadata('campaign')\`; if it says \`FROM search_term_view\`, call \`getResourceMetadata('search_term_view')\`.`;
  }
  if (/incompatible with the resource in the FROM clause/i.test(message)) {
    return `${message} Tip: this metric is not selectable on that resource. Try a different FROM (e.g. metrics.cost_micros lives on campaign/ad_group/keyword_view, not on conversion_action). To break down metrics by conversion action, query FROM campaign (or ad_group) and SELECT segments.conversion_action_name.`;
  }
  if (/Invalid date literal supplied for DURING operator/i.test(message)) {
    return `${message} Tip: only LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS, TODAY, YESTERDAY, THIS_MONTH, LAST_MONTH, LAST_BUSINESS_WEEK, LAST_WEEK_MON_SUN, LAST_WEEK_SUN_SAT, THIS_WEEK_MON_TODAY, THIS_WEEK_SUN_TODAY are valid. For longer windows use \`segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'\`.`;
  }
  const requiredSelect = message.match(
    /must be present in SELECT clause: '([a-z_.]+)'/i,
  );
  if (requiredSelect) {
    const field = requiredSelect[1];
    return `${message} Tip: add \`${field}\` to the SELECT clause (Google requires that any field used in WHERE/ORDER BY also be selected), or drop it from WHERE if you don't need to filter on it.`;
  }
  if (/Invalid enum value cannot be included in WHERE clause/i.test(message)) {
    return `${message} Tip: enum fields take STRING names, not numeric codes — write \`campaign.status = 'PAUSED'\`, not \`campaign.status = 3\`. Common enum names: status (ENABLED, PAUSED, REMOVED), advertising_channel_type (SEARCH, DISPLAY, SHOPPING, PERFORMANCE_MAX, VIDEO). For the full set, call getResourceMetadata with the FROM resource, e.g. \`getResourceMetadata('campaign')\`.`;
  }
  if (
    /unsupported metric is found in SELECT or WHERE clause/i.test(message) ||
    /Cannot select the following segments because at least one unsupported metric/i.test(message)
  ) {
    return `${message} Tip: that segment doesn't pair with one of your selected metrics — pick one. Either drop the segment (e.g. segments.conversion_action_name) or drop the incompatible metric (e.g. metrics.cost_micros). To break down spend by conversion action, you generally can't — Google reports cost at the campaign/ad_group level, not per conversion action.`;
  }
  if (/change_event_error=2/i.test(message) || /start date is too old/i.test(message)) {
    return `${message} Tip: change_event is capped at the last 30 days. Use \`WHERE change_event.change_date_time >= '<today minus 29 days> 00:00:00' AND change_event.change_date_time <= '<today> 23:59:59'\`. Use \`ads.queries.changeEvents(start, end)\` which already clamps the window.`;
  }
  if (/change_event_error=3/i.test(message) || /missing filters on change_event\.change_date_time/i.test(message)) {
    return `${message} Tip: change_event REQUIRES an explicit \`change_event.change_date_time\` filter — \`segments.date DURING …\` does NOT work for this resource. Add \`WHERE change_event.change_date_time >= '<YYYY-MM-DD> 00:00:00' AND change_event.change_date_time <= '<YYYY-MM-DD> 23:59:59'\` (window must be inside the last 30 days).`;
  }
  if (/authorization_error=26/i.test(message) && /auction_insight/i.test(message)) {
    return `${message} Tip: \`metrics.auction_insight_*\` and \`segments.auction_insight_domain\` are real GAQL fields, but they require special developer-token access. If your account isn't enrolled for auction-insights API access, this query will not work — view auction insights in the Google Ads UI under Tools → Auction Insights, or contact Google Ads support to request API access.`;
  }
  return message;
}

// ─── Pre-Flight GAQL Validators ─────────────────────────────────────
//
// Catch the most common LLM-authored GAQL mistakes BEFORE sending them to
// Google. Each rejection names the exact fix so the next attempt converges.

/**
 * change_event has two hard requirements Google enforces:
 *   1. The WHERE clause must filter on `change_event.change_date_time`
 *      (segments.date is silently rejected with change_event_error=3).
 *   2. The window cannot exceed 30 days (change_event_error=2).
 *
 * We catch both here before the round-trip so the agent gets one clear
 * message instead of a vague Google error.
 */
export function validateChangeEventFilter(query: string) {
  const resource = extractFromResource(query);
  if (resource !== "change_event") return;
  // The field is required in WHERE specifically — SELECT-only mentions don't
  // count, since Google validates the predicate, not the projection.
  const whereMatch = query.match(
    /\sWHERE\s+([\s\S]*?)(?:\sORDER\s+BY\s|\sLIMIT\s|\sPARAMETERS\s|$)/i,
  );
  const whereClause = whereMatch?.[1] ?? "";
  if (/\bchange_event\.change_date_time\s+(?:DURING|BETWEEN)\b/i.test(whereClause)) {
    throw new Error(
      "GAQL pre-flight: change_event.change_date_time does not support DURING or BETWEEN. " +
        "Use explicit timestamp bounds: WHERE change_event.change_date_time >= '<YYYY-MM-DD> 00:00:00' AND change_event.change_date_time <= '<YYYY-MM-DD> 23:59:59' (window must be inside the last 30 days). " +
        "Easiest path: use ads.queries.changeEvents(start, end) — it builds the correct shape.",
    );
  }
  if (!/\bchange_event\.change_date_time\b/i.test(whereClause)) {
    throw new Error(
      "GAQL pre-flight: queries against `change_event` REQUIRE a `change_event.change_date_time` filter in WHERE — `segments.date DURING ...` is not valid for this resource. " +
        "Add `WHERE change_event.change_date_time >= '<YYYY-MM-DD> 00:00:00' AND change_event.change_date_time <= '<YYYY-MM-DD> 23:59:59'` (window must be inside the last 30 days). " +
        "Easiest path: use `ads.queries.changeEvents(start, end)` — it builds the correct shape.",
      );
  }
  const lower = whereClause.match(
    /\bchange_event\.change_date_time\s*>=\s*['"](\d{4}-\d{2}-\d{2})[^'"]*['"]/i,
  )?.[1];
  const upper = whereClause.match(
    /\bchange_event\.change_date_time\s*<=\s*['"](\d{4}-\d{2}-\d{2})[^'"]*['"]/i,
  )?.[1];
  if (!lower || !upper) {
    throw new Error(
      "GAQL pre-flight: change_event requires a finite explicit timestamp window. " +
        "Add both lower and upper bounds: WHERE change_event.change_date_time >= '<YYYY-MM-DD> 00:00:00' AND change_event.change_date_time <= '<YYYY-MM-DD> 23:59:59' (window must be inside the last 30 days). " +
        "Easiest path: use ads.queries.changeEvents(start, end) — it builds the correct shape.",
    );
  }
  if (lower > upper) {
    throw new Error(
      "GAQL pre-flight: change_event timestamp window is inverted after normalization. " +
        "Use a start date on or before the end date, inside Google's 30-day change_event window. " +
        "Easiest path: use ads.queries.changeEvents(start, end) — it builds the correct shape.",
    );
  }
}

/**
 * `metrics.*` cannot be selected from `FROM conversion_action` — that resource
 * carries dimensional/config fields only. Reject early with the agent's actual
 * options spelled out.
 */
export function validateMetricsOnConversionAction(query: string) {
  const resource = extractFromResource(query);
  if (resource !== "conversion_action") return;
  const selectMatch = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i);
  if (!selectMatch) return;
  const selectClause = selectMatch[1];
  if (/\bmetrics\.[a-z_]+/i.test(selectClause)) {
    throw new Error(
      "GAQL pre-flight: `metrics.*` is not selectable from `FROM conversion_action` — that resource carries dimensional fields only (name, type, status, counting settings). " +
        "If you want metric counts: query `FROM campaign` (or `ad_group`) and add `segments.conversion_action_name` to break down by conversion action. " +
        "If you want config only: drop the `metrics.*` fields from SELECT and keep just `conversion_action.*` columns.",
    );
  }
}

const CONVERSION_ACTION_SEGMENTS = new Set([
  "segments.conversion_action",
  "segments.conversion_action_category",
  "segments.conversion_action_name",
]);

const CONVERSION_ACTION_INCOMPATIBLE_METRICS = new Set([
  "metrics.average_cpc",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.cost_per_conversion",
  "metrics.ctr",
  "metrics.impressions",
  "metrics.interactions",
]);

/**
 * Google does not support segmenting click/cost-side metrics by conversion
 * action. Agents often try to compute per-action CPA in one GAQL query; make
 * the split-query pattern explicit before the request reaches Google.
 */
export function validateConversionActionMetricSegments(query: string) {
  const selectFields = extractSelectFields(query).map((field) => field.toLowerCase());
  const selectedConversionSegments = selectFields.filter((field) => CONVERSION_ACTION_SEGMENTS.has(field));
  if (selectedConversionSegments.length === 0) return;

  const incompatibleMetrics = selectFields.filter((field) => CONVERSION_ACTION_INCOMPATIBLE_METRICS.has(field));
  if (incompatibleMetrics.length === 0) return;

  throw new Error(
    "GAQL pre-flight: conversion_action segments cannot be selected with click/cost metrics. " +
      `Drop ${incompatibleMetrics.map((field) => `\`${field}\``).join(", ")} or drop ${selectedConversionSegments.map((field) => `\`${field}\``).join(", ")}. ` +
      "For per-action conversion counts, query `segments.conversion_action_name` with `metrics.conversions`. " +
      "For spend/CPA, query campaign or ad_group cost separately and calculate the ratio in JavaScript.",
  );
}

/**
 * Catch malformed date ranges LLMs create when mixing DURING-style literals
 * with BETWEEN syntax, e.g. `BETWEEN 'LAST_30_DAYS' AND 'undefined'`.
 * Google rejects these with query_error=26, but the fix is deterministic.
 */
export function validateMalformedDateRanges(query: string) {
  const invalidBetween = query.match(
    /\bsegments\.date\s+BETWEEN\s+(['"]?)([^'"\s)]+)\1\s+AND\s+(['"]?)([^'"\s)]+)\3/i,
  );
  if (!invalidBetween) return;

  const [, , start, , end] = invalidBetween;
  const badToken = [start, end].find((value) =>
    /^(undefined|null|nan)$/i.test(value) ||
    /^(?:LAST|THIS|TODAY|YESTERDAY)/i.test(value) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value),
  );
  if (!badToken) return;

  throw new Error(
    `GAQL pre-flight: invalid segments.date BETWEEN range contains \`${badToken}\`. ` +
      "Use `segments.date DURING LAST_30_DAYS` for preset windows, or " +
      "`segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'` for explicit dates. " +
      "Do not mix DURING literals with BETWEEN.",
  );
}

/**
 * Some Google Ads reporting views require a finite `segments.date` predicate.
 * The largest observed production source is `search_term_view`; catch that
 * exact resource locally instead of building a broad fake GAQL validator.
 */
export function validateRequiredDateFilter(query: string) {
  const resource = extractFromResource(query);
  if (resource !== "search_term_view") return;
  const whereMatch = query.match(
    /\sWHERE\s+([\s\S]*?)(?:\sHAVING\s|\sORDER\s+BY\s|\sLIMIT\s|\sPARAMETERS\s|$)/i,
  );
  const whereClause = whereMatch?.[1] ?? "";
  if (/\bsegments\.date\s+(?:DURING|BETWEEN|>=|>|<=|<|=)\b/i.test(whereClause)) return;

  throw new Error(
    "GAQL pre-flight: `search_term_view` requires a finite `segments.date` filter. " +
      "Add `WHERE segments.date DURING LAST_30_DAYS` or " +
      "`WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'` before querying search terms.",
  );
}

/**
 * Tiny denylist for high-volume hallucinated GAQL fields seen in production.
 * This is intentionally not a schema clone; it only blocks fields where the
 * replacement is stable and safer than asking the model to guess again.
 */
const KNOWN_UNSUPPORTED_GAQL_FIELDS: Record<string, string> = {
  "metrics.average_cpc_micros":
    "`metrics.average_cpc_micros` is not a GAQL field. Select `metrics.average_cpc` instead.",
  "metrics.cost_per_conversion_micros":
    "metrics.cost_per_conversion_micros is not a GAQL field. Select metrics.cost_per_conversion instead.",
  "metrics.conversion_rate":
    "`metrics.conversion_rate` is not a GAQL field. Select `metrics.conversions` and `metrics.clicks`, then calculate `conversions / clicks` in JavaScript.",
  "metrics.quality_info.quality_score":
    "`metrics.quality_info.quality_score` is not a GAQL field. Quality score lives on keyword criteria: select `ad_group_criterion.quality_info.quality_score` from `FROM ad_group_criterion`, and query delivery metrics separately from `FROM keyword_view`.",
  "metrics.impression_share":
    "metrics.impression_share is not a GAQL field. For Search campaigns, select metrics.search_impression_share; for other channels call getResourceMetadata to choose the right impression-share metric.",
  "metrics.search_overlap_rate":
    "`metrics.search_overlap_rate` is not a GAQL field in this Ads API surface. Auction-insight style overlap metrics are not exposed under the old search_* names; call `getResourceMetadata('campaign')` and look for supported `metrics.auction_insight_*` fields, or use the Google Ads UI if API auction-insights access is unavailable.",
  "metrics.search_position_above_rate":
    "`metrics.search_position_above_rate` is not a GAQL field in this Ads API surface. Auction-insight style position-above metrics are not exposed under the old search_* names; call `getResourceMetadata('campaign')` and look for supported `metrics.auction_insight_*` fields, or use the Google Ads UI if API auction-insights access is unavailable.",
  "metrics.search_outranking_share":
    "`metrics.search_outranking_share` is not a GAQL field in this Ads API surface. Auction-insight style outranking-share metrics are not exposed under the old search_* names; call `getResourceMetadata('campaign')` and look for supported `metrics.auction_insight_*` fields, or use the Google Ads UI if API auction-insights access is unavailable.",
  "metrics.search_lost_is_rank":
    "`metrics.search_lost_is_rank` is not a GAQL field. Select `metrics.search_rank_lost_impression_share` for Search lost impression share due to rank, or call `getResourceMetadata(<FROM resource>)` to confirm compatibility.",
  "metrics.search_lost_is_budget":
    "`metrics.search_lost_is_budget` is not a GAQL field. Select `metrics.search_budget_lost_impression_share` for Search lost impression share due to budget, or call `getResourceMetadata(<FROM resource>)` to confirm compatibility.",
  "metrics.video_views":
    "`metrics.video_views` is not selectable in this Ads API surface. For video/performance analysis, call `getResourceMetadata(<FROM resource>)` and use supported video metrics for that resource, or fall back to impressions/clicks/conversions when video-specific fields are unavailable.",
  "metrics.view_rate":
    "`metrics.view_rate` is not selectable in this Ads API surface. For video/performance analysis, call `getResourceMetadata(<FROM resource>)` and use supported video metrics for that resource, or calculate a rate from supported view/impression fields when both exist.",
  "metrics.average_cpv":
    "`metrics.average_cpv` is not selectable in this Ads API surface. For video/performance analysis, call `getResourceMetadata(<FROM resource>)` and use supported video-cost fields for that resource, or calculate CPV from supported cost/view fields when both exist.",
  "asset.status":
    "`asset.status` is not a GAQL field. Asset serving status lives on the link resource (`campaign_asset.status`, `ad_group_asset.status`, `asset_group_asset.status`, or `customer_asset.status`); select the relevant link status for the FROM resource.",
  "asset_group_asset.performance_label":
    "`asset_group_asset.performance_label` is not a GAQL field. Select `asset_group_asset.field_type`, `asset_group_asset.status`, and asset fields, then evaluate performance from `asset_group_asset` metrics or campaign/ad_group metrics separately.",
  "asset.text_asset.performance_label":
    "`asset.text_asset.performance_label` is not a GAQL field. Asset performance labels live on asset link resources when available; select `campaign_asset.*`, `ad_group_asset.*`, or `asset_group_asset.*` fields appropriate to your FROM resource.",
  "asset_group_listing_group_filter.path.dimensions":
    "`asset_group_listing_group_filter.path.dimensions` is not a selectable GAQL field. Select the concrete listing-filter fields exposed by `getResourceMetadata('asset_group_listing_group_filter')`, such as type, listing_source, case_value, and parent fields.",
  "asset.sitelink_asset.final_urls":
    "`asset.sitelink_asset.final_urls` is not a GAQL field. Use `getResourceMetadata('asset')` to confirm the available asset URL fields before retrying.",
  "asset_field_type":
    "`asset_field_type` is not a bare GAQL field. Use the link-resource field for the surface you are querying: `campaign_asset.field_type`, `ad_group_asset.field_type`, `asset_group_asset.field_type`, or `customer_asset.field_type`.",
  "campaign_asset.asset_type":
    "`campaign_asset.asset_type` is not a GAQL field. Select `campaign_asset.field_type` for the attachment role and select concrete `asset.*` fields for the asset's content/type details.",
  "group_placement_view.display":
    "`group_placement_view.display` is not a GAQL field. Use `group_placement_view.display_name` for the placement label.",
  "geo_target_constant.canonical":
    "`geo_target_constant.canonical` is not a GAQL field. Select `geo_target_constant.canonical_name` instead.",
  "campaign.url_expansion_opt_out":
    "`campaign.url_expansion_opt_out` is not a GAQL field. Use `getResourceMetadata('campaign')` to confirm the available campaign URL/expansion fields before retrying.",
  "campaign.budget_amount_micros":
    "`campaign.budget_amount_micros` is not a GAQL field. Budget lives on the linked `campaign_budget` resource — SELECT `campaign_budget.amount_micros` (join is automatic when both fields are selected from a campaign-scoped FROM clause).",
  "campaign.budget_micros":
    "`campaign.budget_micros` is not a GAQL field. Budget lives on the linked `campaign_budget` resource — SELECT `campaign_budget.amount_micros` from `FROM campaign`.",
  "campaign_criterion.audience.audience":
    "`campaign_criterion.audience.audience` is not a GAQL field. The audience-criterion resource is `campaign_criterion.user_list` / `campaign_criterion.audience`; call `getResourceMetadata('campaign_criterion')` to confirm the audience-criterion sub-fields before retrying.",
  "campaign_criterion.proximity.address.city":
    "`campaign_criterion.proximity.address.city` is not a GAQL field. Select `campaign_criterion.proximity.address.city_name` instead.",
  "campaign_criterion.day_of_week":
    "`campaign_criterion.day_of_week` is not a GAQL field. Ad schedule fields are nested: select `campaign_criterion.ad_schedule.day_of_week`, `campaign_criterion.ad_schedule.start_hour`, and `campaign_criterion.ad_schedule.end_hour`.",
  "campaign_criterion.start_hour":
    "`campaign_criterion.start_hour` is not a GAQL field. Ad schedule fields are nested: select `campaign_criterion.ad_schedule.start_hour`.",
  "campaign_criterion.end_hour":
    "`campaign_criterion.end_hour` is not a GAQL field. Ad schedule fields are nested: select `campaign_criterion.ad_schedule.end_hour`.",
  "change_event.campaign.name":
    "`change_event.campaign.name` is not a GAQL field. Select `change_event.campaign` and join to campaign names with a separate campaign query, or use `ads.queries.changeEvents(start, end)` for the supported change_event shape.",
  "change_event.resource_type":
    "`change_event.resource_type` is not a GAQL field. Select `change_event.change_resource_type` instead, or use `ads.queries.changeEvents(start, end)`.",
  "ad_group_criterion.quality_info.ad_relevance":
    "`ad_group_criterion.quality_info.ad_relevance` is not a GAQL field. Use the supported quality score components: `ad_group_criterion.quality_info.creative_quality_score`, `ad_group_criterion.quality_info.post_click_quality_score`, and `ad_group_criterion.quality_info.search_predicted_ctr`.",
  "ad_group_criterion.quality_info.landing_page_experience":
    "`ad_group_criterion.quality_info.landing_page_experience` is not a GAQL field. Use `ad_group_criterion.quality_info.post_click_quality_score` as Google's supported landing-page quality component.",
  "campaign_experiment.name":
    "`campaign_experiment.name` is not a GAQL field in this Ads API surface. Call `getResourceMetadata('experiment')` / `getResourceMetadata('campaign_experiment')` before querying experiment fields, or use the dedicated experiment tools when you need experiment state.",
  "campaign_experiment.status":
    "`campaign_experiment.status` is not a GAQL field in this Ads API surface. Call `getResourceMetadata('experiment')` / `getResourceMetadata('campaign_experiment')` before querying experiment fields, or use the dedicated experiment tools when you need experiment state.",
  "campaign_experiment.start_date":
    "`campaign_experiment.start_date` is not a GAQL field in this Ads API surface. Call `getResourceMetadata('experiment')` / `getResourceMetadata('campaign_experiment')` before querying experiment fields, or use the dedicated experiment tools when you need experiment state.",
  "campaign_experiment.end_date":
    "`campaign_experiment.end_date` is not a GAQL field in this Ads API surface. Call `getResourceMetadata('experiment')` / `getResourceMetadata('campaign_experiment')` before querying experiment fields, or use the dedicated experiment tools when you need experiment state.",
  "campaign_experiment.traffic_split_percent":
    "`campaign_experiment.traffic_split_percent` is not a GAQL field in this Ads API surface. Call `getResourceMetadata('experiment')` / `getResourceMetadata('campaign_experiment')` before querying experiment fields, or use the dedicated experiment tools when you need experiment state.",
  "conversion_action.default_value":
    "`conversion_action.default_value` is not a GAQL field. Select `conversion_action.value_settings.default_value` instead.",
  "conversion_action.most_recent_conversion_date":
    "`conversion_action.most_recent_conversion_date` is not a GAQL field. For recent conversion activity, query metrics from `FROM campaign` or `FROM ad_group` with `segments.conversion_action_name` and a `segments.date` window.",
  "conversion_action.last_conversion_date":
    "`conversion_action.last_conversion_date` is not a GAQL field. For recent conversion activity, query metrics from `FROM campaign` or `FROM ad_group` with `segments.conversion_action_name` and a `segments.date` window.",
  "conversion_action.include_in_client_account_conversions_metric":
    "`conversion_action.include_in_client_account_conversions_metric` is not a GAQL field in this Ads API surface. Select supported `conversion_action.*` config fields or call `getResourceMetadata('conversion_action')` before retrying.",
  "conversion_action.google_analytics_4_settings.property":
    "`conversion_action.google_analytics_4_settings.property` is not selectable in this Ads API surface. For GA4-imported conversion actions, select supported `conversion_action.*` config fields (id, name, type, category, status, primary_for_goal, owner_customer) and inspect GA4-specific linkage in Google Ads UI / GA4 when needed.",
  "conversion_action.google_analytics_4_settings.event":
    "`conversion_action.google_analytics_4_settings.event` is not selectable in this Ads API surface. For GA4-imported conversion actions, select supported `conversion_action.*` config fields and inspect event-level linkage in Google Ads UI / GA4 when needed.",
  "conversion_action.firebase_settings.event":
    "`conversion_action.firebase_settings.event` is not selectable in this Ads API surface. For Firebase-imported conversion actions, select supported `conversion_action.*` config fields and inspect event-level linkage in Firebase/Google Ads UI when needed.",
  "conversion_action.primary_for_bidding":
    "`conversion_action.primary_for_bidding` is not a GAQL field. Use `conversion_action.primary_for_goal` for primary/secondary status.",
  "recommendation.impact.base_metrics.impressions":
    "`recommendation.impact.base_metrics.impressions` is not a GAQL field. Call `getResourceMetadata('recommendation')` to confirm the available `recommendation.impact.*` fields before retrying.",
  "recommendation.impact.base_metrics.clicks":
    "`recommendation.impact.base_metrics.clicks` is not a GAQL field. Call `getResourceMetadata('recommendation')` to confirm the available `recommendation.impact.*` fields before retrying.",
  "recommendation.impact.base_metrics.cost_micros":
    "`recommendation.impact.base_metrics.cost_micros` is not a GAQL field. Call `getResourceMetadata('recommendation')` to confirm the available `recommendation.impact.*` fields before retrying.",
  "recommendation.impact.base_metrics.conversions":
    "`recommendation.impact.base_metrics.conversions` is not a GAQL field. Call `getResourceMetadata('recommendation')` to confirm the available `recommendation.impact.*` fields before retrying.",
  "recommendation.keyword_match_type":
    "`recommendation.keyword_match_type` is not a GAQL field. Call `getResourceMetadata('recommendation')` to confirm the correct keyword-recommendation field path before retrying — the match-type field lives on a nested `keyword_recommendation` sub-message, not at the top level.",
  "billing_setup.payments_account_info.payments_account_id":
    "`billing_setup.payments_account_info.*` fields are not portable in this Ads API surface. Use `ads.queries.billingSetups` for a safe billing setup overview, or call `getResourceMetadata('billing_setup')` before querying account-specific billing fields.",
  "billing_setup.payments_account_info.payments_account_name":
    "`billing_setup.payments_account_info.*` fields are not portable in this Ads API surface. Use `ads.queries.billingSetups` for a safe billing setup overview, or call `getResourceMetadata('billing_setup')` before querying account-specific billing fields.",
  "billing_setup.payments_account_info.payments_profile_id":
    "`billing_setup.payments_account_info.*` fields are not portable in this Ads API surface. Use `ads.queries.billingSetups` for a safe billing setup overview, or call `getResourceMetadata('billing_setup')` before querying account-specific billing fields.",
  "billing_setup.payments_account_info.payments_profile_name":
    "`billing_setup.payments_account_info.*` fields are not portable in this Ads API surface. Use `ads.queries.billingSetups` for a safe billing setup overview, or call `getResourceMetadata('billing_setup')` before querying account-specific billing fields.",
  "billing_setup.payments_account_info.secondary_payments_profile_id":
    "`billing_setup.payments_account_info.*` fields are not portable in this Ads API surface. Use `ads.queries.billingSetups` for a safe billing setup overview, or call `getResourceMetadata('billing_setup')` before querying account-specific billing fields.",
  "auction_insight.domain":
    "`auction_insight.domain` is not a GAQL field. Auction insights ship as metrics + segments off resources like `campaign` / `ad_group`, not as an `auction_insight` resource. Required developer-token access is gated separately; if your account is enrolled, the right fields are `metrics.auction_insight_*` + `segments.auction_insight_domain` queried `FROM campaign`.",
  "auction_insight_domain.domain":
    "`auction_insight_domain.domain` is not a GAQL field. Auction insights ship as metrics + segments off resources like `campaign` / `ad_group`, not as an `auction_insight_domain` resource. Required developer-token access is gated separately; if your account is enrolled, use supported `metrics.auction_insight_*` fields with `segments.auction_insight_domain`.",
  "auction_insight.display":
    "`auction_insight.display` is not a GAQL field. Auction insights are not exposed through an `auction_insight` resource; call `getResourceMetadata('campaign')` and look for supported `metrics.auction_insight_*` / `segments.auction_insight_domain` fields.",
  "resource_name":
    "`resource_name` is not a top-level GAQL field. Each resource has its own form: `campaign.resource_name`, `ad_group.resource_name`, etc. Replace `resource_name` with `<resource>.resource_name` matching your FROM clause.",
};

export function validateKnownUnsupportedGaqlFields(query: string) {
  const fields = extractSelectFields(query)
    .map((field) => field.toLowerCase())
    .filter((field) => field in KNOWN_UNSUPPORTED_GAQL_FIELDS);
  if (fields.length === 0) return;

  throw new Error(
    "GAQL pre-flight: unsupported field(s) in SELECT. " +
      fields.map((field) => KNOWN_UNSUPPORTED_GAQL_FIELDS[field]).join(" "),
  );
}

/**
 * GAQL is SQL-like, but it is not SQL. Agents routinely add JOINs after seeing
 * related-resource fields in successful rows. Google rejects with a syntax
 * error; catch that locally and explain GAQL's implicit relationship selection.
 */
export function validateUnsupportedSqlSyntax(query: string) {
  const stripped = stripQuotedGaqlLiterals(query);
  if (!/\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\b/i.test(stripped)) return;
  throw new Error(
    "GAQL pre-flight: GAQL does not support SQL JOIN syntax. " +
      "Select compatible related-resource fields directly from one FROM resource instead, e.g. " +
      "`SELECT campaign.id, campaign_budget.amount_micros FROM campaign`. " +
      "If you need an unsupported relationship, run two ads.gaql queries and join the rows in JavaScript.",
  );
}

/**
 * Narrow validator for observed segment/resource incompatibility patterns.
 * Google returns query_error=51 ("incompatible segments") for these; we can
 * catch them locally and give a precise fix before the round-trip.
 */
export function validateSegmentResourceCompatibility(query: string) {
  const resource = extractFromResource(query);
  if (!resource) return;
  const selectFields = extractSelectFields(query).map((f) => f.toLowerCase());

  // (a) segments.hour on views that don't support hour-of-day breakdowns
  const HOUR_INCOMPATIBLE = new Set(["keyword_view", "search_term_view", "user_location_view"]);
  if (HOUR_INCOMPATIBLE.has(resource) && selectFields.includes("segments.hour")) {
    throw new Error(
      `GAQL pre-flight: \`segments.hour\` is not selectable on \`FROM ${resource}\` — Google rejects with query_error=51 (segment incompatible with FROM clause). To get hour-of-day breakdowns: query \`FROM campaign\` (or \`FROM ad_group\`) and SELECT \`segments.hour\` alongside your metrics; the per-keyword / per-search-term breakdown is not available at the hour granularity on those views.`,
    );
  }

  // (b) geo segments not available on location/geographic views. These views
  // expose criterion IDs directly; resolve names in a second geo_target_constant
  // query instead of selecting geo_target_* segments.
  if (resource === "user_location_view" || resource === "geographic_view") {
    const offender = selectFields.find(
      (f) => f === "segments.geo_target_country" || f === "segments.geo_target_state",
    );
    if (offender) {
      const replacement = resource === "user_location_view"
        ? "user_location_view.country_criterion_id"
        : "geographic_view.country_criterion_id";
      throw new Error(
        `GAQL pre-flight: \`segments.geo_target_country\` / \`segments.geo_target_state\` are not selectable on \`FROM ${resource}\` — Google rejects with query_error=51. The geo dimension on ${resource} is \`${replacement}\`; use that and resolve names with a second \`FROM geo_target_constant\` query instead of selecting geo segments.`,
      );
    }
  }

  // (c) Search lost IS metrics are campaign-only in practice. Production
  // agents have tried them from `ad_group` and `keyword_view`; Google rejects
  // after the round-trip with "metric is incompatible with the resource in the
  // FROM clause". Catch the observed bad pair locally and point to the safe
  // workflow: campaign aggregate first, then drill into ad groups/keywords with
  // delivery metrics only.
  const searchLostImpressionShareMetrics = selectFields.filter(
    (f) =>
      f === "metrics.search_budget_lost_impression_share" ||
      f === "metrics.search_rank_lost_impression_share",
  );
  if (
    searchLostImpressionShareMetrics.length > 0 &&
    (resource === "ad_group" || resource === "keyword_view")
  ) {
    throw new Error(
      `GAQL pre-flight: ${searchLostImpressionShareMetrics.map((f) => `\`${f}\``).join(", ")} is not selectable from \`FROM ${resource}\`. Query impression-share loss from \`FROM campaign\` using \`metrics.search_budget_lost_impression_share\` / \`metrics.search_rank_lost_impression_share\`; for ad-group or keyword drilldowns, use compatible delivery metrics such as \`metrics.impressions\`, \`metrics.clicks\`, \`metrics.cost_micros\`, and \`metrics.conversions\`.`,
    );
  }

  // (d) bare conversion_action as a SELECT field when FROM is something else
  if (resource !== "conversion_action" && selectFields.includes("conversion_action")) {
    throw new Error(
      "GAQL pre-flight: bare `conversion_action` is not a selectable SELECT field. To break down metrics per conversion action: query `FROM campaign` (or `FROM ad_group`) and SELECT `segments.conversion_action` (the resource path) or `segments.conversion_action_name`. To list configured conversion actions: query `FROM conversion_action` and SELECT the `conversion_action.*` fields you want.",
    );
  }
}

/**
 * Status / type enums on the major Google Ads resources accept STRING names,
 * not numeric codes. LLMs sometimes paste numeric values from the Ads API
 * proto definitions; Google rejects with query_error=18, but we can catch the
 * mistake before the round-trip and tell the agent the valid names directly.
 *
 * Field-by-field map of accepted values. Lower-cased on read so detection is
 * case-insensitive. Quote pairs in the regex are deliberately permissive
 * (single, double, or unquoted numeric literal — agents have shipped all
 * three).
 */
const ENUM_FIELD_VALUES: Record<string, readonly string[]> = {
  "campaign.status": ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"],
  "ad_group.status": ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"],
  "ad_group_ad.status": ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"],
  "ad_group_criterion.status": ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"],
  "conversion_action.status": ["ENABLED", "REMOVED", "HIDDEN", "UNKNOWN", "UNSPECIFIED"],
  "asset_group.status": ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"],
  "customer_manager_link.status": ["ACTIVE", "INACTIVE", "PENDING", "REFUSED", "CANCELED", "UNKNOWN", "UNSPECIFIED"],
};

export function validateEnumLiteralsInWhere(query: string) {
  const whereMatch = query.match(
    /\sWHERE\s+([\s\S]*?)(?:\sORDER\s+BY\s|\sLIMIT\s|\sPARAMETERS\s|$)/i,
  );
  if (!whereMatch) return;
  const whereClause = whereMatch[1];
  const offenders: { field: string; literal: string; valid: readonly string[]; reason: "numeric" | "invalid" }[] = [];
  for (const [field, valid] of Object.entries(ENUM_FIELD_VALUES)) {
    // Match: campaign.status = '3' | campaign.status = 3 | campaign.status IN (3, 5)
    // Capture the literal so the error names what was passed.
    const numericPattern = new RegExp(
      String.raw`\b${field.replace(/\./g, "\\.")}\s*(?:=|!=|<>|\bIN\b|\bNOT\s+IN\b)\s*\(?\s*['"]?(\d+)['"]?`,
      "gi",
    );
    for (const m of whereClause.matchAll(numericPattern)) {
      offenders.push({ field, literal: m[1], valid, reason: "numeric" });
    }

    const enumPattern = new RegExp(
      String.raw`\b${field.replace(/\./g, "\\.")}\s*(?:=|!=|<>|\bIN\b|\bNOT\s+IN\b)\s*\(?\s*['"]?([A-Z][A-Z0-9_]*)['"]?`,
      "gi",
    );
    for (const m of whereClause.matchAll(enumPattern)) {
      const literal = m[1].toUpperCase();
      if (/^\d+$/.test(literal)) continue;
      if (!valid.includes(literal)) {
        offenders.push({ field, literal, valid, reason: "invalid" });
      }
    }
  }
  if (offenders.length === 0) return;
  const lines = offenders.map(
    (o) =>
      `  - \`${o.field} = ${o.literal}\` → ${o.reason === "numeric" ? "use a string enum name" : "that enum value is not valid for this field"}; valid values: ${o.valid.map((v) => `'${v}'`).join(", ")}`,
  );
  throw new Error(
    "GAQL pre-flight: enum fields in WHERE must use valid Google Ads enum names; numeric codes must be STRING names.\n" +
      lines.join("\n") +
      "\nExample fix: `WHERE campaign.status = 'PAUSED'` (not `= 3`). For manager links, there is no `REMOVED` status; use `customer_manager_link.status != 'INACTIVE'` or omit the status filter. If you need the full enum, call getResourceMetadata with the FROM resource.",
  );
}

/**
 * change_event's `change_date_time` window is capped at the last 30 days.
 * Agents routinely pass `today − 30 days` literally, which lands one day past
 * the boundary because `>=` plus `00:00:00` is older than now-minus-30-days.
 *
 * Auto-clamp the lower bound to today − 29 days when we can parse the date.
 * Cheap rewrite: only touches the literal in the `>=` predicate, leaves the
 * rest of the query alone. Mirror of `rewriteInvalidDateLiterals` — fix the
 * common mistake silently rather than make the agent retry.
 */
export function clampChangeEventDateWindow(query: string, today: Date = new Date()): string {
  const resource = extractFromResource(query);
  if (resource !== "change_event") return query;
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffDate = formatDate(cutoff);

  return query.replace(
    /(\bchange_event\.change_date_time\s*>=\s*['"])(\d{4}-\d{2}-\d{2})([^'"]*)(['"])/gi,
    (match, prefix: string, dateStr: string, timeTail: string, quote: string) => {
      const parsed = new Date(`${dateStr}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return match;
      if (parsed.getTime() >= cutoff.getTime()) return match;
      // Preserve the agent's time-of-day suffix (e.g., " 00:00:00") if present;
      // otherwise default to start-of-day.
      const tail = timeTail && timeTail.trim().length > 0 ? timeTail : " 00:00:00";
      return `${prefix}${cutoffDate}${tail}${quote}`;
    },
  );
}

function buildGaqlReportMeta(args: {
  auth: AuthContext;
  query: string;
  selectFields: string[];
  effectiveLimit: number;
  fetchedRowCount: number;
  returnedRowCount: number;
  truncated: boolean;
  excludeRemovedParents: boolean;
  rows: unknown[];
}): GaqlReportMeta {
  const resource = extractFromResource(args.query);
  const dateRange = extractDateRangeMetadata(args.query);
  const asOf = new Date();
  const reportingLagDays = dateRange?.source === "between" ? reportingLagDaysFromEndDate(dateRange.end, asOf) : null;
  const filters = {
    campaignStatuses: extractEnumFilterMetadata(args.query, "campaign.status"),
    adGroupStatuses: extractEnumFilterMetadata(args.query, "ad_group.status"),
    campaignTypes: extractEnumFilterMetadata(args.query, "campaign.advertising_channel_type"),
  };
  const warnings: string[] = [];
  if (args.truncated) warnings.push("Result set was truncated; use continuationHint or narrower filters before making exhaustive claims.");
  if (resource === "search_term_view") warnings.push("Search term data can be limited by Google Ads privacy thresholds.");
  if (resource === "change_event") warnings.push("change_event only exposes the last 30 days of Google-side changes.");
  if (!dateRange && /\bmetrics\./i.test(args.query)) warnings.push("Metrics query has no explicit date range; confirm this is intentional.");
  if (reportingLagDays !== null && reportingLagDays > 0) warnings.push(`Metrics end date is ${reportingLagDays} day${reportingLagDays === 1 ? "" : "s"} before asOf; call this out when interpreting recent performance.`);

  return {
    asOf: asOf.toISOString(),
    customerId: args.auth.customerId,
    loginCustomerId: args.auth.loginCustomerId ?? null,
    resource,
    dateRange,
    currencyCode: inferNestedString(args.rows, ["customer", "currency_code"]),
    timeZone: inferNestedString(args.rows, ["customer", "time_zone"]),
    selectedFieldCount: args.selectFields.length,
    requestedLimit: args.effectiveLimit,
    effectiveLimit: args.effectiveLimit,
    fetchedRowCount: args.fetchedRowCount,
    returnedRowCount: args.returnedRowCount,
    truncated: args.truncated,
    excludeRemovedParents: args.excludeRemovedParents,
    reportingLagDays,
    filters,
    dataCompleteness: {
      rows: args.truncated ? "truncated" : "complete",
      ...(resource === "search_term_view" ? { searchTerms: "privacy_threshold_limited" as const } : {}),
      ...(resource === "change_event" ? { changeEvents: "last_30_days_only" as const } : {}),
      removedParents: args.excludeRemovedParents ? "excluded" : "included",
      reportingLag: reportingLagDays == null ? "unknown" : reportingLagDays <= 0 ? "same_day_or_realtime" : "lagged",
    },
    warnings,
  };
}

function extractDateRangeMetadata(query: string): GaqlReportMeta["dateRange"] {
  const between = query.match(/\bsegments\.date\s+BETWEEN\s+['"](\d{4}-\d{2}-\d{2})['"]\s+AND\s+['"](\d{4}-\d{2}-\d{2})['"]/i);
  if (between) return { start: between[1], end: between[2], source: "between", days: daysBetweenIsoDates(between[1], between[2]) };

  const changeEvent = query.match(/\bchange_event\.change_date_time\s*>=\s*['"](\d{4}-\d{2}-\d{2})[^'"]*['"][\s\S]*?\bchange_event\.change_date_time\s*<=\s*['"](\d{4}-\d{2}-\d{2})/i);
  if (changeEvent) return { start: changeEvent[1], end: changeEvent[2], source: "between", days: daysBetweenIsoDates(changeEvent[1], changeEvent[2]) };

  const during = query.match(/\bsegments\.date\s+DURING\s+([A-Z0-9_]+)/i);
  if (during) return { start: during[1], end: during[1], source: "during" };
  return null;
}

function extractEnumFilterMetadata(
  query: string,
  field: string,
): { included: string[]; excluded: string[] } {
  const whereMatch = query.match(/\sWHERE\s+([\s\S]*?)(?:\sORDER\s+BY\s|\sLIMIT\s|\sPARAMETERS\s|$)/i);
  const whereClause = whereMatch?.[1] ?? "";
  const escaped = field.replace(/\./g, "\\.");
  const included = new Set<string>();
  const excluded = new Set<string>();

  const comparison = new RegExp(String.raw`\b${escaped}\s*(=|!=|<>)\s*['"]?([A-Z_]+)['"]?`, "gi");
  for (const match of whereClause.matchAll(comparison)) {
    const target = match[1] === "=" ? included : excluded;
    target.add(match[2].toUpperCase());
  }

  const listComparison = new RegExp(String.raw`\b${escaped}\s*(NOT\s+IN|IN)\s*\(([^)]*)\)`, "gi");
  for (const match of whereClause.matchAll(listComparison)) {
    const target = /NOT\s+IN/i.test(match[1]) ? excluded : included;
    const values = match[2].match(/[A-Z_]+/gi) ?? [];
    for (const value of values) target.add(value.toUpperCase());
  }

  return { included: [...included], excluded: [...excluded] };
}

function reportingLagDaysFromEndDate(end: string, asOf: Date): number | null {
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(endDate.getTime())) return null;
  const asOfDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  return Math.max(0, Math.round((asOfDate.getTime() - endDate.getTime()) / 86_400_000));
}

function inferNestedString(rows: unknown[], path: string[]): string | null {
  for (const row of rows) {
    let cursor: unknown = row;
    for (const key of path) {
      if (typeof cursor !== "object" || cursor === null || !(key in cursor)) {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (typeof cursor === "string" && cursor.length > 0) return cursor;
  }
  return null;
}

function daysBetweenIsoDates(start: string, end: string): number | undefined {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
}

export async function runSafeGaqlReport(
  auth: AuthContext,
  rawQuery: string,
  limit: number = DEFAULT_GAQL_LIMIT,
  options: RunSafeGaqlOptions = {},
): Promise<GaqlReport> {
  let query = rewritePresetDateEquality(rawQuery.trim());
  query = rewriteInvalidDateLiterals(query);
  query = rewriteVirtualNameFields(query);
  query = rewriteChangeEventDateFilters(query);
  query = clampChangeEventDateWindow(query);
  let normalized = query.toUpperCase();

  // Accept any whitespace after SELECT (newlines, tabs, spaces) — multi-line
  // template-literal queries are the natural way agents format wide reports.
  if (!/^SELECT\s/i.test(query)) {
    throw new Error(
      "Only read-only SELECT GAQL queries are allowed in ads.gaql() / ads.gaqlParallel(). " +
      "runScript is a read-only analytics sandbox — to mutate (pause keywords, update bids, create campaigns), " +
      "call the dedicated mutation tools (pauseKeyword, updateBid, bulkPauseKeywords, pauseCampaign, createCampaign, etc.) " +
      "directly, outside the script.",
    );
  }
  if (query.includes(";")) {
    throw new Error("Semicolons are not allowed in GAQL queries.");
  }

  const forbidden = [" INSERT ", " UPDATE ", " DELETE ", " CREATE ", " ALTER ", " DROP ", " TRUNCATE "];
  if (forbidden.some((term) => ` ${normalized} `.includes(term))) {
    throw new Error("The query contains forbidden keywords.");
  }

  query = promotePredicateFieldsToSelect(query);
  validateMalformedDateRanges(query);
  validateChangeEventFilter(query);
  validateMetricsOnConversionAction(query);
  validateConversionActionMetricSegments(query);
  validateRequiredDateFilter(query);
  validateKnownUnsupportedGaqlFields(query);
  validateUnsupportedSqlSyntax(query);
  validateSegmentResourceCompatibility(query);
  validateEnumLiteralsInWhere(query);

  if (options.excludeRemovedParents ?? DEFAULT_EXCLUDE_REMOVED_PARENTS) {
    query = applyRemovedParentFilters(query);
    normalized = query.toUpperCase();
  }

  // Resolve effective limit: an explicit GAQL `LIMIT N` wins over the param
  // (users who wrote it meant it), but both are capped at MAX_GAQL_LIMIT.
  const paramLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_GAQL_LIMIT);
  const gaqlLimit = extractGaqlLimit(query);
  const effectiveLimit = gaqlLimit != null
    ? Math.min(gaqlLimit, MAX_GAQL_LIMIT)
    : paramLimit;

  // Fetch one extra row so we can honestly detect `hasMore` without a second
  // round trip. Even when the user wrote an explicit `LIMIT N`, we probe with
  // N+1 — they still get N rows back, plus an honest `truncated` signal telling
  // them more exist. Bounded at MAX_GAQL_LIMIT + 1 regardless.
  const probeLimit = Math.min(effectiveLimit + 1, MAX_GAQL_LIMIT + 1);
  const queryToRun = rewriteGaqlLimit(query, probeLimit);

  let fetched: unknown[];
  try {
    const customer = getCachedCustomer(auth) as { query: (query: string) => Promise<unknown[]> };
    fetched = await customer.query(queryToRun);
  } catch (error) {
    throw new Error(`GAQL query failed: ${enrichGaqlError(extractErrorMessage(error))}`);
  }

  const rowTruncated = fetched.length > effectiveLimit;
  let rows: unknown[] = rowTruncated ? fetched.slice(0, effectiveLimit) : fetched;
  const selectFields = extractSelectFields(query);

  // Summary is stable across byte-budget iterations (computed over `fetched`,
  // which doesn't change). Lazy-cache so it's built at most once, regardless
  // of which truncation source fires.
  let cachedSummary: GaqlSummary | null | undefined;
  const getSummary = () => {
    if (cachedSummary === undefined) {
      cachedSummary = buildGaqlSummary(fetched, selectFields, query);
    }
    return cachedSummary;
  };

  const buildResponse = (rowsOut: unknown[], byteTruncated: boolean): GaqlReport => {
    const truncated = rowTruncated || byteTruncated;
    const reason: GaqlReport["truncationReason"] = byteTruncated
      ? "byte_budget"
      : rowTruncated
      ? "row_limit"
      : null;
    const summary = truncated ? getSummary() : null;
    const hint = truncated
      ? buildContinuationHint(query, rowsOut.length, effectiveLimit, {
          rowTruncated,
          byteTruncated,
        })
      : null;
    return {
      rowCount: rowsOut.length,
      requestedLimit: effectiveLimit,
      fetchedRowCount: fetched.length,
      truncated,
      truncationReason: reason,
      meta: buildGaqlReportMeta({
        auth,
        query,
        selectFields,
        effectiveLimit,
        fetchedRowCount: fetched.length,
        returnedRowCount: rowsOut.length,
        truncated,
        excludeRemovedParents: options.excludeRemovedParents ?? DEFAULT_EXCLUDE_REMOVED_PARENTS,
        rows: fetched,
      }),
      ...(summary ? { summary } : {}),
      ...(hint ? { continuationHint: hint } : {}),
      rows: rowsOut,
    };
  };

  let response = buildResponse(rows, false);
  let size = Buffer.byteLength(JSON.stringify(response));

  // Shrink rows geometrically until the response fits the byte budget. Summary
  // remains intact so callers keep decision-grade aggregates even when the raw
  // row set had to be trimmed.
  while (size > GAQL_BYTE_BUDGET && rows.length > 1) {
    rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)));
    response = buildResponse(rows, true);
    size = Buffer.byteLength(JSON.stringify(response));
  }

  return response;
}

function addFieldsToSelect(query: string, fieldsToAdd: string[]): string {
  if (fieldsToAdd.length === 0) return query;
  const selectMatch = query.match(/^(\s*SELECT\s+)([\s\S]+?)(\s+FROM\s+)/i);
  if (!selectMatch) return query;

  const selected = new Set(
    selectMatch[2]
      .split(",")
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean),
  );
  const missing = fieldsToAdd.filter((field) => !selected.has(field.toLowerCase()));
  if (missing.length === 0) return query;

  const [full, prefix, fields, suffix] = selectMatch;
  const merged = `${fields.trimEnd().replace(/,\s*$/, "")}, ${missing.join(", ")}`;
  return query.replace(full, `${prefix}${merged}${suffix}`);
}

/**
 * Google Ads requires fields used in WHERE/HAVING/ORDER BY to also be present
 * in SELECT (query_error=16). That is a GAQL footgun, not a useful caller
 * contract, so promote safe fields automatically instead of forcing agents to
 * retry.
 *
 * Date/time period segments are intentionally exempt: Google allows them as
 * filters without selecting them, and selecting them would change metric
 * granularity by splitting rows by date/week/month.
 */
export function promotePredicateFieldsToSelect(query: string): string {
  const selectMatch = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i);
  if (!selectMatch) return query;

  const selected = new Set(
    selectMatch[1]
      .split(",")
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean),
  );
  const missing = new Set<string>();
  const fieldRegex = /\b[a-z][a-z_]*(?:\.[a-z_][a-z0-9_]*)+\b/gi;

  const predicateClauses = [
    query.match(/\sWHERE\s+([\s\S]*?)(?:\sHAVING\s|\sORDER\s+BY\s|\sLIMIT\s|\sPARAMETERS\s|$)/i)?.[1],
    query.match(/\sHAVING\s+([\s\S]*?)(?:\sORDER\s+BY\s|\sLIMIT\s|\sPARAMETERS\s|$)/i)?.[1],
    query.match(/\sORDER\s+BY\s+([\s\S]*?)(?:\sLIMIT\s|\sPARAMETERS\s|$)/i)?.[1],
  ].filter((clause): clause is string => typeof clause === "string");

  for (const clause of predicateClauses) {
    for (const match of stripQuotedGaqlLiterals(clause).matchAll(fieldRegex)) {
      const field = match[0].toLowerCase();
      if (field.startsWith("metrics.")) continue;
      if (SEGMENT_WHERE_SELECT_EXEMPTIONS.has(field)) continue;
      if (rawFieldForVirtualSibling(field)) continue;
      if (!selected.has(field)) missing.add(field);
    }
  }

  return addFieldsToSelect(query, [...missing].sort());
}

// Keep old export name for tests/imports outside this module.
export const promoteSegmentsInFiltersToSelect = promotePredicateFieldsToSelect;

function stripQuotedGaqlLiterals(clause: string): string {
  return clause.replace(/'[^']*'|"[^"]*"/g, "");
}

function applyRemovedParentFilters(query: string): string {
  const resource = extractFromResource(query);
  if (!resource) return query;

  const filters: string[] = [];
  const selectFieldsToAdd: string[] = [];
  if (
    CAMPAIGN_SCOPED_RESOURCES.has(resource) &&
    !/\bcampaign\.status\s*(?:=|!=|\bIN\b|\bNOT\s+IN\b)/i.test(query)
  ) {
    filters.push("campaign.status != 'REMOVED'");
    // Google Ads rejects (query_error=16) when a field used in WHERE isn't in SELECT.
    // Add it ourselves so our auto-injected filter doesn't break user queries.
    if (!/\bcampaign\.status\b/i.test(query)) {
      selectFieldsToAdd.push("campaign.status");
    }
  }
  if (
    AD_GROUP_SCOPED_RESOURCES.has(resource) &&
    !/\bad_group\.status\s*(?:=|!=|\bIN\b|\bNOT\s+IN\b)/i.test(query)
  ) {
    filters.push("ad_group.status != 'REMOVED'");
    if (!/\bad_group\.status\b/i.test(query)) {
      selectFieldsToAdd.push("ad_group.status");
    }
  }
  if (filters.length === 0) return query;

  let result = query;
  if (selectFieldsToAdd.length > 0) {
    result = addFieldsToSelect(result, selectFieldsToAdd);
  }

  const insertionPoint = findTrailingClauseIndex(result);
  const head = result.slice(0, insertionPoint).trimEnd();
  const tail = result.slice(insertionPoint);
  const connector = /\sWHERE\s/i.test(head) ? " AND " : " WHERE ";
  return `${head}${connector}${filters.join(" AND ")}${tail}`;
}

function extractFromResource(query: string): string | null {
  return query.match(/\sFROM\s+([a-z_]+)/i)?.[1]?.toLowerCase() ?? null;
}

function findTrailingClauseIndex(query: string): number {
  const matches = [...query.matchAll(/\s(?:ORDER\s+BY|LIMIT|PARAMETERS)\s/gi)];
  return matches.length > 0 ? matches[0].index ?? query.length : query.length;
}

// ─── Resource Metadata (Field Discovery) ────────────────────────────

type GoogleAdsField = {
  name?: string;
  dataType?: unknown;
  data_type?: unknown;
  selectable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  isRepeated?: boolean;
  is_repeated?: boolean;
};

type GoogleAdsFieldService = {
  searchGoogleAdsFields: (req: { query: string }) => Promise<[unknown]>;
};

/**
 * Discover selectable, filterable, and sortable fields for a GAQL resource.
 * Uses the GoogleAdsFieldService API — avoids hardcoded field lists.
 */
export async function getResourceMetadata(auth: AuthContext, resourceName: string) {
  const customer = getCustomer(auth) as unknown as { googleAdsFields: GoogleAdsFieldService };
  const fieldService = customer.googleAdsFields;
  const query = `SELECT name, selectable, filterable, sortable, data_type, is_repeated WHERE name LIKE '${resourceName}.%'`;

  try {
    // gRPC auto-pagination: response is the results array directly, not { results: [...] }
    const [results] = await fieldService.searchGoogleAdsFields({ query });
    const resultArray = Array.isArray(results) ? (results as GoogleAdsField[]) : [];
    const fields = resultArray.map((f) => ({
      name: f.name,
      dataType: f.dataType ?? f.data_type,
      selectable: f.selectable ?? false,
      filterable: f.filterable ?? false,
      sortable: f.sortable ?? false,
      isRepeated: f.isRepeated ?? f.is_repeated ?? false,
    }));

    if (fields.length === 0) {
      // Fallback: try fetching the resource itself (for top-level resource info)
      const fallbackQuery = `SELECT name, selectable, filterable, sortable, data_type, is_repeated WHERE name = '${resourceName}'`;
      const [fallbackResults] = await fieldService.searchGoogleAdsFields({ query: fallbackQuery });
      const fallbackArray = Array.isArray(fallbackResults) ? fallbackResults : [];
      if (fallbackArray.length === 0) {
        throw new Error(`Resource '${resourceName}' not found. Use listQueryableResources to see available resources.`);
      }
      return {
        resource: resourceName,
        fields: [],
        note: `'${resourceName}' is a field, not a resource. Query its parent resource for fields.`,
      };
    }

    return {
      resource: resourceName,
      fieldCount: fields.length,
      fields,
    };
  } catch (error) {
    throw new Error(`Failed to get metadata for '${resourceName}': ${extractErrorMessage(error)}`);
  }
}

/**
 * List all queryable GAQL resources (e.g. campaign, ad_group, keyword_view).
 */
export async function listQueryableResources(auth: AuthContext) {
  const customer = getCustomer(auth) as unknown as { googleAdsFields: GoogleAdsFieldService };
  const fieldService = customer.googleAdsFields;
  const query = `SELECT name WHERE category = 'RESOURCE'`;

  try {
    // gRPC auto-pagination: response is the results array directly, not { results: [...] }
    const [results] = await fieldService.searchGoogleAdsFields({ query });
    const resultArray = Array.isArray(results) ? (results as GoogleAdsField[]) : [];
    const resources = resultArray
      .map((f) => f.name)
      .filter((name): name is string => typeof name === "string" && !name.includes("."))
      .sort();
    return { count: resources.length, resources };
  } catch (error) {
    throw new Error(`Failed to list resources: ${extractErrorMessage(error)}`);
  }
}

// ─── Geo Target Search ─────────────────────────────────────────────

/**
 * Search for geo target constants by name (cities, counties, states, countries, etc.).
 * Uses the GeoTargetConstantService.SuggestGeoTargetConstants API for fuzzy matching.
 * Returns geo target constant IDs that can be used with updateCampaignSettings location targeting.
 */
const MAX_GEO_RESULTS = 10;

type GeoTargetConstant = {
  resource_name?: string;
  resourceName?: string;
  name?: string;
  canonical_name?: string;
  canonicalName?: string;
  target_type?: string;
  targetType?: string;
  country_code?: string;
  countryCode?: string;
};

type GeoTargetSuggestion = {
  geo_target_constant?: GeoTargetConstant;
  geoTargetConstant?: GeoTargetConstant;
  reach?: unknown;
  search_term?: string;
  searchTerm?: string;
};

export async function searchGeoTargets(
  auth: AuthContext,
  query: string,
  countryCode?: string,
  locale?: string,
) {
  const customer = getCustomer(auth) as unknown as {
    geoTargetConstants: {
      suggestGeoTargetConstants: (req: {
        locale?: string;
        country_code?: string;
        location_names?: { names: string[] };
      }) => Promise<unknown>;
    };
  };
  const geoService = customer.geoTargetConstants;

  try {
    const normalizedCountryCode = countryCode?.trim().toUpperCase();
    const response = await geoService.suggestGeoTargetConstants({
      locale: locale?.trim() || "en",
      ...(normalizedCountryCode && { country_code: normalizedCountryCode }),
      location_names: { names: [query.trim()] },
    });

    // Response structure: { geo_target_constant_suggestions: [...] } or array
    const suggestions: GeoTargetSuggestion[] = Array.isArray(response)
      ? (response as GeoTargetSuggestion[])
      : isRecord(response)
        ? ((response.geo_target_constant_suggestions ?? response.geoTargetConstantSuggestions ?? []) as GeoTargetSuggestion[])
        : [];

    return {
      query,
      results: suggestions.slice(0, MAX_GEO_RESULTS).map((s) => {
        const gtc = s.geo_target_constant ?? s.geoTargetConstant ?? {};
        const resourceName = gtc.resource_name ?? gtc.resourceName ?? "";
        const id = resourceName.split("/").pop() ?? "";
        return {
          id,
          resourceName,
          name: gtc.name ?? null,
          canonicalName: gtc.canonical_name ?? gtc.canonicalName ?? null,
          targetType: gtc.target_type ?? gtc.targetType ?? null,
          countryCode: gtc.country_code ?? gtc.countryCode ?? null,
          reach: s.reach != null ? Number(s.reach) : null,
          searchTerm: s.search_term ?? s.searchTerm ?? null,
        };
      }).filter((r) => r.id !== ""),
    };
  } catch (error) {
    throw new Error(`Geo target search failed for "${query}": ${extractErrorMessage(error)}`);
  }
}
