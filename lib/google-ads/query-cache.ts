/**
 * In-memory TTL cache for Google Ads GAQL read queries.
 *
 * Scoped by `(userId, customerId, loginCustomerId, query)` so concurrent
 * users stay isolated from one another's cached payloads. Mutations
 * invalidate all entries for the affected customerId across users, because
 * a write by user A must be visible to user B on the next read.
 *
 * Request coalescing: concurrent callers with the same key share one
 * in-flight fetch promise instead of triggering duplicate API calls — a
 * common pattern when Claude fires parallel `listCampaigns` etc. while
 * assembling a dashboard.
 */

import { normalizeCustomerId } from "./helpers";

const CACHE_TTL_MS = 45_000;
const CACHE_MAX_SIZE = 5_000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  coalesced: number;
  writes: number;
  evictions: number;
  invalidations: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  coalesced: 0,
  writes: 0,
  evictions: 0,
  invalidations: 0,
};

/**
 * Build a cache key of form `<user>::<cidPrefix>::<normalized-query>`.
 *
 * `cidPrefix` is `customerId` for direct access, or `loginCid/customerId`
 * for manager-routed access. Keeping them on the same token boundary lets
 * `invalidateCache(customerId)` match both variants with a single check.
 */
function buildKey(
  userId: string | null | undefined,
  customerId: string,
  loginCustomerId: string | null | undefined,
  query: string,
): string {
  const user = userId ?? "_";
  const cid = normalizeCustomerId(customerId);
  const prefix = loginCustomerId ? `${normalizeCustomerId(loginCustomerId)}/${cid}` : cid;
  return `${user}::${prefix}::${query.replace(/\s+/g, " ").trim()}`;
}

/**
 * Check whether a key belongs to the given customer. Parses the key's
 * middle segment so we don't substring-match customer IDs that happen to
 * appear elsewhere (e.g. inside a GAQL literal).
 */
function keyMatchesCustomer(key: string, normalizedCid: string): boolean {
  const parts = key.split("::");
  if (parts.length < 3) return false;
  const cidPrefix = parts[1];
  return cidPrefix === normalizedCid || cidPrefix.endsWith(`/${normalizedCid}`);
}

function evictIfNeeded(): void {
  if (cache.size <= CACHE_MAX_SIZE) return;
  const toDelete = cache.size - CACHE_MAX_SIZE;
  const iter = cache.keys();
  for (let i = 0; i < toDelete; i++) {
    const { value } = iter.next();
    if (value) cache.delete(value);
  }
  metrics.evictions += toDelete;
}

/**
 * Read-through cache wrapper. Returns cached data if fresh; otherwise
 * invokes `fetch()` and caches the result. Concurrent callers with the
 * same key share a single in-flight promise.
 */
export async function cachedQuery<T>(
  userId: string | null | undefined,
  customerId: string,
  loginCustomerId: string | null | undefined,
  query: string,
  fetch: () => Promise<T>,
): Promise<T> {
  const key = buildKey(userId, customerId, loginCustomerId, query);
  const now = Date.now();

  const entry = cache.get(key);
  if (entry && entry.expiresAt > now) {
    metrics.hits++;
    return entry.data as T;
  }

  const existing = inflight.get(key);
  if (existing) {
    metrics.coalesced++;
    return existing as Promise<T>;
  }

  metrics.misses++;
  const promise = fetch()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      metrics.writes++;
      evictIfNeeded();
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/**
 * Invalidate every cached entry for a customer, across all users. Returns
 * the number of entries removed. Called after any successful mutation.
 */
export function invalidateCache(customerId: string): number {
  const normalized = normalizeCustomerId(customerId);
  let removed = 0;
  for (const key of cache.keys()) {
    if (keyMatchesCustomer(key, normalized)) {
      cache.delete(key);
      removed++;
    }
  }
  metrics.invalidations += removed;
  return removed;
}

/** Drop every cached entry and clear in-flight tracking. Used by Refresh. */
export function clearCache(): void {
  cache.clear();
  inflight.clear();
}

/** Snapshot of cache metrics for observability. */
export function getCacheMetrics(): CacheMetrics & { size: number; inflight: number } {
  return { ...metrics, size: cache.size, inflight: inflight.size };
}

/** Reset counters without clearing cached data — useful in tests. */
export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.coalesced = 0;
  metrics.writes = 0;
  metrics.evictions = 0;
  metrics.invalidations = 0;
}

/** Test-only helper. Do not call from production code. */
export function __resetCacheForTests(): void {
  clearCache();
  resetCacheMetrics();
}
