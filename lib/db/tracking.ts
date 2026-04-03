import { db, schema } from "./index";
import { eq, and, gt, gte, lte, desc, sql } from "drizzle-orm";
import type { WriteResult } from "@/lib/google-ads";

// ─── Compact Code Maps ──────────────────────────────────────────────

export const OP_TYPE = { READ: 0, WRITE: 1 } as const;

/** Tool name → compact code. Add new tools at the end to preserve existing data. */
export const TOOL_CODE = {
  // Writes
  pause_keyword: 0,
  enable_keyword: 1,
  update_bid: 2,
  add_negative_keyword: 3,
  remove_negative_keyword: 4,
  update_budget: 5,
  pause_campaign: 6,
  enable_campaign: 7,
  undo: 8,
  create_campaign: 9,
  remove_campaign: 10,
  add_keyword: 11,
  remove_keyword: 12,
  set_tracking_template: 13,
  create_ad_group: 14,
  create_ad: 15,
  pause_ad: 16,
  enable_ad: 17,
  update_ad_final_url: 18,
  update_ad_assets: 19,
  // Campaign settings (compound — separate actions for networks vs location)
  update_campaign_networks: 36,
  add_campaign_location: 37,
  remove_campaign_location: 38,
  rename_campaign: 39,
  rename_ad_group: 40,
  // Reads (20+)
  get_account_info: 20,
  list_campaigns: 21,
  get_campaign_performance: 22,
  get_keywords: 23,
  get_search_term_report: 24,
  run_gaql_query: 25,
  get_changes: 26,
  list_accessible_customers: 27,
  get_tracking_template: 28,
  list_ad_groups: 29,
  list_ads: 30,
  get_impression_share: 31,
  get_conversion_actions: 32,
  get_account_settings: 33,
  get_campaign_settings: 34,
  get_recommendations: 35,
} as const;

type ToolCode = (typeof TOOL_CODE)[keyof typeof TOOL_CODE];

/** Reverse lookup: code → tool name */
const CODE_TO_TOOL: Record<number, string> = Object.fromEntries(
  Object.entries(TOOL_CODE).map(([name, code]) => [code, name]),
);

export const ENTITY_CODE = {
  keyword: 0,
  campaign: 1,
  unknown: 2,
} as const;

const CODE_TO_ENTITY: Record<number, string> = Object.fromEntries(
  Object.entries(ENTITY_CODE).map(([name, code]) => [code, name]),
);

/** Resolve tool name string to its compact code. Returns undefined for unknown tools. */
export function toolNameToCode(name: string): ToolCode | undefined {
  return (TOOL_CODE as Record<string, ToolCode>)[name];
}

function getEntityCode(action: string): number {
  if (action.includes("keyword") || action.includes("bid")) return ENTITY_CODE.keyword;
  if (action.includes("campaign") || action.includes("budget")) return ENTITY_CODE.campaign;
  return ENTITY_CODE.unknown;
}

// ─── Write Logging ──────────────────────────────────────────────────

export async function logChange(
  accountId: string,
  userId: string | null | undefined,
  campaignId: string | null,
  writeResult: WriteResult,
  reasoning?: string,
) {
  try {
    const code = toolNameToCode(writeResult.action);
    if (code === undefined) {
      console.error(`[tracking] Unknown tool name: ${writeResult.action}`);
      return null;
    }

    const [inserted] = await db()
      .insert(schema.operations)
      .values({
        accountId,
        userId: userId ?? null,
        campaignId,
        opType: OP_TYPE.WRITE,
        toolCode: code,
        entityCode: getEntityCode(writeResult.action),
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

// ─── Read Logging ───────────────────────────────────────────────────

export async function logRead(
  accountId: string,
  userId: string | null | undefined,
  toolName: string,
  campaignId?: string | null,
) {
  try {
    const code = toolNameToCode(toolName);
    if (code === undefined) return;

    await db()
      .insert(schema.operations)
      .values({
        accountId,
        userId: userId ?? null,
        campaignId: campaignId ?? null,
        opType: OP_TYPE.READ,
        toolCode: code,
      });
  } catch (error) {
    // Never block read operations for logging failures
    console.error("[tracking] Failed to log read:", error);
  }
}

// ─── Change History ─────────────────────────────────────────────────

export async function getChanges(
  accountId: string,
  options: { limit?: number; offset?: number; campaignId?: string } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions = [
    eq(schema.operations.accountId, accountId),
    eq(schema.operations.opType, OP_TYPE.WRITE),
  ];
  if (options.campaignId) {
    conditions.push(eq(schema.operations.campaignId, options.campaignId));
  }

  const [rows, countResult] = await Promise.all([
    db()
      .select()
      .from(schema.operations)
      .where(and(...conditions))
      .orderBy(desc(schema.operations.createdAt))
      .limit(limit)
      .offset(offset),
    db()
      .select({ count: sql<number>`count(*)` })
      .from(schema.operations)
      .where(and(...conditions)),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: CODE_TO_TOOL[row.toolCode] ?? `unknown_${row.toolCode}`,
      entityType: CODE_TO_ENTITY[row.entityCode ?? ENTITY_CODE.unknown] ?? "unknown",
      entityId: row.entityId ?? "",
      beforeValue: row.beforeValue ?? "",
      afterValue: row.afterValue ?? "",
      reasoning: row.reasoning,
      rolledBack: row.rolledBack === 1,
      timestamp: row.createdAt,
    })),
    total: Number(countResult[0]?.count ?? 0),
  };
}

// ─── Impact Attribution ─────────────────────────────────────────────

export async function getImpact(
  accountId: string,
  changeId: number,
) {
  // Get the change record
  const [change] = await db()
    .select()
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.id, changeId),
        eq(schema.operations.accountId, accountId),
        eq(schema.operations.opType, OP_TYPE.WRITE),
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
      action: CODE_TO_TOOL[change.toolCode] ?? `unknown_${change.toolCode}`,
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

// ─── Undo ───────────────────────────────────────────────────────────

const UNDO_WINDOW_DAYS = 7;

/** Actions that map to a reverse Google Ads mutation. */
const REVERSIBLE_ACTIONS: Record<number, number> = {
  [TOOL_CODE.pause_keyword]: TOOL_CODE.enable_keyword,
  [TOOL_CODE.enable_keyword]: TOOL_CODE.pause_keyword,
  [TOOL_CODE.pause_campaign]: TOOL_CODE.enable_campaign,
  [TOOL_CODE.enable_campaign]: TOOL_CODE.pause_campaign,
  [TOOL_CODE.update_bid]: TOOL_CODE.update_bid,
  [TOOL_CODE.update_budget]: TOOL_CODE.update_budget,
  [TOOL_CODE.add_negative_keyword]: TOOL_CODE.remove_negative_keyword,
  [TOOL_CODE.remove_negative_keyword]: TOOL_CODE.add_negative_keyword,
  [TOOL_CODE.create_campaign]: TOOL_CODE.remove_campaign,
  [TOOL_CODE.add_keyword]: TOOL_CODE.remove_keyword,
  [TOOL_CODE.set_tracking_template]: TOOL_CODE.set_tracking_template,
  [TOOL_CODE.pause_ad]: TOOL_CODE.enable_ad,
  [TOOL_CODE.enable_ad]: TOOL_CODE.pause_ad,
  [TOOL_CODE.update_ad_final_url]: TOOL_CODE.update_ad_final_url,
  [TOOL_CODE.update_ad_assets]: TOOL_CODE.update_ad_assets,
  [TOOL_CODE.create_ad]: TOOL_CODE.pause_ad,
  [TOOL_CODE.update_campaign_networks]: TOOL_CODE.update_campaign_networks,
  [TOOL_CODE.rename_campaign]: TOOL_CODE.rename_campaign,
  [TOOL_CODE.rename_ad_group]: TOOL_CODE.rename_ad_group,
};

export async function getUndoableChange(accountId: string, changeId: number) {
  const [change] = await db()
    .select()
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.id, changeId),
        eq(schema.operations.accountId, accountId),
        eq(schema.operations.opType, OP_TYPE.WRITE),
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
  const toolName = CODE_TO_TOOL[change.toolCode];
  if (REVERSIBLE_ACTIONS[change.toolCode] === undefined) {
    return { error: `Action "${toolName}" is not reversible` };
  }

  // Check if entity was modified after this change (stale undo guard)
  const staleConditions = [
    gt(schema.operations.id, changeId),
    eq(schema.operations.accountId, accountId),
    eq(schema.operations.opType, OP_TYPE.WRITE),
  ];
  if (change.entityCode !== null && change.entityCode !== undefined) {
    staleConditions.push(eq(schema.operations.entityCode, change.entityCode));
  }
  if (change.entityId) {
    staleConditions.push(eq(schema.operations.entityId, change.entityId));
  }
  if (change.rolledBack !== null) {
    staleConditions.push(eq(schema.operations.rolledBack, 0));
  }
  if (change.campaignId) {
    staleConditions.push(eq(schema.operations.campaignId, change.campaignId));
  }
  const [laterChange] = await db()
    .select({ id: schema.operations.id, createdAt: schema.operations.createdAt })
    .from(schema.operations)
    .where(and(...staleConditions))
    .limit(1);

  if (laterChange) {
    return {
      error: `Entity was modified after this change (change #${laterChange.id} on ${laterChange.createdAt.toISOString()}). Undo would overwrite a more recent change. Undo the later change first, or apply the desired state directly.`,
    };
  }

  // Return change with toolName decoded for callers that need the string
  return {
    change: {
      ...change,
      toolName: toolName ?? `unknown_${change.toolCode}`,
    },
  };
}

export async function markRolledBack(changeId: number) {
  await db()
    .update(schema.operations)
    .set({ rolledBack: 1 })
    .where(eq(schema.operations.id, changeId));
}

// ─── Goals ──────────────────────────────────────────────────────────

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
