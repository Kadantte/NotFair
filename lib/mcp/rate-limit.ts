import { db, schema } from "@/lib/db";
import { eq, gte, and, sql } from "drizzle-orm";

// ─── Config ────────────────────────────────────────────────────────

const DAILY_OP_LIMIT = process.env.NODE_ENV === "development" ? 999999 : 300;

// ─── In-memory cache to avoid DB hit on every tool call ────────────

interface UsageEntry {
  count: number;
  /** Timestamp when this cache entry was fetched from DB */
  fetchedAt: number;
  /** Midnight UTC that this count is relative to */
  resetAt: number;
}

const usageCache = new Map<string, UsageEntry>();

/** Cache entries are valid for 10 seconds */
const CACHE_TTL_MS = 10_000;

/** Get midnight UTC for today */
function todayMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Count operations for a user since midnight UTC today.
 * Uses a short-lived in-memory cache to reduce DB pressure.
 */
async function getUsageCount(userId: string): Promise<number> {
  const midnight = todayMidnightUTC();
  const midnightMs = midnight.getTime();
  const now = Date.now();

  const cached = usageCache.get(userId);
  if (
    cached &&
    cached.resetAt === midnightMs &&
    now - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return cached.count;
  }

  // Query DB for today's operation count
  const [result] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.userId, userId),
        gte(schema.operations.createdAt, midnight),
      ),
    );

  const count = Number(result?.count ?? 0);
  usageCache.set(userId, { count, fetchedAt: now, resetAt: midnightMs });
  return count;
}

/** Increment the cached count after a successful operation (avoids stale reads). */
function incrementCachedCount(userId: string) {
  const midnightMs = todayMidnightUTC().getTime();
  const cached = usageCache.get(userId);
  if (cached && cached.resetAt === midnightMs) {
    cached.count++;
  }
}

// ─── Public API ────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number,
  ) {
    const ms = nextMidnightUTC().getTime() - Date.now();
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.ceil((ms % 3_600_000) / 60_000);
    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    super(
      `Daily operation limit reached (${used}/${limit}). ` +
      `Your limit resets in ${timeStr} (midnight UTC). ` +
      `Check your usage at /usage.`,
    );
    this.name = "RateLimitError";
  }
}

function nextMidnightUTC(): Date {
  const m = todayMidnightUTC();
  m.setUTCDate(m.getUTCDate() + 1);
  return m;
}

/**
 * Check if the user is within their daily operation limit.
 * Throws RateLimitError if the limit is exceeded.
 * Call this BEFORE executing the operation.
 *
 * @param userId - The user's ID. If null/undefined (anonymous), rate limiting is skipped.
 */
export async function enforceRateLimit(userId: string | null | undefined): Promise<void> {
  if (!userId) return; // Anonymous users are not rate-limited (they have other guards)

  const used = await getUsageCount(userId);
  if (used >= DAILY_OP_LIMIT) {
    throw new RateLimitError(used, DAILY_OP_LIMIT);
  }
}

/**
 * Notify the rate limiter that an operation was successfully recorded.
 * Call this AFTER the operation is logged to keep the cache accurate.
 */
export function recordOperation(userId: string | null | undefined): void {
  if (!userId) return;
  incrementCachedCount(userId);
}

/**
 * Get current usage info for a user (for display purposes).
 */
export async function getUsageInfo(userId: string | null | undefined) {
  if (!userId) return { used: 0, limit: DAILY_OP_LIMIT, remaining: DAILY_OP_LIMIT, resetsAt: nextMidnightUTC().toISOString() };
  const used = await getUsageCount(userId);
  return { used, limit: DAILY_OP_LIMIT, remaining: Math.max(0, DAILY_OP_LIMIT - used), resetsAt: nextMidnightUTC().toISOString() };
}

/**
 * Get hourly operation breakdown for the current day (for usage chart).
 */
export async function getHourlyUsage(userId: string | null | undefined) {
  if (!userId) return [];

  const midnight = todayMidnightUTC();

  const rows = await db()
    .select({
      hour: sql<number>`extract(hour from ${schema.operations.createdAt})`,
      count: sql<number>`count(*)`,
    })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.userId, userId),
        gte(schema.operations.createdAt, midnight),
      ),
    )
    .groupBy(sql`extract(hour from ${schema.operations.createdAt})`)
    .orderBy(sql`extract(hour from ${schema.operations.createdAt})`);

  // Fill all 24 hours
  const hourMap = new Map(rows.map((r) => [Number(r.hour), Number(r.count)]));
  const nowHour = new Date().getUTCHours();
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourMap.get(h) ?? 0,
    isCurrent: h === nowHour,
  }));
}
