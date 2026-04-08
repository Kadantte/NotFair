import { GoogleAdsApi } from "google-ads-api";
import { getRequiredEnv } from "@/lib/env";
import { normalizeCustomerId } from "./helpers";
import type { AuthContext } from "./types";

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

export function getCustomer(auth: AuthContext) {
  return getClient().Customer({
    customer_id: normalizeCustomerId(auth.customerId),
    refresh_token: auth.refreshToken,
    ...(auth.loginCustomerId && { login_customer_id: normalizeCustomerId(auth.loginCustomerId) }),
  });
}

// ─── Query Cache ────────────────────────────────────────────────────
//
// In-memory TTL cache for read queries. Keyed by customerId + GAQL.
// Mutations invalidate all entries for the affected customerId.

const CACHE_TTL_MS = 45_000; // 45 seconds
const CACHE_MAX_SIZE = 500;

type CacheEntry = {
  data: any;
  expiresAt: number;
};

const queryCache = new Map<string, CacheEntry>();

/** Evict oldest entries when cache exceeds max size. Map insertion order = age. */
function evictIfNeeded() {
  if (queryCache.size <= CACHE_MAX_SIZE) return;
  const toDelete = queryCache.size - CACHE_MAX_SIZE;
  const iter = queryCache.keys();
  for (let i = 0; i < toDelete; i++) {
    const { value } = iter.next();
    if (value) queryCache.delete(value);
  }
}

function cacheKey(customerId: string, query: string, loginCustomerId?: string | null): string {
  const prefix = loginCustomerId
    ? `${normalizeCustomerId(loginCustomerId)}/${normalizeCustomerId(customerId)}`
    : normalizeCustomerId(customerId);
  return `${prefix}::${query.replace(/\s+/g, " ").trim()}`;
}

/** Invalidate all cached queries for a customer (call after mutations). */
export function invalidateCache(customerId: string) {
  const normalized = normalizeCustomerId(customerId);
  for (const key of queryCache.keys()) {
    // Match both direct keys (customerId::...) and manager-routed keys (managerId/customerId::...)
    if (key.includes(`${normalized}::`) || key.includes(`/${normalized}::`)) {
      queryCache.delete(key);
    }
  }
}

/** Clear the entire cache (used by Refresh buttons). */
export function clearCache() {
  queryCache.clear();
}

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
 * customer.query() results are cached with a TTL. Use for read-only functions.
 */
export function getCachedCustomer(auth: AuthContext) {
  const raw = getCustomer(auth);
  const customerId = auth.customerId;
  const loginCustomerId = auth.loginCustomerId;

  return new Proxy(raw, {
    get(target, prop) {
      if (prop === "query") {
        return async (query: string) => {
          const optimizedQuery = appendGaqlParameters(query);
          const key = cacheKey(customerId, optimizedQuery, loginCustomerId);
          const now = Date.now();
          const cached = queryCache.get(key);
          if (cached && cached.expiresAt > now) {
            return cached.data;
          }
          const result = await target.query(optimizedQuery);
          queryCache.set(key, { data: result, expiresAt: now + CACHE_TTL_MS });
          evictIfNeeded();
          return result;
        };
      }
      return (target as any)[prop];
    },
  });
}
