import type { AuthContext } from "@/lib/google-ads";
import { runSafeGaqlReport } from "@/lib/google-ads";
import { humanizeGaqlRows } from "@/lib/google-ads/humanize";
import { buildGoogleAdsReconnectError, isGoogleAdsReconnectRequired } from "@/lib/mcp/auth-error-response";
import {
  queryAccountInfo,
  queryCampaigns,
  queryGeoTargeting,
  queryKeywords,
  queryQualityScores,
  querySearchTerms,
  queryConvertingSearchTerms,
  queryZeroConversionKeywords,
  queryAds,
  queryAdGroups,
  queryConversionActions,
  queryAudienceSegmentCheck,
  queryDevicePerformance,
  queryNegativeKeywords,
  queryNetworkSegmentation,
  queryCampaignAssets,
  queryAdGroupAssets,
  querySharedNegativeKeywordLists,
  querySharedNegativeKeywordMembers,
  queryPausedCampaigns,
  queryCustomerManagerLinks,
  queryLandingPages,
  queryChangeEvents,
  queryDailyCampaignMetrics,
  queryConversionActionPerformance,
  queryRecommendations,
  queryBillingSetups,
} from "@/lib/google-ads/audit/queries";
import {
  RESOURCE_CHANGE_OP,
  CHANGE_RESOURCE_TYPE,
  CHANGE_CLIENT_TYPE,
} from "@/lib/google-ads/audit/change-index";
import { execRead } from "@/lib/tools/execute";
import { enforceRateLimit, RateLimitError } from "@/lib/mcp/rate-limit";

import type { HostApi } from "./sandbox";

type GaqlOptions = {
  excludeRemovedParents?: boolean;
};

type GaqlParallelOptions = GaqlOptions & {
  partial?: boolean;
};

const SANDBOX_HELPER_NAMES = [
  "formatDate",
  "getDateRange",
  "micros",
  "toMicros",
  "normalizeCustomerId",
  "extractChangedFields",
  "daysBetween",
  "generateBrandVariants",
] as const;

// Keep the sandbox helper API independent of production function names.
// Next/webpack minifies imported function identifiers in server bundles, so
// deriving Object keys from Function.name can expose `{ m, n, o, ... }` instead
// of the documented `ads.helpers.getDateRange`, `micros`, etc.
const SANDBOX_HELPER_SOURCE = String.raw`
function normalizeCustomerId(customerId) {
  return String(customerId).replace(/-/g, "").trim();
}

function formatDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function getDateRange(days) {
  const parsed = Math.floor(Number(days));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      "ads.helpers.getDateRange(days): days must be a positive integer (received " +
      JSON.stringify(days) +
      "). Example: ads.helpers.getDateRange(7) returns { start, end } for the last 7 days."
    );
  }
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (parsed - 1));
  return { start: formatDate(start), end: formatDate(end) };
}

function micros(v) {
  return v ? v / 1000000 : 0;
}

function toMicros(dollars) {
  return Math.round(dollars * 1000000);
}

function extractChangedFields(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "object" && "paths" in raw) {
    const paths = raw.paths;
    if (Array.isArray(paths)) return paths.map(String).filter(Boolean);
  }
  return [];
}

function daysBetween(changeISO, referenceISO) {
  const changeMs = new Date(changeISO).getTime();
  const refMs = new Date(referenceISO + "T23:59:59").getTime();
  if (!isFinite(changeMs) || !isFinite(refMs)) return 0;
  return Math.max(0, Math.floor((refMs - changeMs) / 86400000));
}

function generateBrandVariants(businessName) {
  const name = String(businessName).toLowerCase().trim();
  if (!name) return [];
  const variants = new Set();
  variants.add(name);
  for (const suffix of [" llc", " inc", " ltd", " corp"]) {
    if (name.endsWith(suffix)) variants.add(name.slice(0, -suffix.length).trim());
  }
  const camelSplit = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  if (camelSplit !== name) variants.add(camelSplit);
  const noSpaces = name.replace(/\s+/g, "");
  if (noSpaces !== name) variants.add(noSpaces);
  const camelNoSpaces = camelSplit.replace(/\s+/g, "");
  if (camelNoSpaces !== name) variants.add(camelNoSpaces);
  return Array.from(variants).filter((v) => v.length >= 4);
}
`;

/**
 * Build the host-side `ads` namespace exposed to scripts.
 *
 * Two channels:
 *   - `host`: async RPCs to the parent process (gaql, gaqlParallel).
 *     These cross the JSON serialization boundary and go through execRead for
 *     rate-limit + telemetry parity with the typed read tools — no hidden bypass.
 *   - `bootstrap`: VM-local data and pure functions (query builders, constants,
 *     serializable helpers). Installed once at sandbox startup so scripts can
 *     use them synchronously without paying an RPC cost.
 *
 * Auth stays on the host; the sandbox only sees method signatures and pure data.
 */
export function buildAdsHost(
  auth: AuthContext,
  targetId: string,
): { host: HostApi; bootstrap: string } {
  const MAX_PARALLEL_QUERIES = 20;
  const DEFAULT_LIMIT = 200;
  const MAX_LIMIT = 2000;

  async function gaql(queryArg: unknown, limitArg?: unknown, optionsArg?: unknown) {
    const query = expectString(queryArg, "ads.gaql: `query` must be a string");
    const limit = isPlainObject(limitArg)
      ? DEFAULT_LIMIT
      : normalizeLimit(limitArg, DEFAULT_LIMIT, MAX_LIMIT);
    const rawOptions = normalizeGaqlOptions(isPlainObject(limitArg) ? limitArg : optionsArg);
    if (rawOptions.partial != null) {
      throw new Error("GAQL option `partial` only applies to ads.gaqlParallel().");
    }
    const options = gaqlExecutionOptions(rawOptions);
    const report = await execRead(auth, targetId, "run_script_gaql", () =>
      runSafeGaqlReport(auth, query, limit, options),
    );
    humanizeGaqlRows(report.rows as unknown[]);
    return report;
  }

  async function gaqlParallel(queriesArg: unknown, optionsArg?: unknown) {
    if (!Array.isArray(queriesArg)) {
      throw new Error(
        "ads.gaqlParallel: expected an array of { name, query, limit? }. " +
        "Example: await ads.gaqlParallel([{ name: 'campaigns', query: 'SELECT campaign.id FROM campaign', limit: 100 }])",
      );
    }
    const rawOptions = normalizeGaqlOptions(optionsArg);
    const partial = rawOptions.partial ?? false;
    const options = gaqlExecutionOptions(rawOptions);
    if (queriesArg.length === 0) return {};
    if (queriesArg.length > MAX_PARALLEL_QUERIES) {
      throw new Error(
        `ads.gaqlParallel: max ${MAX_PARALLEL_QUERIES} queries per call (received ${queriesArg.length})`,
      );
    }
    const tasks = queriesArg.map((raw, i) => {
      const entry = raw as { name?: unknown; query?: unknown; limit?: unknown };
      const name = expectString(entry?.name, `ads.gaqlParallel[${i}]: \`name\` must be a string`);
      const query = expectString(
        entry?.query,
        `ads.gaqlParallel[${i}]: \`query\` must be a string`,
      );
      const limit = normalizeLimit(entry?.limit, DEFAULT_LIMIT, MAX_LIMIT);
      return { name, query, limit };
    });

    const seen = new Set<string>();
    for (const t of tasks) {
      if (seen.has(t.name)) {
        throw new Error(`ads.gaqlParallel: duplicate query name "${t.name}"`);
      }
      seen.add(t.name);
    }

    // Fail fast when the user is already at their monthly cap. Without this,
    // all N tasks would each hit the per-call enforceRateLimit inside execRead,
    // producing N RATE_LIMIT log rows and returning N `{ error }` entries —
    // the script then can't distinguish quota from transient RPC failures.
    await enforceRateLimit(auth.userId);

    const results = await Promise.allSettled(
      tasks.map((t) =>
        execRead(auth, targetId, "run_script_gaql_parallel", async () => {
          try {
            return await runSafeGaqlReport(auth, t.query, t.limit, options);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`gaqlParallel query "${t.name}" failed: ${message}`);
          }
        }),
      ),
    );

    // If a task crossed the cap mid-fan-out (race between the pre-check above
    // and the per-task enforceRateLimit), surface the RateLimitError to the
    // script instead of burying it in an { error } map.
    for (const r of results) {
      if (r.status === "rejected" && r.reason instanceof RateLimitError) {
        throw r.reason;
      }
    }

    const failures = results
      .map((r, i) => ({ result: r, name: tasks[i].name }))
      .filter((entry): entry is { result: PromiseRejectedResult; name: string } =>
        entry.result.status === "rejected",
      );
    if (!partial && failures.length > 0) {
      const messages = failures.map(({ result }) =>
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
      throw new Error(
        `ads.gaqlParallel failed (${failures.length}/${tasks.length} quer${failures.length === 1 ? "y" : "ies"}): ${messages.join("; ")}`,
      );
    }

    const out: Record<string, unknown> = {};
    results.forEach((r, i) => {
      const name = tasks[i].name;
      if (r.status === "fulfilled") {
        humanizeGaqlRows(r.value.rows as unknown[]);
        out[name] = r.value;
      } else {
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        out[name] = isGoogleAdsReconnectRequired(message)
          ? { error: buildGoogleAdsReconnectError(message) }
          : { error: message };
      }
    });
    return out;
  }

  return { host: { ads: { gaql, gaqlParallel } }, bootstrap: buildBootstrap() };
}

/**
 * Emits the JS that pre-installs query builders, constants, and pure helpers
 * into the sandbox's `ads` namespace. All payloads are inlined as strings or
 * pure functions — no closures over host state.
 */
function buildBootstrap(): string {
  const parameterlessQueries = {
    accountInfo: queryAccountInfo(),
    geoTargeting: queryGeoTargeting(),
    qualityScores: queryQualityScores(),
    adGroups: queryAdGroups(),
    conversionActions: queryConversionActions(),
    recommendations: queryRecommendations(),
    billingSetups: queryBillingSetups(),
    audienceSegmentCheck: queryAudienceSegmentCheck(),
    negativeKeywords: queryNegativeKeywords(),
    campaignAssets: queryCampaignAssets(),
    adGroupAssets: queryAdGroupAssets(),
    sharedNegativeKeywordLists: querySharedNegativeKeywordLists(),
    sharedNegativeKeywordMembers: querySharedNegativeKeywordMembers(),
    pausedCampaigns: queryPausedCampaigns(),
    customerManagerLinks: queryCustomerManagerLinks(),
  };

  // Date-parameterized query builders serialize their source so the sandbox
  // gets the real function and runs it for any start/end pair the script picks.
  const windowedQueries: Record<string, (start: string, end: string) => string> = {
    campaigns: queryCampaigns,
    keywords: queryKeywords,
    searchTerms: querySearchTerms,
    convertingSearchTerms: queryConvertingSearchTerms,
    zeroConversionKeywords: queryZeroConversionKeywords,
    ads: queryAds,
    devicePerformance: queryDevicePerformance,
    networkSegmentation: queryNetworkSegmentation,
    landingPages: queryLandingPages,
    changeEvents: queryChangeEvents,
    dailyCampaignMetrics: queryDailyCampaignMetrics,
    conversionActionPerformance: queryConversionActionPerformance,
  };

  return `
    (() => {
      const ads = globalThis.ads;

      // Parameterless GAQL — plain strings the script can pass to ads.gaql.
      const parameterlessQueries = ${JSON.stringify(parameterlessQueries)};

      // Date-windowed GAQL builders. Each takes (start, end) ISO date strings.
      const windowedSources = ${JSON.stringify(
        Object.fromEntries(
          Object.entries(windowedQueries).map(([k, fn]) => [k, fn.toString()]),
        ),
      )};

      ads.queries = {};
      for (const [k, v] of Object.entries(parameterlessQueries)) ads.queries[k] = v;
      for (const [k, src] of Object.entries(windowedSources)) {
        ads.queries[k] = (0, eval)("(" + src + ")");
      }

      // Canonical wide-net query pack for account audits. It is intentionally
      // factual rather than opinionated: agents still synthesize the answer,
      // but the important surfaces are hard to forget. Usage:
      //   const { start, end } = ads.helpers.getDateRange(90);
      //   const r = await ads.gaqlParallel(ads.queries.auditPack(start, end));
      // Returns exactly 20 queries — the gaqlParallel per-call limit.
      // For billing setup, shared negative list members, or manager links,
      // query ads.queries.billingSetups / sharedNegativeKeywordMembers /
      // customerManagerLinks separately after the main audit.
      ads.queries.auditPack = (start, end) => [
        { name: "acct", query: ads.queries.accountInfo, limit: 1 },
        { name: "campaigns", query: ads.queries.campaigns(start, end), limit: 500 },
        { name: "keywords", query: ads.queries.keywords(start, end), limit: 2000 },
        { name: "searchTerms", query: ads.queries.searchTerms(start, end), limit: 2000 },
        { name: "convertingSearchTerms", query: ads.queries.convertingSearchTerms(start, end), limit: 500 },
        { name: "zeroConversionKeywords", query: ads.queries.zeroConversionKeywords(start, end), limit: 500 },
        { name: "qualityScores", query: ads.queries.qualityScores, limit: 2000 },
        { name: "ads", query: ads.queries.ads(start, end), limit: 1000 },
        { name: "adGroups", query: ads.queries.adGroups, limit: 1000 },
        { name: "conversionActions", query: ads.queries.conversionActions, limit: 500 },
        { name: "conversionActionPerformance", query: ads.queries.conversionActionPerformance(start, end), limit: 500 },
        { name: "recommendations", query: ads.queries.recommendations, limit: 1000 },
        { name: "negativeKeywords", query: ads.queries.negativeKeywords, limit: 1000 },
        { name: "sharedNegativeKeywordLists", query: ads.queries.sharedNegativeKeywordLists, limit: 100 },
        { name: "campaignAssets", query: ads.queries.campaignAssets, limit: 1000 },
        { name: "adGroupAssets", query: ads.queries.adGroupAssets, limit: 1000 },
        { name: "networkSegmentation", query: ads.queries.networkSegmentation(start, end), limit: 1000 },
        { name: "landingPages", query: ads.queries.landingPages(start, end), limit: 500 },
        { name: "pausedCampaigns", query: ads.queries.pausedCampaigns, limit: 500 },
        { name: "changeEvents", query: ads.queries.changeEvents(start, end), limit: 500 },
      ];
      Object.freeze(ads.queries);

      // Static enum maps from the change_event resource. Inverse lookups
      // (fieldName → numeric code) also attached for callers building filters.
      ads.constants = Object.freeze({
        RESOURCE_CHANGE_OP: ${JSON.stringify(RESOURCE_CHANGE_OP)},
        CHANGE_RESOURCE_TYPE: ${JSON.stringify(CHANGE_RESOURCE_TYPE)},
        CHANGE_CLIENT_TYPE: ${JSON.stringify(CHANGE_CLIENT_TYPE)},
      });

      // Pure helpers, installed inside an IIFE that rebuilds the host
      // module's scope so cross-calls (getDateRange -> formatDate) still link.
      (function installHelpers() {
        ${SANDBOX_HELPER_SOURCE}
        ads.helpers = Object.freeze({ ${SANDBOX_HELPER_NAMES.join(", ")} });
      })();
    })();
  `;
}

function gaqlExecutionOptions(options: GaqlParallelOptions): GaqlOptions {
  return {
    ...(options.excludeRemovedParents != null
      ? { excludeRemovedParents: options.excludeRemovedParents }
      : {}),
  };
}

function expectString(value: unknown, errMsg: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(errMsg);
  return value;
}

function normalizeLimit(value: unknown, fallback: number, max: number): number {
  if (value == null) return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function normalizeGaqlOptions(value: unknown): GaqlParallelOptions {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "GAQL options must be an object. Example: { excludeRemovedParents: false }",
    );
  }
  const raw = value as Record<string, unknown>;
  const out: GaqlParallelOptions = {};
  if (raw.excludeRemovedParents != null) {
    if (typeof raw.excludeRemovedParents !== "boolean") {
      throw new Error("GAQL option `excludeRemovedParents` must be a boolean.");
    }
    out.excludeRemovedParents = raw.excludeRemovedParents;
  }
  if (raw.partial != null) {
    if (typeof raw.partial !== "boolean") {
      throw new Error("GAQL option `partial` must be a boolean.");
    }
    out.partial = raw.partial;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
