import { db, schema } from "@/lib/db";
import { eq, gte, and, sql } from "drizzle-orm";
import { getUserPlanLimits, PLANS } from "@/lib/subscription";

// ─── Config ────────────────────────────────────────────────────────

/** Default cap for users on the Free plan (used only when subscription lookup fails). */
const FREE_MONTHLY_OP_LIMIT = PLANS.free.limits.monthlyOpLimit ?? 300;

/** Dev mode bypasses the monthly cap entirely so local development isn't gated. */
const IS_DEV_BYPASS = process.env.NODE_ENV === "development";

/**
 * Resolve a user's effective monthly op limit. `null` = unlimited.
 */
async function resolveMonthlyLimit(userId: string): Promise<number | null> {
  if (IS_DEV_BYPASS) return null;
  // return 10
  try {
    const limits = await getUserPlanLimits(userId);
    return limits.monthlyOpLimit;
  } catch {
    // If subscription lookup fails (e.g. table missing in tests), fall back to free.
    return FREE_MONTHLY_OP_LIMIT;
  }
}

// ─── In-memory cache to avoid DB hit on every tool call ────────────

interface UsageEntry {
  count: number;
  /** Timestamp when this cache entry was fetched from DB */
  fetchedAt: number;
  /** Start of the billing period (ms since epoch) this count is relative to */
  periodStartMs: number;
}

const usageCache = new Map<string, UsageEntry>();

/** Cache entries are valid for 10 seconds */
const CACHE_TTL_MS = 10_000;

/** First of the current month (UTC). */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First of next calendar month (UTC). */
function nextPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Count operations for a user since the start of the current billing period.
 * Uses a short-lived in-memory cache to reduce DB pressure.
 */
async function getUsageCount(userId: string): Promise<number> {
  const periodStart = currentPeriodStart();
  const periodStartMs = periodStart.getTime();
  const now = Date.now();

  const cached = usageCache.get(userId);
  if (
    cached &&
    cached.periodStartMs === periodStartMs &&
    now - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return cached.count;
  }

  const [result] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.userId, userId),
        gte(schema.operations.createdAt, periodStart),
      ),
    );

  const count = Number(result?.count ?? 0);
  usageCache.set(userId, { count, fetchedAt: now, periodStartMs });
  return count;
}

/** Increment the cached count after a successful operation (avoids stale reads). */
function incrementCachedCount(userId: string) {
  const periodStartMs = currentPeriodStart().getTime();
  const cached = usageCache.get(userId);
  if (cached && cached.periodStartMs === periodStartMs) {
    cached.count++;
  }
}

// ─── Public API ────────────────────────────────────────────────────

function formatResetHint(): string {
  const ms = nextPeriodStart().getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.ceil((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export class RateLimitError extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number,
  ) {
    super(
      `Monthly operation limit reached (${used}/${limit}). ` +
      `Upgrade to Growth for unlimited operations: https://adsagent.org/upgrade. ` +
      `Otherwise your limit resets in ${formatResetHint()} (first of next month, UTC). ` +
      `Check your usage at https://adsagent.org/usage.`,
    );
    this.name = "RateLimitError";
  }
}

/**
 * Check if the user is within their monthly operation limit.
 * Throws RateLimitError if the limit is exceeded.
 * Call this BEFORE executing the operation.
 *
 * @param userId - The user's ID. If null/undefined (anonymous), rate limiting is skipped.
 */
export async function enforceRateLimit(userId: string | null | undefined): Promise<void> {
  if (!userId) return; // Anonymous users are not rate-limited (they have other guards)

  const limit = await resolveMonthlyLimit(userId);
  if (limit === null) return; // Unlimited plan (Growth+)

  const used = await getUsageCount(userId);
  if (used >= limit) {
    throw new RateLimitError(used, limit);
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
  const resetsAt = nextPeriodStart().toISOString();
  const periodStart = currentPeriodStart().toISOString();

  if (!userId) {
    return {
      used: 0,
      limit: FREE_MONTHLY_OP_LIMIT,
      remaining: FREE_MONTHLY_OP_LIMIT,
      unlimited: false,
      resetsAt,
      periodStart,
    };
  }
  const limit = await resolveMonthlyLimit(userId);
  const used = await getUsageCount(userId);
  if (limit === null) {
    return {
      used,
      limit: null,
      remaining: null,
      unlimited: true,
      resetsAt,
      periodStart,
    };
  }
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    unlimited: false,
    resetsAt,
    periodStart,
  };
}

/**
 * Daily operation breakdown for the current calendar month (for usage chart).
 * Returns one entry for every day of the month (1 → last day), regardless of
 * whether that day has passed. Future days have count 0.
 *
 * Display-only — independent of the quota cutover used by `getUsageCount`.
 */
export async function getDailyUsage(userId: string | null | undefined) {
  if (!userId) return [];

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const todayUtcIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);

  const rows = await db()
    .select({
      day: sql<string>`to_char(${schema.operations.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
    })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.userId, userId),
        gte(schema.operations.createdAt, monthStart),
      ),
    )
    .groupBy(sql`to_char(${schema.operations.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${schema.operations.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`);

  const countByDay = new Map<string, number>(rows.map((r) => [String(r.day), Number(r.count)]));

  const result: { date: string; day: number; count: number; isCurrent: boolean }[] = [];
  for (
    let d = new Date(monthStart.getTime());
    d.getTime() < monthEnd.getTime();
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const iso = d.toISOString().slice(0, 10);
    result.push({
      date: iso,
      day: d.getUTCDate(),
      count: countByDay.get(iso) ?? 0,
      isCurrent: iso === todayUtcIso,
    });
  }
  return result;
}
