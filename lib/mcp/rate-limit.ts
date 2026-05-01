import { db, schema } from "@/lib/db";
import { eq, gte, and, sql } from "drizzle-orm";
import { checkAccess } from "@/lib/subscription";
import {
  FREE_MONTHLY_OP_LIMIT,
  currentFreePeriodStart,
  nextFreePeriodStart,
} from "@/lib/free-quota";

// ─── Config ────────────────────────────────────────────────────────

/** Dev mode bypasses the rate limiter entirely so local development isn't blocked. */
const IS_DEV_BYPASS = process.env.NODE_ENV === "development";

// ─── In-memory cache to avoid DB hit on every tool call ────────────

interface UsageEntry {
  count: number;
  /** Timestamp when this cache entry was fetched from DB */
  fetchedAt: number;
  /** Start of the quota period (ms since epoch) this count is relative to.
   *  Caching by period-start auto-invalidates on rollover — when the period
   *  changes, the cache key mismatches and we re-fetch from the DB. */
  periodStartMs: number;
}

const usageCache = new Map<string, UsageEntry>();

/** Cache entries are valid for 10 seconds */
const CACHE_TTL_MS = 10_000;

/**
 * Count operations for a user since a given period start. Used by both the
 * rate-limit check and the /usage display, so the same definition of
 * "operation" applies to both.
 */
async function getUsageCount(userId: string, periodStart: Date): Promise<number> {
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
function incrementCachedCount(userId: string, periodStart: Date) {
  const periodStartMs = periodStart.getTime();
  const cached = usageCache.get(userId);
  if (cached && cached.periodStartMs === periodStartMs) {
    cached.count++;
  }
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Thrown when a post-trial free user has used all 300 ops in the current
 * 30-day period. Carries used/limit/resetsAt for callers (chat error UI,
 * MCP tool error responses).
 */
export class RateLimitError extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number,
    public readonly resetsAt: Date,
  ) {
    super(
      `Free monthly cap reached (${used}/${limit}). ` +
      `Upgrade to Growth for unlimited operations: https://notfair.co/upgrade. ` +
      `Otherwise the cap resets on ${resetsAt.toISOString().slice(0, 10)}.`,
    );
    this.name = "RateLimitError";
  }
}

/**
 * Access gate.
 *   - Paid users:           pass without DB hit.
 *   - Trial users:          pass without DB hit.
 *   - Free post-trial:      enforce 300 ops / 30-day period (anchored to
 *                           trial_ends_at). Throws RateLimitError when at cap.
 *
 * Call this BEFORE executing the operation. If the subscription lookup
 * itself fails, we fail OPEN — same posture as the old gate, since we'd
 * rather let an op through than block on a transient infra issue.
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
    return;
  }

  // Paid + trial bypass the cap entirely. No DB query.
  if (access.kind === "paid" || access.kind === "trial") return;

  // Free post-trial: enforce the 300-ops cap for the current 30-day period.
  const now = new Date();
  const periodStart = currentFreePeriodStart(access.quotaAnchor, now);
  const used = await getUsageCount(userId, periodStart);
  if (used >= FREE_MONTHLY_OP_LIMIT) {
    const resetsAt = nextFreePeriodStart(access.quotaAnchor, now);
    throw new RateLimitError(used, FREE_MONTHLY_OP_LIMIT, resetsAt);
  }
}

/**
 * Notify the rate limiter that an operation was successfully recorded.
 * Call this AFTER the operation is logged to keep the cache accurate.
 *
 * Best-effort: if the user's tier shifted between enforce + record (or the
 * cache was never warmed), this is a noop and the next enforce hits the DB.
 */
export function recordOperation(userId: string | null | undefined): void {
  if (!userId) return;
  const cached = usageCache.get(userId);
  if (!cached) return;
  // We don't know the user's anchor here, but we know periodStartMs from
  // the cache — increment whatever bucket is currently warm.
  incrementCachedCount(userId, new Date(cached.periodStartMs));
}

export interface UsageInfo {
  used: number;
  /** null when the user has no cap (paid / trial). */
  limit: number | null;
  /** null when the user has no cap (paid / trial). */
  remaining: number | null;
  /** True iff no cap applies (paid / trial). */
  unlimited: boolean;
  /** When the next quota period starts (ISO). For paid/trial: end of trial
   *  if known, else end of an arbitrary 30-day window from now. */
  resetsAt: string;
  /** Start of the current quota period (ISO). */
  periodStart: string;
  /** What tier the user is in — handy for display copy. */
  tier: "paid" | "trial" | "free_post_trial";
}

/**
 * Usage info for the /usage page and the navbar warning banners.
 *
 *   - paid          → unlimited, used = ops in last 30d for context
 *   - trial         → unlimited, used = ops since signup, resetsAt = trial end
 *   - free post-trial → used / 300 in current period, resetsAt = next period start
 */
export async function getUsageInfo(userId: string | null | undefined): Promise<UsageInfo> {
  if (!userId) {
    const now = new Date();
    const periodStart = currentFreePeriodStart(now, now);
    const resetsAt = nextFreePeriodStart(now, now);
    return {
      used: 0,
      limit: FREE_MONTHLY_OP_LIMIT,
      remaining: FREE_MONTHLY_OP_LIMIT,
      unlimited: false,
      resetsAt: resetsAt.toISOString(),
      periodStart: periodStart.toISOString(),
      tier: "free_post_trial",
    };
  }

  let access;
  try {
    access = await checkAccess(userId);
  } catch {
    // Lookup failure → present the user as if on free post-trial with a
    // fresh window starting now. Mirrors enforceRateLimit's fail-open
    // posture but at least gives the UI something to show.
    const now = new Date();
    return {
      used: 0,
      limit: FREE_MONTHLY_OP_LIMIT,
      remaining: FREE_MONTHLY_OP_LIMIT,
      unlimited: false,
      resetsAt: nextFreePeriodStart(now, now).toISOString(),
      periodStart: currentFreePeriodStart(now, now).toISOString(),
      tier: "free_post_trial",
    };
  }

  const now = new Date();

  if (access.kind === "paid") {
    // No cap. Show ops in the last 30d as a contextual usage figure.
    const periodStart = new Date(now.getTime() - 30 * 86_400_000);
    const used = await getUsageCount(userId, periodStart);
    return {
      used,
      limit: null,
      remaining: null,
      unlimited: true,
      resetsAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      periodStart: periodStart.toISOString(),
      tier: "paid",
    };
  }

  if (access.kind === "trial") {
    // Trial: unlimited, but show ops since signup so users can see activity.
    // Counter scope from "ops since trial start" is approximated by the row's
    // createdAt; we don't have it here — fall back to "trial start = trial end - 7d".
    const trialStart = new Date(access.trialEndsAt.getTime() - 7 * 86_400_000);
    const used = await getUsageCount(userId, trialStart);
    return {
      used,
      limit: null,
      remaining: null,
      unlimited: true,
      resetsAt: access.trialEndsAt.toISOString(),
      periodStart: trialStart.toISOString(),
      tier: "trial",
    };
  }

  // Free post-trial: real cap applies.
  const periodStart = currentFreePeriodStart(access.quotaAnchor, now);
  const resetsAt = nextFreePeriodStart(access.quotaAnchor, now);
  const used = await getUsageCount(userId, periodStart);
  return {
    used,
    limit: FREE_MONTHLY_OP_LIMIT,
    remaining: Math.max(0, FREE_MONTHLY_OP_LIMIT - used),
    unlimited: false,
    resetsAt: resetsAt.toISOString(),
    periodStart: periodStart.toISOString(),
    tier: "free_post_trial",
  };
}

/**
 * Daily operation breakdown for the current calendar month (for the /usage
 * chart). Display-only — independent of the quota period used by the rate
 * limiter, because the chart's job is "what did I do recently", not "how
 * close am I to the cap".
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
