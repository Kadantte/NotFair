import { db, schema } from "@/lib/db";
import { eq, gte, and, sql } from "drizzle-orm";
import { checkAccess } from "@/lib/subscription";

// ─── Config ────────────────────────────────────────────────────────

/** Dev mode bypasses the trial gate entirely so local development isn't blocked. */
const IS_DEV_BYPASS = process.env.NODE_ENV === "development";

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
        // Count rows that represent actual Google API work: success (null
        // errorClass) and writes Google rejected (WRITE_REJECTED — the call
        // still went out, the API still processed it).
        //
        // Excluded so the user isn't billed for work they didn't do:
        //  - THROWN: infra failure, matches execWrite's "propagate uncounted"
        //    policy (see execute.test.ts: "throws from fn() propagate without
        //    counting").
        //  - RATE_LIMIT: the rejection never touched Google. Including these
        //    would let a rate-limited retry loop self-compound the overage.
        sql`(${schema.operations.errorClass} IS NULL OR ${schema.operations.errorClass} = 'WRITE_REJECTED')`,
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

/**
 * Thrown when a free user's 7-day trial has ended. Same Error name
 * (`RateLimitError`) as before so existing catch-by-instanceof sites keep
 * working — only the message and shape have changed.
 */
export class RateLimitError extends Error {
  constructor(public readonly trialEndsAt: Date | null) {
    super(
      `Free trial ended. Upgrade to Growth to continue using NotFair: https://notfair.co/upgrade.`,
    );
    this.name = "RateLimitError";
  }
}

/**
 * Access gate. Paid users always pass; free users pass while in their 7-day
 * trial. Throws RateLimitError once the trial has expired.
 *
 * Call this BEFORE executing the operation.
 *
 * @param userId - The user's ID. If null/undefined (anonymous), the gate is
 *                 skipped — anonymous callers have other guards.
 */
export async function enforceRateLimit(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  if (IS_DEV_BYPASS) return;

  let access;
  try {
    access = await checkAccess(userId);
  } catch {
    // If the subscription lookup fails (e.g. table missing in tests), let the
    // call through rather than fail-closing — same posture as the old gate.
    return;
  }

  if (!access.ok) {
    throw new RateLimitError(access.trialEndsAt);
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
 * Get current usage info for a user (for display purposes on /usage).
 * Now decoupled from billing — counts ops in the current calendar month
 * regardless of plan, with `unlimited` always true (no monthly cap exists).
 */
export async function getUsageInfo(userId: string | null | undefined) {
  const resetsAt = nextPeriodStart().toISOString();
  const periodStart = currentPeriodStart().toISOString();

  if (!userId) {
    return {
      used: 0,
      limit: null,
      remaining: null,
      unlimited: true,
      resetsAt,
      periodStart,
    };
  }
  const used = await getUsageCount(userId);
  return {
    used,
    limit: null,
    remaining: null,
    unlimited: true,
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
