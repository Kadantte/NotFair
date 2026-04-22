/**
 * Chart-ready timeseries for Google Ads metrics.
 *
 * Returns data in a shape that drops directly into Recharts / Chart.js /
 * visx without reshape code on the artifact side: one segment per
 * grouped entity, each with an array of `{ date, metric, metric, ... }`
 * points. Derived metrics (CPA / CTR / conversion rate / ROAS) are
 * computed per-bucket, not aggregated across groups. Zero-denominator
 * cases return `null`, never `0` or `NaN`.
 */

import { getCachedCustomer } from "./client";
import { extractErrorMessage, micros } from "./helpers";
import type { AuthContext } from "./types";

export const TIMESERIES_METRICS = [
  "spend",
  "clicks",
  "impressions",
  "conversions",
  "conversion_value",
  "cpa",
  "ctr",
  "conversion_rate",
  "roas",
] as const;
export type Metric = (typeof TIMESERIES_METRICS)[number];

export const GRANULARITIES = ["day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const GROUP_BYS = ["account", "campaign", "device", "network"] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export interface TimeseriesPoint {
  /** ISO date for `day`, ISO week-start (Monday) for `week`, `YYYY-MM` for `month`. */
  date: string;
  [metric: string]: number | string | null;
}

export interface TimeseriesSegment {
  /** Identifier(s) for this segment (e.g. `{ campaign_id, campaign_name }`). */
  dimensions: Record<string, string>;
  points: TimeseriesPoint[];
}

export interface TimeseriesMeta {
  currency: string;
  timezone: string;
  granularity: Granularity;
  startDate: string;
  endDate: string;
  metrics: Metric[];
  groupBy: GroupBy;
}

export interface TimeseriesComparison {
  /** Human-readable label — "Previous 30 days" etc. */
  periodLabel: string;
  startDate: string;
  endDate: string;
  series: TimeseriesSegment[];
}

export interface TimeseriesResponse {
  meta: TimeseriesMeta;
  series: TimeseriesSegment[];
  comparison?: TimeseriesComparison;
  errors?: string[];
}

export interface TimeseriesInput {
  startDate: string;
  endDate: string;
  granularity?: Granularity;
  metrics?: Metric[];
  groupBy?: GroupBy;
  comparePreviousPeriod?: boolean;
  campaignIds?: string[];
}

// ─── Internal helpers ───────────────────────────────────────────────

/** ISO-8601 date parsing without time-zone drift. Treats the input as UTC. */
function parseISO(date: string): Date {
  // `YYYY-MM-DD` parses as midnight UTC — fine for bucket-comparison math.
  const d = new Date(`${date}T00:00:00Z`);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`);
  return d;
}

function formatISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates, inclusive on both ends. */
function inclusiveDays(start: string, end: string): number {
  const s = parseISO(start).getTime();
  const e = parseISO(end).getTime();
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Monday-aligned ISO week start for a given date. */
function isoWeekStart(date: string): string {
  const d = parseISO(date);
  const dow = d.getUTCDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return formatISO(d);
}

/** `YYYY-MM` bucket key. */
function monthBucket(date: string): string {
  return date.slice(0, 7);
}

function bucketKey(date: string, granularity: Granularity): string {
  if (granularity === "week") return isoWeekStart(date);
  if (granularity === "month") return monthBucket(date);
  return date;
}

/** Compute the previous period of the same length ending the day before `startDate`. */
function previousPeriod(startDate: string, endDate: string): { start: string; end: string } {
  const days = inclusiveDays(startDate, endDate);
  const priorEnd = parseISO(startDate);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - (days - 1));
  return { start: formatISO(priorStart), end: formatISO(priorEnd) };
}

/** Device enum decode — mirrors the audit module. */
const DEVICE_NAME: Record<number, string> = {
  2: "MOBILE",
  3: "TABLET",
  4: "DESKTOP",
  6: "CONNECTED_TV",
};

/** ad_network_type enum decode. */
const NETWORK_NAME: Record<number, string> = {
  2: "SEARCH",
  3: "SEARCH_PARTNERS",
  6: "YOUTUBE",
  10: "DISPLAY",
};

// ─── Query builders ─────────────────────────────────────────────────

/** Safe numeric ID filter — rejects anything that isn't a run of digits. */
function safeCampaignIds(ids: string[]): string {
  const clean = ids.filter((id) => /^\d+$/.test(id));
  return clean.length > 0 ? clean.join(", ") : "0";
}

/**
 * Emit the GAQL for the requested groupBy. `campaignIds` narrows via an
 * `IN (…)` filter when provided. Only digit-run IDs are accepted to
 * prevent GAQL injection through the campaign id list.
 */
export function queryTimeseries(
  start: string,
  end: string,
  groupBy: GroupBy,
  campaignIds?: string[],
): string {
  const campaignFilter =
    campaignIds && campaignIds.length > 0
      ? `AND campaign.id IN (${safeCampaignIds(campaignIds)})`
      : "";
  const dateFilter = `segments.date BETWEEN '${start}' AND '${end}'`;

  const baseMetrics =
    "metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value";

  if (groupBy === "account") {
    return `
      SELECT customer.id, segments.date, ${baseMetrics}
      FROM customer
      WHERE ${dateFilter}
    `;
  }
  if (groupBy === "campaign") {
    return `
      SELECT
        campaign.id, campaign.name, segments.date, ${baseMetrics}
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND ${dateFilter}
        ${campaignFilter}
      ORDER BY metrics.cost_micros DESC
    `;
  }
  if (groupBy === "device") {
    return `
      SELECT
        campaign.id, campaign.name, segments.date, segments.device, ${baseMetrics}
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND ${dateFilter}
        ${campaignFilter}
    `;
  }
  // network
  return `
      SELECT
        campaign.id, campaign.name, segments.date, segments.ad_network_type, ${baseMetrics}
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND ${dateFilter}
        ${campaignFilter}
    `;
}

// ─── Row projection + bucketing ─────────────────────────────────────

interface RawPoint {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversion_value: number;
}

interface Row {
  segmentKey: string;
  dimensions: Record<string, string>;
  date: string;
  raw: RawPoint;
}

function projectRow(row: unknown, groupBy: GroupBy): Row | null {
  const r = row as {
    customer?: { id?: unknown };
    campaign?: { id?: unknown; name?: string };
    segments?: { date?: string; device?: number; ad_network_type?: number };
    metrics?: {
      cost_micros?: number;
      clicks?: number;
      impressions?: number;
      conversions?: number;
      conversions_value?: number;
    };
  };
  const date = r.segments?.date;
  if (!date) return null;

  const raw: RawPoint = {
    spend: micros(r.metrics?.cost_micros),
    clicks: r.metrics?.clicks ?? 0,
    impressions: r.metrics?.impressions ?? 0,
    conversions: r.metrics?.conversions ?? 0,
    conversion_value: r.metrics?.conversions_value ?? 0,
  };

  if (groupBy === "account") {
    const id = r.customer?.id != null ? String(r.customer.id) : "account";
    return { segmentKey: id, dimensions: { account_id: id }, date, raw };
  }
  if (groupBy === "campaign") {
    const id = r.campaign?.id != null ? String(r.campaign.id) : "unknown";
    return {
      segmentKey: id,
      dimensions: { campaign_id: id, campaign_name: r.campaign?.name ?? "Untitled" },
      date,
      raw,
    };
  }
  if (groupBy === "device") {
    const campId = r.campaign?.id != null ? String(r.campaign.id) : "unknown";
    const device = DEVICE_NAME[r.segments?.device as number] ?? "OTHER";
    return {
      segmentKey: `${campId}::${device}`,
      dimensions: {
        campaign_id: campId,
        campaign_name: r.campaign?.name ?? "Untitled",
        device,
      },
      date,
      raw,
    };
  }
  // network
  const campId = r.campaign?.id != null ? String(r.campaign.id) : "unknown";
  const network = NETWORK_NAME[r.segments?.ad_network_type as number] ?? "OTHER";
  return {
    segmentKey: `${campId}::${network}`,
    dimensions: {
      campaign_id: campId,
      campaign_name: r.campaign?.name ?? "Untitled",
      network,
    },
    date,
    raw,
  };
}

function addRaw(a: RawPoint, b: RawPoint): RawPoint {
  return {
    spend: a.spend + b.spend,
    clicks: a.clicks + b.clicks,
    impressions: a.impressions + b.impressions,
    conversions: a.conversions + b.conversions,
    conversion_value: a.conversion_value + b.conversion_value,
  };
}

function emptyRaw(): RawPoint {
  return { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 };
}

/** Build a TimeseriesPoint from a bucketed RawPoint, keeping only the requested metrics. */
function buildPoint(date: string, raw: RawPoint, metrics: Metric[]): TimeseriesPoint {
  const point: TimeseriesPoint = { date };
  for (const m of metrics) {
    if (m === "spend") point.spend = raw.spend;
    else if (m === "clicks") point.clicks = raw.clicks;
    else if (m === "impressions") point.impressions = raw.impressions;
    else if (m === "conversions") point.conversions = raw.conversions;
    else if (m === "conversion_value") point.conversion_value = raw.conversion_value;
    else if (m === "cpa") point.cpa = raw.conversions > 0 ? raw.spend / raw.conversions : null;
    else if (m === "ctr")
      point.ctr = raw.impressions > 0 ? raw.clicks / raw.impressions : null;
    else if (m === "conversion_rate")
      point.conversion_rate = raw.clicks > 0 ? raw.conversions / raw.clicks : null;
    else if (m === "roas")
      point.roas = raw.spend > 0 && raw.conversion_value > 0 ? raw.conversion_value / raw.spend : null;
  }
  return point;
}

/** Bucket rows by (segmentKey, granularity), then project metrics per point. */
export function bucketRows(
  rows: Row[],
  granularity: Granularity,
  metrics: Metric[],
): TimeseriesSegment[] {
  // segmentKey -> bucketKey -> RawPoint
  const bySegment = new Map<string, Map<string, RawPoint>>();
  const dimensionsBySegment = new Map<string, Record<string, string>>();

  for (const r of rows) {
    const bkt = bucketKey(r.date, granularity);
    if (!bySegment.has(r.segmentKey)) {
      bySegment.set(r.segmentKey, new Map());
      dimensionsBySegment.set(r.segmentKey, r.dimensions);
    }
    const buckets = bySegment.get(r.segmentKey)!;
    buckets.set(bkt, addRaw(buckets.get(bkt) ?? emptyRaw(), r.raw));
  }

  const segments: TimeseriesSegment[] = [];
  for (const [segKey, buckets] of Array.from(bySegment.entries())) {
    const dims = dimensionsBySegment.get(segKey)!;
    const points = Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, raw]) => buildPoint(date, raw, metrics));
    segments.push({ dimensions: dims, points });
  }
  return segments;
}

// ─── Public entry point ─────────────────────────────────────────────

const MAX_RANGE_DAYS = 730;
const DEFAULT_METRICS: Metric[] = ["spend", "clicks", "conversions", "cpa"];

/**
 * Fetch and project a chart-ready timeseries. Fires one GAQL query per
 * requested period (1 for the main window, 2 total when
 * `comparePreviousPeriod` is set).
 */
export async function getTimeseries(
  auth: AuthContext,
  input: TimeseriesInput,
): Promise<TimeseriesResponse> {
  const {
    startDate,
    endDate,
    granularity = "day",
    metrics = DEFAULT_METRICS,
    groupBy = "account",
    comparePreviousPeriod = false,
    campaignIds,
  } = input;

  const rangeDays = inclusiveDays(startDate, endDate);
  if (rangeDays <= 0) throw new Error("endDate must be on or after startDate");
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range exceeds ${MAX_RANGE_DAYS}-day cap (got ${rangeDays})`);
  }

  const customer = getCachedCustomer(auth);
  const errors: string[] = [];

  async function fetchWindow(start: string, end: string): Promise<Row[]> {
    try {
      const rows = (await customer.query(queryTimeseries(start, end, groupBy, campaignIds))) as unknown[];
      const out: Row[] = [];
      for (const row of rows) {
        const projected = projectRow(row, groupBy);
        if (projected) out.push(projected);
      }
      return out;
    } catch (error) {
      errors.push(`${start}–${end}: ${extractErrorMessage(error, { log: false })}`);
      return [];
    }
  }

  // `customer` accounts don't carry currency / timezone on per-row metrics;
  // dashboards usually already know them via `getAccountInfo`. Fetch once
  // here to keep the response self-describing. Any failure falls back to
  // safe defaults — timeseries data itself isn't blocked by metadata gaps.
  let currency = "USD";
  let timezone = "UTC";
  try {
    const accountRows = (await customer.query(
      `SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1`,
    )) as unknown[];
    const a = accountRows?.[0] as { customer?: { currency_code?: string; time_zone?: string } } | undefined;
    if (a?.customer?.currency_code) currency = a.customer.currency_code;
    if (a?.customer?.time_zone) timezone = a.customer.time_zone;
  } catch (error) {
    errors.push(`account_info: ${extractErrorMessage(error, { log: false })}`);
  }

  const mainRows = await fetchWindow(startDate, endDate);
  const series = bucketRows(mainRows, granularity, metrics);

  const response: TimeseriesResponse = {
    meta: { currency, timezone, granularity, startDate, endDate, metrics, groupBy },
    series,
  };

  if (comparePreviousPeriod) {
    const { start, end } = previousPeriod(startDate, endDate);
    const prevRows = await fetchWindow(start, end);
    response.comparison = {
      periodLabel: `Previous ${rangeDays} day${rangeDays === 1 ? "" : "s"}`,
      startDate: start,
      endDate: end,
      series: bucketRows(prevRows, granularity, metrics),
    };
  }

  if (errors.length > 0) response.errors = errors;
  return response;
}
