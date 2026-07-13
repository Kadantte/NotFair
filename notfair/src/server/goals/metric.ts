import { mcpRpcAutoRefresh } from "@/server/mcp/rpc";
import type { Goal } from "@/server/db/goals";

/**
 * Mechanical execution of a goal's stored metric query against a catalog
 * MCP (e.g. notfair-googleads `runScript`). This is the loop's ground
 * truth: the tick runner calls it BEFORE the agent wakes, so the agent
 * never self-reports the number it is being judged on. The same path
 * verifies the metric during intake (`propose_goal_metric`) — a metric
 * that can't be measured here is rejected before the goal can activate.
 */

export type MetricMeasurement =
  | { ok: true; value: number }
  | { ok: false; error: string };

const METRIC_TIMEOUT_MS = 60_000;

/** Shape of an MCP tools/call result envelope. */
type ToolCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

export type MetricSource = {
  /** Catalog MCP key, e.g. "notfair-googleads". */
  key: string;
  /** Tool to call on that server, e.g. "runScript". */
  tool: string;
  /** JSON-encoded arguments object for the tool call. */
  args_json: string;
};

export function metricSourceFromGoal(goal: Goal): MetricSource | null {
  if (!goal.metric_source_key || !goal.metric_source_tool || !goal.metric_source_args_json) {
    return null;
  }
  return {
    key: goal.metric_source_key,
    tool: goal.metric_source_tool,
    args_json: goal.metric_source_args_json,
  };
}

/**
 * Coerce a metric script's return payload into a single number.
 *
 * Convention (taught in the goal agent's identity): the script should
 * return a bare number or `{ value: <number> }`. We tolerate the obvious
 * near-misses (numeric strings, a single-element array, a nested `value`)
 * but refuse anything ambiguous — a metric that needs interpretation is a
 * metric the loop can't trust.
 */
export function parseMetricValue(payload: unknown, depth = 0): number | null {
  if (depth > 3) return null;
  if (typeof payload === "number" && Number.isFinite(payload)) return payload;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(payload)) {
    return payload.length === 1 ? parseMetricValue(payload[0], depth + 1) : null;
  }
  if (payload && typeof payload === "object") {
    // Tolerated wrappers: {value}, and the runScript sandboxes' response
    // envelope {ok, result} (both Google Ads and X Ads wrap script
    // returns this way).
    if ("value" in payload) {
      return parseMetricValue((payload as { value: unknown }).value, depth + 1);
    }
    if ("result" in payload) {
      return parseMetricValue((payload as { result: unknown }).result, depth + 1);
    }
  }
  return null;
}

/**
 * Execute a metric source against its catalog MCP and return the number.
 * Token lookup, refresh, and SSE/JSON response parsing are handled by
 * `mcpRpcAutoRefresh` (the same plumbing onboarding uses for account
 * listing). Every failure mode maps to a human-readable error string that
 * the tick diary / goal page can surface verbatim.
 */
export async function runMetricSource(
  project_slug: string,
  source: MetricSource,
): Promise<MetricMeasurement> {
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(source.args_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "metric_source_args_json must encode a JSON object" };
    }
    args = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: "metric_source_args_json is not valid JSON" };
  }

  const rpc = await mcpRpcAutoRefresh<ToolCallResult>(
    project_slug,
    source.key,
    "tools/call",
    { name: source.tool, arguments: args },
    { timeoutMs: METRIC_TIMEOUT_MS },
  );

  if (!rpc.ok) {
    const detail = "message" in rpc && rpc.message ? `: ${rpc.message}` : "";
    return {
      ok: false,
      error: `Metric query failed against ${source.key} (${rpc.kind}${detail})`,
    };
  }

  const result = rpc.result;
  const text = result?.content?.find((c) => c.type === "text")?.text ?? "";

  if (result?.isError) {
    return {
      ok: false,
      error: `Metric tool '${source.tool}' errored: ${truncate(text || "(no detail)", 500)}`,
    };
  }

  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Not JSON — fall through; parseMetricValue handles numeric strings.
  }

  const value = parseMetricValue(payload);
  if (value === null) {
    return {
      ok: false,
      error: `Metric query returned a non-numeric result. The script must return a single number (or {value: number}). Got: ${truncate(text, 300)}`,
    };
  }
  return { ok: true, value };
}

/** Measure a goal's metric. Errors if the goal has no metric spec yet. */
export async function measureGoalMetric(goal: Goal): Promise<MetricMeasurement> {
  const source = metricSourceFromGoal(goal);
  if (!source) {
    return { ok: false, error: "Goal has no metric definition yet (still in intake?)" };
  }
  return runMetricSource(goal.project_slug, source);
}

export type HistoryPoint = { date: string; value: number };

/**
 * Parse a history query's payload into per-day points. Convention: the
 * script returns an ARRAY of {date, value} (date = YYYY-MM-DD or ISO).
 * Tolerates the runScript {ok, result} envelope, {rows: [...]} wrappers,
 * and `day`/`metric` key aliases — but every row must yield a parseable
 * date and a finite number, and the whole series is rejected otherwise:
 * a chart built on guessed data is worse than no chart.
 */
export function parseHistoryPoints(payload: unknown, depth = 0): HistoryPoint[] | null {
  if (depth > 3 || payload === null || payload === undefined) return null;
  if (Array.isArray(payload)) {
    if (payload.length === 0 || payload.length > 400) return null;
    const points: HistoryPoint[] = [];
    for (const row of payload) {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const rawDate = r.date ?? r.day ?? r.ts;
      const rawValue = r.value ?? r.metric ?? r.v;
      const value = parseMetricValue(rawValue);
      if (typeof rawDate !== "string" || value === null) return null;
      const t = Date.parse(rawDate);
      if (Number.isNaN(t)) return null;
      points.push({ date: new Date(t).toISOString(), value });
    }
    points.sort((a, b) => a.date.localeCompare(b.date));
    return points;
  }
  if (typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if ("result" in o) return parseHistoryPoints(o.result, depth + 1);
    if ("rows" in o) return parseHistoryPoints(o.rows, depth + 1);
    if ("value" in o) return parseHistoryPoints(o.value, depth + 1);
  }
  return null;
}

/** Execute a history source and return parsed per-day points. */
export async function runHistorySource(
  project_slug: string,
  source: MetricSource,
): Promise<{ ok: true; points: HistoryPoint[] } | { ok: false; error: string }> {
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(source.args_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "history args_json must encode a JSON object" };
    }
    args = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: "history args_json is not valid JSON" };
  }
  const rpc = await mcpRpcAutoRefresh<ToolCallResult>(
    project_slug,
    source.key,
    "tools/call",
    { name: source.tool, arguments: args },
    { timeoutMs: METRIC_TIMEOUT_MS },
  );
  if (!rpc.ok) {
    const detail = "message" in rpc && rpc.message ? `: ${rpc.message}` : "";
    return { ok: false, error: `History query failed against ${source.key} (${rpc.kind}${detail})` };
  }
  const text = rpc.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (rpc.result?.isError) {
    return { ok: false, error: `History tool errored: ${truncate(text || "(no detail)", 500)}` };
  }
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // fall through
  }
  const points = parseHistoryPoints(payload);
  if (!points) {
    return {
      ok: false,
      error: `History query must return an array of {date, value} rows (1–400 points). Got: ${truncate(text, 300)}`,
    };
  }
  return { ok: true, points };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
