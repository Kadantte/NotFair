/**
 * Meta Marketing API (Facebook Graph API) client used by the Meta Ads MCP.
 *
 * Mirrors the role `lib/google-ads.ts` plays for Google:
 *   - thin transport over the Graph API (no SDK dependency, just `fetch`)
 *   - uniform error normalization so MCP tools can surface helpful messages
 *   - small set of helpers the runScript sandbox proxies into the JS host
 *
 * This module is the only place we should be hand-crafting Graph URLs from.
 * Everything above (sandbox host, MCP read/write tools) calls into here.
 */

import { getEnv } from "@/lib/env";

const DEFAULT_API_VERSION = "v21.0";

function apiVersion(): string {
  return getEnv("META_GRAPH_API_VERSION") ?? DEFAULT_API_VERSION;
}

const GRAPH_BASE = "https://graph.facebook.com";

// ─── Public types ──────────────────────────────────────────────────────────

export type GraphErrorPayload = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  readonly status: number;
  readonly graphError: GraphErrorPayload | null;
  readonly path: string;
  constructor(opts: {
    status: number;
    path: string;
    graphError: GraphErrorPayload | null;
    message: string;
  }) {
    super(opts.message);
    this.name = "MetaApiError";
    this.status = opts.status;
    this.path = opts.path;
    this.graphError = opts.graphError;
  }
}

export type GraphMethod = "GET" | "POST" | "DELETE";

export type GraphRequest = {
  /** Graph API path. May begin with a slash; a leading `act_` is preserved. */
  path: string;
  /** Query string parameters. `access_token` is injected automatically. */
  params?: Record<string, string | number | boolean | undefined>;
  /** "GET" (default), "POST", or "DELETE". POST encodes params as the body. */
  method?: GraphMethod;
  /**
   * Run the call through Meta's `execution_options=["validate_only"]` mode.
   * Meta runs full validation (auth, schema, permissions, account state,
   * CBO checks, etc.) and returns the same success/error envelope as a real
   * write — but does not persist any change.
   *
   * Only meaningful for POST/DELETE writes; ignored for GET. Set internally
   * by Meta write tools when `auth.testMode === true` (integration-test
   * bearer token); never exposed as an MCP tool input. Customer-facing prod
   * traffic never sets this.
   *
   * Docs: https://developers.facebook.com/docs/marketing-api/validation/
   */
  validateOnly?: boolean;
};

export type GraphResponse<T = unknown> = {
  /** Decoded JSON body. */
  body: T;
  /** HTTP status. */
  status: number;
};

export type GraphPage<T = unknown> = {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
    previous?: string;
  };
};

// ─── Single call ───────────────────────────────────────────────────────────

/**
 * Issue a single Graph API call. Throws `MetaApiError` on a non-2xx or on a
 * `body.error` envelope (Meta sometimes returns 200 + error). Returns the raw
 * JSON body so callers can pick whichever shape they need (paged, scalar,
 * insights).
 */
export async function metaGraph<T = unknown>(
  accessToken: string,
  req: GraphRequest,
): Promise<T> {
  const path = req.path.replace(/^\//, "");
  const method = req.method ?? "GET";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.params ?? {})) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  // Validate-only mode is for write paths only — GETs ignore execution_options
  // and we don't want to mutate the read URL with a no-op param.
  if (req.validateOnly && method !== "GET") {
    params.set("execution_options", JSON.stringify(["validate_only"]));
  }

  // Token goes in Authorization header so it doesn't end up in URL access
  // logs (GET/DELETE) or form-body traces (POST). Meta accepts Bearer tokens
  // on every endpoint we touch.
  const url =
    method === "POST"
      ? `${GRAPH_BASE}/${apiVersion()}/${path}`
      : `${GRAPH_BASE}/${apiVersion()}/${path}${params.size ? `?${params.toString()}` : ""}`;

  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  if (method === "POST") {
    init.headers = {
      ...init.headers,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    init.body = params.toString();
  }

  const res = await fetch(url, init);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Meta nearly always returns JSON; fall through and surface the status.
  }
  const errorEnvelope =
    json && typeof json === "object" && "error" in json
      ? ((json as { error?: GraphErrorPayload }).error ?? null)
      : null;

  if (!res.ok || errorEnvelope) {
    const message = errorEnvelope?.message
      ? `Meta Graph ${method} ${path}: ${errorEnvelope.message}`
        + (errorEnvelope.code ? ` (code ${errorEnvelope.code})` : "")
      : `Meta Graph ${method} ${path}: HTTP ${res.status}`;
    throw new MetaApiError({
      status: res.status,
      path,
      graphError: errorEnvelope,
      message,
    });
  }

  return json as T;
}

/**
 * Fetch every page of a paged Graph endpoint. Caps at `maxPages` (default 20)
 * so a misbehaving cursor can't loop forever. When `maxRows` is set, also
 * stops once that many rows have been collected and slices the result to that
 * exact size — callers that want a row cap should pass it instead of fetching
 * 20 pages and slicing client-side.
 *
 * Each page after the first follows the `paging.next` URL Meta hands us. We
 * strip the embedded `access_token` from that URL and re-attach via header so
 * the token doesn't ride along in fetch traces / proxy logs.
 */
export async function metaGraphAllPages<T = unknown>(
  accessToken: string,
  req: GraphRequest,
  opts: { maxPages?: number; maxRows?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 20;
  const maxRows = opts.maxRows;
  const out: T[] = [];

  // First-page size: prefer the caller's explicit limit, then maxRows (so a
  // small request fits in one page), else 100.
  const firstPageLimit =
    typeof req.params?.limit === "number"
      ? req.params.limit
      : (maxRows && maxRows < 100 ? maxRows : 100);

  // First page via metaGraph so we get unified error handling. Subsequent
  // pages follow paging.next, which is a pre-signed URL.
  const first = await metaGraph<GraphPage<T>>(accessToken, {
    ...req,
    params: { ...(req.params ?? {}), limit: firstPageLimit },
  });
  out.push(...(first.data ?? []));
  if (maxRows != null && out.length >= maxRows) return out.slice(0, maxRows);

  let nextUrl = first.paging?.next;
  for (let i = 1; i < maxPages && nextUrl; i++) {
    // Strip access_token from Meta's paging URL — we'll send it via header.
    const stripped = stripAccessToken(nextUrl);
    const res = await fetch(stripped, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* surface status below */ }

    // Meta sometimes returns 200 + { error } envelopes — same drill as on
    // page 1. Without this, a mid-pagination failure silently truncated
    // results to whatever pages we'd already collected.
    const errorEnvelope =
      body && typeof body === "object" && "error" in body
        ? ((body as { error?: GraphErrorPayload }).error ?? null)
        : null;
    if (!res.ok || errorEnvelope) {
      throw new MetaApiError({
        status: res.status,
        path: req.path,
        graphError: errorEnvelope,
        message: errorEnvelope?.message
          ? `Meta Graph paging ${req.path}: ${errorEnvelope.message}`
            + (errorEnvelope.code ? ` (code ${errorEnvelope.code})` : "")
          : `Meta Graph paging ${req.path}: HTTP ${res.status}`,
      });
    }

    const page = body as GraphPage<T>;
    out.push(...(page.data ?? []));
    if (maxRows != null && out.length >= maxRows) return out.slice(0, maxRows);
    nextUrl = page.paging?.next;
  }
  return maxRows != null ? out.slice(0, maxRows) : out;
}

function stripAccessToken(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete("access_token");
    return u.toString();
  } catch {
    // Malformed URL — return as-is and let fetch surface the error.
    return rawUrl;
  }
}

// ─── Parallel fan-out ──────────────────────────────────────────────────────

export type GraphParallelInput = {
  /** Stable name for the result lookup. */
  name: string;
  /** Path + params for this call. */
  request: GraphRequest;
  /** When set, return only the first N rows (after paging if needed). */
  limit?: number;
  /** When true, follow paging.next up to the cap. Defaults to false. */
  paged?: boolean;
};

export type GraphParallelResult<T = unknown> =
  | { ok: true; data: T; rowCount?: number }
  | { ok: false; error: { message: string; code?: number; type?: string } };

// metaGraphParallel was deleted in favor of an inlined fan-out in the
// runScript host (lib/mcp/code-mode-meta/meta-host.ts) — that version wraps
// each task with execMetaRead so each Graph call lands its own operations
// row. The shared types above stay for the host to consume.

// ─── Insights helper ───────────────────────────────────────────────────────

export type InsightsLevel = "account" | "campaign" | "adset" | "ad";

export type InsightsOptions = {
  /** Aggregation level. Default: campaign. */
  level?: InsightsLevel;
  /**
   * Predefined date preset (e.g. `last_7d`, `last_30d`, `lifetime`). Mutually
   * exclusive with `time_range`.
   */
  date_preset?: string;
  /** Custom date window. Both `since` and `until` are YYYY-MM-DD. */
  time_range?: { since: string; until: string };
  /** Time-bucket granularity, e.g. "1", "7", "monthly". */
  time_increment?: string | number;
  /**
   * Fields requested. Defaults to a sensible audit set; override to trim.
   * Avoid pulling everything — Meta charges insights against rate limits.
   */
  fields?: string[];
  /** Comma-joined breakdowns (e.g. ["age,gender", "country"]). */
  breakdowns?: string[];
  /** Action breakdowns (e.g. ["action_type"]). */
  action_breakdowns?: string[];
  /** Result limit (max 100 per page). */
  limit?: number;
};

const DEFAULT_INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "reach",
  "frequency",
  "actions",
  "action_values",
];

/**
 * Pull insights for an ad account at a chosen level. Wrapper over
 * `/{accountId}/insights` with sensible defaults so most callers don't
 * spelunk the Graph API docs to get a working query.
 *
 * `options.limit` is a TOTAL row cap (not a per-page hint) — pagination stops
 * once that many rows have been collected, and the result is sliced to that
 * exact size.
 */
export async function metaInsights<T = Record<string, unknown>>(
  accessToken: string,
  adAccountId: string,
  options: InsightsOptions = {},
): Promise<T[]> {
  if (options.date_preset && options.time_range) {
    throw new Error("metaInsights: pass `date_preset` OR `time_range`, not both.");
  }
  const totalCap = options.limit ?? 100;
  const params: Record<string, string | number> = {
    level: options.level ?? "campaign",
    fields: (options.fields ?? DEFAULT_INSIGHT_FIELDS).join(","),
    // Per-page size: don't ask Meta for more rows than we'll return; cap at
    // 100 (Meta's effective max for /insights default fields).
    limit: Math.min(totalCap, 100),
  };
  if (options.date_preset) params.date_preset = options.date_preset;
  if (options.time_range) params.time_range = JSON.stringify(options.time_range);
  if (options.time_increment !== undefined) params.time_increment = String(options.time_increment);
  if (options.breakdowns?.length) params.breakdowns = options.breakdowns.join(",");
  if (options.action_breakdowns?.length) params.action_breakdowns = options.action_breakdowns.join(",");

  return metaGraphAllPages<T>(
    accessToken,
    { path: `/${withActPrefix(adAccountId)}/insights`, params },
    { maxRows: totalCap },
  );
}

// ─── Batch endpoint ────────────────────────────────────────────────────────

export type BatchRequest = {
  method: "GET" | "POST" | "DELETE";
  /** Relative path, e.g. `act_123/campaigns?fields=id,name`. */
  relative_url: string;
  body?: string;
};

export type BatchResponseEntry = {
  code: number;
  body: unknown;
  headers?: Array<{ name: string; value: string }>;
};

/**
 * Issue a Graph API batch request. Up to 50 sub-requests in one round-trip;
 * each sub-request returns its own status + body.
 *
 * Use this for unrelated operations the caller wants to bundle. For
 * homogeneous parallel reads, prefer the runScript host's `ads.graphParallel`
 * (inlined in meta-host.ts) — it returns a typed name→result map.
 */
export async function metaBatch(
  accessToken: string,
  requests: BatchRequest[],
): Promise<BatchResponseEntry[]> {
  if (requests.length === 0) return [];
  if (requests.length > 50) {
    throw new Error(`metaBatch: ${requests.length} requests exceeds Meta's 50-call cap.`);
  }
  const params = new URLSearchParams();
  params.set("batch", JSON.stringify(requests));

  const res = await fetch(`${GRAPH_BASE}/${apiVersion()}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${accessToken}`,
    },
    body: params.toString(),
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* surface status */ }
  if (!res.ok) {
    throw new MetaApiError({
      status: res.status,
      path: "/batch",
      graphError: null,
      message: `Meta batch failed: HTTP ${res.status}`,
    });
  }
  const entries = (body ?? []) as Array<{ code: number; body: string; headers?: Array<{ name: string; value: string }> } | null>;
  return entries.map((entry) => {
    if (!entry) return { code: 0, body: null };
    let parsed: unknown = entry.body;
    try { parsed = JSON.parse(entry.body); } catch { /* keep raw string */ }
    return { code: entry.code, body: parsed, headers: entry.headers };
  });
}

// ─── Internals ─────────────────────────────────────────────────────────────

/**
 * Ensure an ad-account id has the `act_` prefix Meta requires on most
 * endpoints. The connection table stores the unprefixed numeric id; tools
 * accept either form to match user expectations.
 */
export function withActPrefix(id: string): string {
  if (!id) return id;
  return id.startsWith("act_") ? id : `act_${id}`;
}

export function stripActPrefix(id: string): string {
  return id.replace(/^act_/, "");
}
