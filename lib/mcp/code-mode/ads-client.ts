import type { AuthContext } from "@/lib/google-ads";
import { runSafeGaqlReport } from "@/lib/google-ads";
import {
  formatDate,
  getDateRange,
  micros,
  toMicros,
  normalizeCustomerId,
} from "@/lib/google-ads/helpers";
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
  queryLandingPages,
  queryChangeEvents,
  queryDailyCampaignMetrics,
} from "@/lib/google-ads/audit/queries";
import {
  RESOURCE_CHANGE_OP,
  CHANGE_RESOURCE_TYPE,
  CHANGE_CLIENT_TYPE,
  extractChangedFields,
  daysBetween,
} from "@/lib/google-ads/audit/change-index";
import { execRead } from "@/lib/tools/execute";

// Inlined from lib/google-ads/audit.ts so this module doesn't need to pull in
// the full audit engine (keeps the code-mode commit self-contained).
function generateBrandVariants(businessName: string): string[] {
  const name = businessName.toLowerCase().trim();
  if (!name) return [];
  const variants = new Set<string>();
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
import type { HostApi } from "./sandbox";

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

  async function gaql(queryArg: unknown, limitArg?: unknown) {
    const query = expectString(queryArg, "ads.gaql: `query` must be a string");
    const limit = normalizeLimit(limitArg, DEFAULT_LIMIT, MAX_LIMIT);
    return execRead(auth, targetId, "run_script_gaql", () =>
      runSafeGaqlReport(auth, query, limit),
    );
  }

  async function gaqlParallel(queriesArg: unknown) {
    if (!Array.isArray(queriesArg)) {
      throw new Error("ads.gaqlParallel: expected an array of { name, query, limit? }");
    }
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

    const results = await Promise.allSettled(
      tasks.map((t) =>
        execRead(auth, targetId, "run_script_gaql_parallel", () =>
          runSafeGaqlReport(auth, t.query, t.limit),
        ),
      ),
    );

    const out: Record<string, unknown> = {};
    results.forEach((r, i) => {
      const name = tasks[i].name;
      if (r.status === "fulfilled") {
        out[name] = r.value;
      } else {
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        out[name] = { error: message };
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
    audienceSegmentCheck: queryAudienceSegmentCheck(),
    negativeKeywords: queryNegativeKeywords(),
    campaignAssets: queryCampaignAssets(),
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
  };

  // Helpers are installed as function declarations inside one IIFE so they
  // close over each other (getDateRange references formatDate, etc.) the way
  // they do in the host module. Each .toString() yields `function name() {...}`
  // which is a valid declaration; concatenating them rebuilds the module's
  // local scope. Order-insensitive because function declarations hoist.
  const helperDeclarations = [
    formatDate,
    getDateRange,
    micros,
    toMicros,
    normalizeCustomerId,
    extractChangedFields,
    daysBetween,
    generateBrandVariants,
  ];
  const helperNames = helperDeclarations.map((fn) => fn.name);
  const helperSource = helperDeclarations.map((fn) => fn.toString()).join("\n\n");

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
        ${helperSource}
        ads.helpers = Object.freeze({ ${helperNames.join(", ")} });
      })();
    })();
  `;
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
