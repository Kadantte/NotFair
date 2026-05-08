import "server-only";

import { db, schema } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserSubscription, type PlanKey } from "@/lib/subscription";

// Per-plan monthly generation limits.
export const MONTHLY_LIMITS: Record<PlanKey, number> = {
  free: 3,
  growth: 100,
};

export type QuotaState = {
  plan: PlanKey;
  limit: number;
  used: number;
  remaining: number;
  yearMonth: string;
};

/**
 * Returns the current year-month string in 'YYYY-MM' format for the
 * given date (defaults to now). Used as the row key in design_usage_monthly.
 */
export function currentYearMonth(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function resolvePlanAndLimit(userId: string): Promise<{ plan: PlanKey; limit: number; yearMonth: string }> {
  const sub = await getUserSubscription(userId);
  const plan = sub.plan;
  const limit = MONTHLY_LIMITS[plan] ?? MONTHLY_LIMITS.free;
  return { plan, limit, yearMonth: currentYearMonth() };
}

/**
 * Return the current quota state for a user without modifying anything.
 */
export async function getQuotaState(userId: string): Promise<QuotaState> {
  const { plan, limit, yearMonth } = await resolvePlanAndLimit(userId);

  const [row] = await db()
    .select({ count: schema.designUsageMonthly.count })
    .from(schema.designUsageMonthly)
    .where(
      and(
        eq(schema.designUsageMonthly.userId, userId),
        eq(schema.designUsageMonthly.yearMonth, yearMonth),
      ),
    )
    .limit(1);

  const used = row?.count ?? 0;
  return { plan, limit, used, remaining: Math.max(0, limit - used), yearMonth };
}

/**
 * Check whether the user has remaining quota for this month. If yes,
 * atomically increment the count and return the new state. If no,
 * throws an error with a human-readable message that is safe to surface
 * to the MCP caller.
 *
 * Uses PostgreSQL INSERT ... ON CONFLICT DO UPDATE with a WHERE guard to
 * ensure the increment only succeeds when the count is still below the
 * limit. This makes the check-and-increment atomic and race-condition-safe
 * without advisory locks.
 */
export async function checkAndIncrementQuota(userId: string): Promise<QuotaState> {
  const { plan, limit, yearMonth } = await resolvePlanAndLimit(userId);

  // Atomic upsert with limit guard. The WHERE on DO UPDATE blocks the
  // increment when the row already exists at the limit. Drizzle has no
  // first-class WHERE-on-update for ON CONFLICT, so this is raw SQL.
  const result = await db().execute(sql`
    INSERT INTO design_usage_monthly (user_id, year_month, count, updated_at)
    VALUES (${userId}, ${yearMonth}, 1, NOW())
    ON CONFLICT (user_id, year_month) DO UPDATE
      SET count = design_usage_monthly.count + 1,
          updated_at = NOW()
      WHERE design_usage_monthly.count < ${limit}
    RETURNING count
  `);

  const rows = result as unknown as Array<{ count: number }>;
  if (!rows || rows.length === 0) {
    // WHERE guard blocked the update → user is at their limit.
    throw new Error(
      `Monthly image generation limit reached (${limit}/${limit} for ${plan} plan). ` +
      `Upgrade to a higher plan at notfair.co/upgrade for more generations.`,
    );
  }

  const newCount = rows[0].count;
  return {
    plan,
    limit,
    used: newCount,
    remaining: Math.max(0, limit - newCount),
    yearMonth,
  };
}

/**
 * Decrement the user's monthly count by 1, never below zero. Called on
 * downstream failure (image gen / storage error) to release a quota slot
 * reserved by `checkAndIncrementQuota`. Idempotent on a missing row —
 * a missing row means count=0 already.
 */
export async function releaseQuota(userId: string): Promise<void> {
  const yearMonth = currentYearMonth();
  await db().execute(sql`
    UPDATE design_usage_monthly
       SET count = GREATEST(count - 1, 0),
           updated_at = NOW()
     WHERE user_id = ${userId}
       AND year_month = ${yearMonth}
  `);
}
