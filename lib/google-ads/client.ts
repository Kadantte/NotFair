import { GoogleAdsApi } from "google-ads-api";
import { getRequiredEnv } from "@/lib/env";
import { normalizeCustomerId } from "./helpers";
import type { AuthContext } from "./types";
import { isDemoAuth } from "@/lib/demo/constants";

// ─── Constants ───────────────────────────────────────────────────────

/** Google Ads API status enum values */
export const STATUS = {
  ENABLED: 2,
  PAUSED: 3,
} as const;

export const AD_GROUP_TYPE = {
  SEARCH_STANDARD: 2,
} as const;

export const MATCH_TYPE = { EXACT: 2, PHRASE: 3, BROAD: 4 } as const;
export const MATCH_TYPE_NAME: Record<number, "EXACT" | "PHRASE" | "BROAD"> = { 2: "EXACT", 3: "PHRASE", 4: "BROAD" };

// ─── Client Factory ──────────────────────────────────────────────────

function requiredEnv(name: string): string {
  return getRequiredEnv(name);
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

type RealCustomer = ReturnType<GoogleAdsApi["Customer"]>;

export function getCustomer(auth: AuthContext): RealCustomer {
  if (isDemoAuth(auth)) return demoStubCustomer() as unknown as RealCustomer;
  return getClient().Customer({
    customer_id: normalizeCustomerId(auth.customerId),
    refresh_token: auth.refreshToken,
    ...(auth.loginCustomerId && { login_customer_id: normalizeCustomerId(auth.loginCustomerId) }),
  });
}

/**
 * Safety net for demo auth paths that slip past the explicit `if (isDemoAuth)`
 * guards inside each read/write function — e.g. MCP tools that call
 * `customer.query()` directly. Returns a stub that answers every GAQL
 * query with `[]` and every mutation with a plausible success shape. Demo
 * reviewers get empty results for these paths instead of a crash.
 */
function demoStubCustomer() {
  const stub = {
    query: async (_gaql: string) => [] as unknown[],
    mutateResources: async (ops: Array<{ entity?: string; operation?: string }>) => ({
      mutate_operation_responses: (ops ?? []).map(() => ({})),
    }),
    // Minimal shim so report/streaming callers don't blow up. The google-ads
    // library exposes these on real Customer objects; demo stubs swallow them.
    reportStream: async function* () {},
    search: async () => [],
    // Experiment service surfaces. The experiments.ts helpers reach these
    // through `customer.experiments.*` / `customer.experimentArms.*`; without
    // a stub here demo reviewers would TypeError on `undefined.create(...)`.
    experiments: {
      create: async (resources: Array<Record<string, unknown>>) => ({
        results: resources.map(() => ({ resource_name: "customers/0/experiments/demo" })),
      }),
      scheduleExperiment: async () => ({ name: "operations/demo-schedule", done: true }),
      endExperiment: async () => ({}),
      promoteExperiment: async () => ({ name: "operations/demo-promote", done: true }),
      graduateExperiment: async () => ({}),
      listExperimentAsyncErrors: async () => ({ errors: [], next_page_token: "" }),
    },
    experimentArms: {
      create: async (resources: Array<Record<string, unknown>>) => ({
        results: resources.map((r, i) => ({
          resource_name: `customers/0/experimentArms/demo~${i + 1}`,
          experiment_arm: {
            ...r,
            in_design_campaigns: r.control ? [] : ["customers/0/campaigns/demo-trial"],
          },
        })),
      }),
    },
  };
  // Cast through unknown so callers see the real type even though the stub
  // only implements a subset. Anything else they reach for returns undefined,
  // which the google-ads-api client handles as "no data".
  return stub;
}

// ─── Query Cache ────────────────────────────────────────────────────
//
// Cache lives in `./query-cache` — this file just wires it into the
// `customer.query()` proxy below. Re-exported for backward compatibility
// so existing imports from `@/lib/google-ads` keep working.

export {
  invalidateCache,
  clearCache,
  getCacheMetrics,
  resetCacheMetrics,
} from "./query-cache";

import { cachedQuery } from "./query-cache";

/**
 * Append PARAMETERS omit_unselected_resource_names=true to a GAQL SELECT query
 * if not already present. Reduces response payload by omitting resource names
 * for fields not in the SELECT clause (Google Ads API best practice).
 */
function appendGaqlParameters(query: string): string {
  const trimmed = query.trim();
  if (/\bPARAMETERS\b/i.test(trimmed)) return trimmed;
  if (!/^\s*SELECT\b/i.test(trimmed)) return trimmed;
  return `${trimmed} PARAMETERS omit_unselected_resource_names=true`;
}

/**
 * Get a customer client with cached queries.
 * customer.query() results are cached with a TTL and coalesce concurrent
 * identical queries into a single upstream fetch. Use for read-only functions.
 */
export function getCachedCustomer(auth: AuthContext) {
  if (isDemoAuth(auth)) return getCustomer(auth);
  const raw = getCustomer(auth);
  const { userId, customerId, loginCustomerId } = auth;

  return new Proxy(raw, {
    get(target, prop) {
      if (prop === "query") {
        return (query: string) => {
          const optimizedQuery = appendGaqlParameters(query);
          return cachedQuery(userId, customerId, loginCustomerId, optimizedQuery, () =>
            target.query(optimizedQuery),
          );
        };
      }
      return (target as unknown as Record<PropertyKey, unknown>)[prop as PropertyKey];
    },
  });
}
