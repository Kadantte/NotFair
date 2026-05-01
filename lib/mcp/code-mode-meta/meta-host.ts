/**
 * Host-side `ads` namespace exposed to the Meta runScript sandbox.
 *
 * Mirrors `lib/mcp/code-mode/ads-client.ts` but for the Meta Marketing API.
 * The shape of the sandbox surface (host RPC channel + bootstrap of pure
 * helpers/constants) is identical so scripts feel the same across platforms.
 *
 *   ads.graph(path, params?)         — single Graph API call
 *   ads.graphParallel([{name, ...}]) — fan-out (max 20)
 *   ads.insights(adAccountId, opts?) — wrapper over /insights with defaults
 *   ads.batch([requests])            — Graph API /batch endpoint
 *   ads.helpers.*                    — date-range, formatting helpers
 *   ads.fields.*                     — common field-list strings
 *
 * Auth lives on the host (the long-lived Meta access token sits in
 * `AuthContext.refreshToken` per the factory mapping). Scripts cannot reach
 * it — they only see the JSON-shaped results.
 */

import type { AuthContext } from "@/lib/google-ads";
import type { HostApi } from "@/lib/mcp/code-mode/sandbox";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import {
  metaGraph,
  metaGraphParallel,
  metaGraphAllPages,
  metaInsights,
  metaBatch,
  withActPrefix,
  type GraphParallelInput,
  type InsightsOptions,
  type BatchRequest,
} from "@/lib/meta-ads/client";

const MAX_PARALLEL = 20;

/**
 * Build the host `ads` namespace and the bootstrap-script string for the
 * Meta runScript sandbox. `auth.refreshToken` is the long-lived Meta access
 * token; `targetId` is the unprefixed numeric ad account id.
 */
export function buildMetaAdsHost(
  auth: AuthContext,
  targetId: string,
): { host: HostApi; bootstrap: string } {
  const accessToken = auth.refreshToken;
  if (!accessToken) {
    throw new Error(
      "Meta runScript: no access token on connection. Reconnect Meta at /add-meta-ads-account.",
    );
  }
  if (!targetId) {
    throw new Error(
      "Meta runScript: no active ad account selected. Pick one at /add-meta-ads-account.",
    );
  }

  async function graph(pathArg: unknown, paramsArg?: unknown, methodArg?: unknown) {
    const path = expectString(pathArg, "ads.graph: `path` must be a string (e.g. '/me/adaccounts')");
    const params = normalizeParams(paramsArg, "ads.graph");
    const method = normalizeMethod(methodArg);
    return metaGraph(accessToken, { path: substituteAccountId(path, targetId), params, method });
  }

  async function graphParallel(callsArg: unknown) {
    if (!Array.isArray(callsArg)) {
      throw new Error(
        "ads.graphParallel: expected an array of { name, path, params?, paged?, limit? }. " +
        "Example: await ads.graphParallel([{ name: 'campaigns', path: '/me/adaccounts', paged: true }])",
      );
    }
    if (callsArg.length === 0) return {};
    if (callsArg.length > MAX_PARALLEL) {
      throw new Error(
        `ads.graphParallel: max ${MAX_PARALLEL} calls per invocation (received ${callsArg.length})`,
      );
    }
    const calls: GraphParallelInput[] = callsArg.map((raw, i) => {
      const entry = raw as {
        name?: unknown;
        path?: unknown;
        params?: unknown;
        method?: unknown;
        paged?: unknown;
        limit?: unknown;
      };
      const name = expectString(entry?.name, `ads.graphParallel[${i}]: \`name\` must be a string`);
      const path = expectString(entry?.path, `ads.graphParallel[${i}]: \`path\` must be a string`);
      return {
        name,
        request: {
          path: substituteAccountId(path, targetId),
          params: normalizeParams(entry?.params, `ads.graphParallel[${i}]`),
          method: normalizeMethod(entry?.method),
        },
        paged: !!entry?.paged,
        limit: typeof entry?.limit === "number" ? entry.limit : undefined,
      };
    });

    const seen = new Set<string>();
    for (const c of calls) {
      if (seen.has(c.name)) {
        throw new Error(`ads.graphParallel: duplicate call name "${c.name}"`);
      }
      seen.add(c.name);
    }

    // Fail fast on rate limit before fanning out. Mirrors gaqlParallel.
    await enforceRateLimit(auth.userId);

    return metaGraphParallel(accessToken, calls);
  }

  async function insights(adAccountIdArg: unknown, optionsArg?: unknown) {
    const provided = adAccountIdArg === undefined || adAccountIdArg === null
      ? targetId
      : expectString(adAccountIdArg, "ads.insights: `adAccountId` must be a string");
    const options = normalizeInsightsOptions(optionsArg);
    return metaInsights(accessToken, provided, options);
  }

  async function batch(requestsArg: unknown) {
    if (!Array.isArray(requestsArg)) {
      throw new Error(
        "ads.batch: expected an array of { method, relative_url, body? }",
      );
    }
    const requests: BatchRequest[] = requestsArg.map((raw, i) => {
      const entry = raw as { method?: unknown; relative_url?: unknown; body?: unknown };
      const method = normalizeMethod(entry?.method) ?? "GET";
      const relative_url = expectString(
        entry?.relative_url,
        `ads.batch[${i}]: \`relative_url\` must be a string`,
      );
      const body = typeof entry?.body === "string" ? entry.body : undefined;
      return {
        method: method as "GET" | "POST" | "DELETE",
        relative_url: substituteAccountId(relative_url, targetId),
        body,
      };
    });
    return metaBatch(accessToken, requests);
  }

  // Quick helper for paged reads — common enough to deserve its own RPC so
  // scripts don't have to manage the cursor state in JS.
  async function pagedAll(pathArg: unknown, paramsArg?: unknown, maxPagesArg?: unknown) {
    const path = expectString(pathArg, "ads.pagedAll: `path` must be a string");
    const params = normalizeParams(paramsArg, "ads.pagedAll");
    const maxPages = typeof maxPagesArg === "number" ? maxPagesArg : undefined;
    return metaGraphAllPages(
      accessToken,
      { path: substituteAccountId(path, targetId), params },
      maxPages !== undefined ? { maxPages } : {},
    );
  }

  return {
    host: {
      ads: { graph, graphParallel, insights, batch, pagedAll },
    },
    bootstrap: buildBootstrap(targetId),
  };
}

// ─── Bootstrap (pure JS injected into the sandbox) ─────────────────────────

function buildBootstrap(targetId: string): string {
  // Common Meta field lists. Strings the script can paste into `params.fields`.
  const fields = {
    campaign:
      "id,name,status,objective,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,buying_type,special_ad_categories,created_time,updated_time",
    adset:
      "id,name,status,effective_status,campaign_id,optimization_goal,billing_event,bid_amount,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,targeting,promoted_object,created_time,updated_time",
    ad:
      "id,name,status,effective_status,adset_id,campaign_id,creative,configured_status,created_time,updated_time",
    adAccount:
      "id,account_id,name,currency,timezone_name,account_status,balance,amount_spent,spend_cap,disable_reason,business",
    insightsAudit:
      "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,cost_per_action_type,objective",
    insightsLite:
      "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,actions",
  };

  // Common date presets accepted by /insights' `date_preset`. Surface as
  // constants so scripts get autocomplete-style ergonomics.
  const datePresets = [
    "today",
    "yesterday",
    "this_month",
    "last_month",
    "this_quarter",
    "last_3d",
    "last_7d",
    "last_14d",
    "last_28d",
    "last_30d",
    "last_90d",
    "lifetime",
  ];

  return `
    (() => {
      const ads = globalThis.ads;

      // Active account id pinned at sandbox-build time. Scripts can pass
      // this back into helpers that take an explicit ad-account id.
      ads.activeAccountId = ${JSON.stringify(targetId)};

      // Common field lists, ready to drop into params.fields.
      ads.fields = Object.freeze(${JSON.stringify(fields)});

      // Date-preset string constants accepted by /insights date_preset.
      ads.datePresets = Object.freeze(${JSON.stringify(datePresets)});

      // Pure helpers — date math, formatting.
      function formatDate(d) {
        const yr = d.getUTCFullYear();
        const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
        const da = String(d.getUTCDate()).padStart(2, '0');
        return yr + '-' + mo + '-' + da;
      }
      function getDateRange(daysBack) {
        const end = new Date();
        const start = new Date();
        start.setUTCDate(end.getUTCDate() - Math.max(1, daysBack | 0));
        return { since: formatDate(start), until: formatDate(end) };
      }
      function daysBetween(aIso, bIso) {
        const a = new Date(aIso).getTime();
        const b = new Date(bIso).getTime();
        return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
      }
      function withActPrefix(id) {
        if (!id) return id;
        return String(id).startsWith('act_') ? String(id) : 'act_' + String(id);
      }
      function stripActPrefix(id) {
        return String(id).replace(/^act_/, '');
      }

      ads.helpers = Object.freeze({
        formatDate, getDateRange, daysBetween, withActPrefix, stripActPrefix,
      });
    })();
  `;
}

// ─── Argument normalizers ──────────────────────────────────────────────────

function expectString(value: unknown, errMsg: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(errMsg);
  return value;
}

function normalizeMethod(arg: unknown): "GET" | "POST" | "DELETE" | undefined {
  if (arg === undefined || arg === null) return undefined;
  if (typeof arg !== "string") throw new Error("`method` must be 'GET' | 'POST' | 'DELETE'");
  const upper = arg.toUpperCase();
  if (upper !== "GET" && upper !== "POST" && upper !== "DELETE") {
    throw new Error(`Unsupported method: ${arg}`);
  }
  return upper;
}

function normalizeParams(arg: unknown, ctx: string): Record<string, string | number | boolean> | undefined {
  if (arg === undefined || arg === null) return undefined;
  if (typeof arg !== "object" || Array.isArray(arg)) {
    throw new Error(`${ctx}: \`params\` must be a plain object`);
  }
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      // Accept arrays/objects by JSON-stringifying — Meta accepts JSON params
      // for things like time_range and targeting.
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

function normalizeInsightsOptions(arg: unknown): InsightsOptions {
  if (arg === undefined || arg === null) return {};
  if (typeof arg !== "object" || Array.isArray(arg)) {
    throw new Error("ads.insights: `options` must be a plain object");
  }
  return arg as InsightsOptions;
}

/**
 * Replace `{accountId}` and `act_{accountId}` tokens in user-provided paths
 * with the active ad account id. Lets scripts write
 * `'/{accountId}/campaigns'` without manual interpolation. Plain numeric ids
 * untouched.
 */
function substituteAccountId(path: string, targetId: string): string {
  return path
    .replace(/\{accountId\}/g, withActPrefix(targetId))
    .replace(/act_\{accountId\}/g, withActPrefix(targetId));
}
