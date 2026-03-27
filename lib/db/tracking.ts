import { db, schema } from "./index";
import { eq, and, gt, gte, lte, desc } from "drizzle-orm";
import type { WriteResult } from "@/lib/google-ads";

// ─── Change Logging ──────────────────────────────────────────────────

export async function logChange(
  accountId: string,
  campaignId: string | null,
  writeResult: WriteResult,
  reasoning?: string,
) {
  try {
    const [inserted] = await db()
      .insert(schema.changes)
      .values({
        accountId,
        campaignId,
        toolName: writeResult.action,
        entityType: getEntityType(writeResult.action),
        entityId: writeResult.entityId,
        beforeValue: writeResult.beforeValue,
        afterValue: writeResult.afterValue,
        reasoning: reasoning ?? null,
      })
      .returning();

    return inserted;
  } catch (error) {
    // CRITICAL: Log error but don't throw — the write operation already succeeded
    console.error("[tracking] Failed to log change:", error);
    return null;
  }
}

function getEntityType(action: string): string {
  if (action.includes("keyword") || action.includes("bid")) return "keyword";
  if (action.includes("campaign") || action.includes("budget")) return "campaign";
  return "unknown";
}

// ─── Change History ──────────────────────────────────────────────────

export async function getChanges(
  accountId: string,
  options: { limit?: number; campaignId?: string } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const conditions = [eq(schema.changes.accountId, accountId)];
  if (options.campaignId) {
    conditions.push(eq(schema.changes.campaignId, options.campaignId));
  }

  const rows = await db()
    .select()
    .from(schema.changes)
    .where(and(...conditions))
    .orderBy(desc(schema.changes.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    action: row.toolName,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeValue: row.beforeValue,
    afterValue: row.afterValue,
    reasoning: row.reasoning,
    timestamp: row.createdAt,
  }));
}

// ─── Impact Attribution ──────────────────────────────────────────────

export async function getImpact(
  accountId: string,
  changeId: number,
) {
  // Get the change record
  const [change] = await db()
    .select()
    .from(schema.changes)
    .where(
      and(
        eq(schema.changes.id, changeId),
        eq(schema.changes.accountId, accountId),
      ),
    )
    .limit(1);

  if (!change) return null;
  if (!change.campaignId) return { change, impact: null, reason: "No campaign associated" };

  const changeDate = change.createdAt;
  const changeDateStr = changeDate.toISOString().slice(0, 10);

  // Get 7-day average BEFORE the change
  const sevenDaysBefore = new Date(changeDate);
  sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
  const beforeDateStr = sevenDaysBefore.toISOString().slice(0, 10);

  const beforeSnapshots = await db()
    .select()
    .from(schema.performanceSnapshots)
    .where(
      and(
        eq(schema.performanceSnapshots.accountId, accountId),
        eq(schema.performanceSnapshots.campaignId, change.campaignId),
        gte(schema.performanceSnapshots.snapshotDate, beforeDateStr),
        lte(schema.performanceSnapshots.snapshotDate, changeDateStr),
      ),
    );

  // Get 7-day average AFTER the change
  const sevenDaysAfter = new Date(changeDate);
  sevenDaysAfter.setDate(sevenDaysAfter.getDate() + 7);
  const afterDateStr = sevenDaysAfter.toISOString().slice(0, 10);

  const afterSnapshots = await db()
    .select()
    .from(schema.performanceSnapshots)
    .where(
      and(
        eq(schema.performanceSnapshots.accountId, accountId),
        eq(schema.performanceSnapshots.campaignId, change.campaignId),
        gte(schema.performanceSnapshots.snapshotDate, changeDateStr),
        lte(schema.performanceSnapshots.snapshotDate, afterDateStr),
      ),
    );

  if (beforeSnapshots.length === 0 || afterSnapshots.length === 0) {
    return {
      change,
      impact: null,
      reason: "Insufficient snapshot data for comparison (need at least 7 days before and after)",
    };
  }

  const avgBefore = average(beforeSnapshots);
  const avgAfter = average(afterSnapshots);

  return {
    change: {
      id: change.id,
      action: change.toolName,
      entityId: change.entityId,
      timestamp: change.createdAt,
    },
    impact: {
      before: avgBefore,
      after: avgAfter,
      cpaDelta: avgAfter.cpa !== null && avgBefore.cpa !== null
        ? avgAfter.cpa - avgBefore.cpa
        : null,
      costDelta: avgAfter.dailyCost - avgBefore.dailyCost,
      conversionsDelta: avgAfter.dailyConversions - avgBefore.dailyConversions,
      // Attribution language: always estimated, never causal
      disclaimer: "These changes are correlated with the action taken. Other factors (seasonality, competitor bids, Google's algorithm) may have contributed.",
    },
  };
}

function average(snapshots: typeof schema.performanceSnapshots.$inferSelect[]) {
  const n = snapshots.length;
  if (n === 0) return { dailyCost: 0, dailyConversions: 0, cpa: null };

  const totalCost = snapshots.reduce((sum, s) => sum + (s.costMicros ?? 0), 0) / 1_000_000;
  const totalConversions = snapshots.reduce((sum, s) => sum + (s.conversions ?? 0), 0);

  return {
    dailyCost: totalCost / n,
    dailyConversions: totalConversions / n,
    cpa: totalConversions > 0 ? totalCost / totalConversions : null,
  };
}

// ─── Undo ────────────────────────────────────────────────────────────

const UNDO_WINDOW_DAYS = 7;

/** Actions that map to a reverse Google Ads mutation. */
const REVERSIBLE_ACTIONS: Record<string, string> = {
  pause_keyword: "enable_keyword",
  enable_keyword: "pause_keyword",
  pause_campaign: "enable_campaign",
  enable_campaign: "pause_campaign",
  update_bid: "update_bid",
  update_budget: "update_budget",
  add_negative_keyword: "remove_negative_keyword",
  remove_negative_keyword: "add_negative_keyword",
};

export async function getUndoableChange(accountId: string, changeId: number) {
  const [change] = await db()
    .select()
    .from(schema.changes)
    .where(
      and(
        eq(schema.changes.id, changeId),
        eq(schema.changes.accountId, accountId),
      ),
    )
    .limit(1);

  if (!change) return { error: "Change not found" };
  if (change.rolledBack) return { error: "Change was already undone" };

  // Check undo window
  const ageMs = Date.now() - change.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > UNDO_WINDOW_DAYS) {
    return { error: `Change is ${Math.floor(ageDays)} days old. Undo window is ${UNDO_WINDOW_DAYS} days.` };
  }

  // Check reversibility
  if (!REVERSIBLE_ACTIONS[change.toolName]) {
    return { error: `Action "${change.toolName}" is not reversible` };
  }

  // Check if entity was modified after this change (stale undo guard)
  const staleConditions = [
    gt(schema.changes.id, changeId),
    eq(schema.changes.accountId, accountId),
    eq(schema.changes.entityType, change.entityType),
    eq(schema.changes.entityId, change.entityId),
    eq(schema.changes.rolledBack, 0),
  ];
  if (change.campaignId) {
    staleConditions.push(eq(schema.changes.campaignId, change.campaignId));
  }
  const [laterChange] = await db()
    .select({ id: schema.changes.id, createdAt: schema.changes.createdAt })
    .from(schema.changes)
    .where(and(...staleConditions))
    .limit(1);

  if (laterChange) {
    return {
      error: `Entity was modified after this change (change #${laterChange.id} on ${laterChange.createdAt.toISOString()}). Undo would overwrite a more recent change. Undo the later change first, or apply the desired state directly.`,
    };
  }

  return { change };
}

export async function markRolledBack(changeId: number) {
  await db()
    .update(schema.changes)
    .set({ rolledBack: 1 })
    .where(eq(schema.changes.id, changeId));
}

// ─── Goals ───────────────────────────────────────────────────────────

export async function setGoals(
  accountId: string,
  campaignId: string | null,
  goals: {
    targetCpa?: number;
    monthlyCap?: number;
    maxBidChangePct?: number;
    maxBudgetChangePct?: number;
    maxKeywordPausePct?: number;
  },
) {
  const effectiveCampaignId = campaignId ?? "";

  const [result] = await db()
    .insert(schema.goals)
    .values({
      accountId,
      campaignId: effectiveCampaignId,
      ...goals,
    })
    .onConflictDoUpdate({
      target: [schema.goals.accountId, schema.goals.campaignId],
      set: { ...goals, updatedAt: new Date() },
    })
    .returning();

  return result;
}

export async function getGoals(accountId: string, campaignId?: string) {
  // Get campaign-specific goals first, fall back to account-level
  if (campaignId) {
    const campaignGoals = await db()
      .select()
      .from(schema.goals)
      .where(
        and(
          eq(schema.goals.accountId, accountId),
          eq(schema.goals.campaignId, campaignId),
        ),
      )
      .limit(1);

    if (campaignGoals.length > 0) return campaignGoals[0];
  }

  // Account-level default
  const accountGoals = await db()
    .select()
    .from(schema.goals)
    .where(
      and(
        eq(schema.goals.accountId, accountId),
        eq(schema.goals.campaignId, ""),
      ),
    )
    .limit(1);

  return accountGoals[0] ?? null;
}
