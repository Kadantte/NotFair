import { db, schema } from "./index";
import { eq, and, gt, gte, lt, lte, desc, inArray, sql } from "drizzle-orm";
import type { WriteResult } from "@/lib/google-ads";
import { maybeFireRedditFirstWrite } from "@/lib/reddit-first-write";
import {
  IMPACT_CORRELATION_DISCLAIMER,
  IMPACT_WINDOW_DAYS,
  MIN_AFTER_DAYS_FOR_DIRECTION,
  computeChangeImpactReview,
  computeSnapshotImpact,
  type ChangeRow,
  type ReviewChangeImpact,
  type SnapshotRow,
} from "./impact";

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
  update_bidding: 41,
  update_goal_config: 42,
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
  review_change_impact: 43,
} as const;

type ToolCode = (typeof TOOL_CODE)[keyof typeof TOOL_CODE];

/** Reverse lookup: code → tool name */
export const CODE_TO_TOOL: Record<number, string> = Object.fromEntries(
  Object.entries(TOOL_CODE).map(([name, code]) => [code, name]),
);

export const ENTITY_CODE = {
  keyword: 0,
  campaign: 1,
  unknown: 2,
} as const;

export const CODE_TO_ENTITY: Record<number, string> = Object.fromEntries(
  Object.entries(ENTITY_CODE).map(([name, code]) => [code, name]),
);

/** Resolve tool name string to its compact code. Returns undefined for unknown tools. */
export function toolNameToCode(name: string): ToolCode | undefined {
  return (TOOL_CODE as Record<string, ToolCode>)[name];
}

function getEntityCode(action: string): number {
  if (action.includes("keyword") || action.includes("bid")) return ENTITY_CODE.keyword;
  if (action.includes("campaign") || action.includes("budget") || action.includes("goal_config")) return ENTITY_CODE.campaign;
  return ENTITY_CODE.unknown;
}

// ─── Per-call telemetry (captured at the MCP boundary) ─────────────

export const ERROR_CLASS = {
  THROWN: "THROWN",
  RATE_LIMIT: "RATE_LIMIT",
  WRITE_REJECTED: "WRITE_REJECTED",
  LOGGING: "LOGGING",
} as const;

export type ErrorClass = (typeof ERROR_CLASS)[keyof typeof ERROR_CLASS];

export type CallTelemetry = {
  sessionId?: number | null;
  requestId?: string | null;
  /** Raw camelCase MCP tool name (e.g. "listCampaigns"). */
  toolName?: string | null;
  /** Already-redacted args object (see lib/db/redact.ts). */
  args?: unknown;
  argsSha256?: string | null;
  latencyMs?: number | null;
  bytesOut?: number | null;
  errorClass?: ErrorClass | null;
  /**
   * Human-readable error message for non-success telemetry rows. Populated
   * alongside `errorClass` for THROWN / RATE_LIMIT paths so dashboards don't
   * see `error_class='THROWN'` with `error_message=NULL`. Callers should
   * normalize unknowns through `extractErrorMessage` before setting.
   */
  errorMessage?: string | null;
};

/**
 * Resolve a human-readable action label from an operations row. Prefers the
 * raw `tool_name` (populated for every new row) and falls back to the legacy
 * `tool_code` map for rows written before the telemetry migration.
 */
export function resolveToolLabel(row: {
  toolName: string | null;
  toolCode: number | null;
}): string {
  if (row.toolName) return row.toolName;
  if (row.toolCode != null && CODE_TO_TOOL[row.toolCode]) return CODE_TO_TOOL[row.toolCode];
  return `unknown_${row.toolCode ?? "null"}`;
}

function telemetryColumns(
  telemetry: CallTelemetry | undefined,
  toolNameFallback: string,
) {
  return {
    sessionId: telemetry?.sessionId ?? null,
    requestId: telemetry?.requestId ?? null,
    toolName: telemetry?.toolName ?? toolNameFallback,
    args: (telemetry?.args as object | null) ?? null,
    argsSha256: telemetry?.argsSha256 ?? null,
    latencyMs: telemetry?.latencyMs ?? null,
    bytesOut: telemetry?.bytesOut ?? null,
  };
}

// ─── Write Logging ──────────────────────────────────────────────────

export type LogChangeOpts = {
  accountId: string;
  userId: string | null | undefined;
  campaignId: string | null;
  writeResult: WriteResult;
  reasoning?: string;
  clientSource?: string | null;
  telemetry?: CallTelemetry;
};

export async function logChange(opts: LogChangeOpts) {
  const { accountId, userId, campaignId, writeResult, reasoning, clientSource, telemetry } = opts;
  try {
    const code = toolNameToCode(writeResult.action) ?? null;
    if (code === null) {
      console.warn(`[tracking] Unmapped tool name (logged with null tool_code): ${writeResult.action}`);
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
        label: writeResult.label ?? null,
        beforeValue: writeResult.beforeValue,
        afterValue: writeResult.afterValue,
        reasoning: reasoning ?? null,
        clientSource: clientSource ?? null,
        success: writeResult.success ? 1 : 0,
        errorMessage: writeResult.success
          ? null
          : writeResult.error ?? telemetry?.errorMessage ?? null,
        errorClass:
          telemetry?.errorClass ??
          (writeResult.success ? null : ERROR_CLASS.WRITE_REJECTED),
        ...telemetryColumns(telemetry, writeResult.action),
      })
      .returning();

    if (inserted && userId && writeResult.success) {
      void maybeFireRedditFirstWrite({ userId, justInsertedId: inserted.id });
    }

    return inserted;
  } catch (error) {
    console.error("[tracking] Failed to log change:", error);
    return null;
  }
}

// ─── Read Logging ───────────────────────────────────────────────────

export type LogReadOpts = {
  accountId: string;
  userId: string | null | undefined;
  toolName: string;
  campaignId?: string | null;
  clientSource?: string | null;
  telemetry?: CallTelemetry;
};

export async function logRead(opts: LogReadOpts) {
  const { accountId, userId, toolName, campaignId, clientSource, telemetry } = opts;
  try {
    const code = toolNameToCode(toolName) ?? null;

    await db()
      .insert(schema.operations)
      .values({
        accountId,
        userId: userId ?? null,
        campaignId: campaignId ?? null,
        opType: OP_TYPE.READ,
        toolCode: code,
        clientSource: clientSource ?? null,
        errorClass: telemetry?.errorClass ?? null,
        errorMessage: telemetry?.errorMessage ?? null,
        // Read "success" mirrors existing semantics: 1 = happy path, 0 = threw.
        success: telemetry?.errorClass ? 0 : 1,
        ...telemetryColumns(telemetry, toolName),
      });
  } catch (error) {
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
    // Exclude bulk API failures — those count toward rate limits but are not "changes".
    eq(schema.operations.success, 1),
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
      action: resolveToolLabel(row),
      entityType: CODE_TO_ENTITY[row.entityCode ?? ENTITY_CODE.unknown] ?? "unknown",
      entityId: row.entityId ?? "",
      label: row.label ?? null,
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
  // Get the change record — only real (successful) changes have impact.
  const [change] = await db()
    .select()
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.id, changeId),
        eq(schema.operations.accountId, accountId),
        eq(schema.operations.opType, OP_TYPE.WRITE),
        eq(schema.operations.success, 1),
      ),
    )
    .limit(1);

  if (!change) return null;
  if (!change.campaignId) return { change, impact: null, reason: "No campaign associated" };

  // Window math matches `computeChangeImpactReview` exactly so agents can
  // stitch per-change (`getImpact`) and batch (`reviewChangeImpact`) calls
  // without getting contradictory numbers for the same change.
  // Before: [changeDate - 7d, changeDate)     — 7 days strictly pre-change.
  // After:  [changeDate + 1d, changeDate + 8d) — 7 days strictly post-change.
  // Change day is excluded on both sides: a full-day snapshot dated the
  // change day mixes pre- and post-change hours.
  const changeDate = change.createdAt;
  const changeDateStr = changeDate.toISOString().slice(0, 10);

  const beforeCutoff = new Date(changeDate);
  beforeCutoff.setUTCDate(beforeCutoff.getUTCDate() - IMPACT_WINDOW_DAYS);
  const beforeCutoffStr = beforeCutoff.toISOString().slice(0, 10);

  const afterStart = new Date(changeDate);
  afterStart.setUTCDate(afterStart.getUTCDate() + 1);
  const afterStartStr = afterStart.toISOString().slice(0, 10);
  const afterEnd = new Date(changeDate);
  afterEnd.setUTCDate(afterEnd.getUTCDate() + IMPACT_WINDOW_DAYS + 1);
  const afterEndStr = afterEnd.toISOString().slice(0, 10);

  const beforeSnapshots = await db()
    .select()
    .from(schema.performanceSnapshots)
    .where(
      and(
        eq(schema.performanceSnapshots.accountId, accountId),
        eq(schema.performanceSnapshots.campaignId, change.campaignId),
        gte(schema.performanceSnapshots.snapshotDate, beforeCutoffStr),
        lt(schema.performanceSnapshots.snapshotDate, changeDateStr),
      ),
    );

  const afterSnapshots = await db()
    .select()
    .from(schema.performanceSnapshots)
    .where(
      and(
        eq(schema.performanceSnapshots.accountId, accountId),
        eq(schema.performanceSnapshots.campaignId, change.campaignId),
        gte(schema.performanceSnapshots.snapshotDate, afterStartStr),
        lt(schema.performanceSnapshots.snapshotDate, afterEndStr),
      ),
    );

  // Same maturity gate as `reviewChangeImpact` so the two surfaces don't
  // contradict each other on the same change: a change 1-2 days old stays
  // `tooNew` everywhere, not "no impact" here but "impact present" there.
  if (beforeSnapshots.length === 0 || afterSnapshots.length < MIN_AFTER_DAYS_FOR_DIRECTION) {
    return {
      change,
      impact: null,
      reason: `Insufficient snapshot data for comparison (have ${beforeSnapshots.length} before / ${afterSnapshots.length} after; need at least 1 before and ${MIN_AFTER_DAYS_FOR_DIRECTION} after).`,
    };
  }

  const base = computeSnapshotImpact(beforeSnapshots, afterSnapshots);

  return {
    change: {
      id: change.id,
      action: resolveToolLabel(change),
      entityId: change.entityId,
      timestamp: change.createdAt,
    },
    impact: {
      before: base.before,
      after: base.after,
      cpaDelta: base.cpaDelta,
      costDelta: base.costDelta,
      conversionsDelta: base.conversionsDelta,
      disclaimer: IMPACT_CORRELATION_DISCLAIMER,
    },
  };
}

// ─── Batch Impact Review ────────────────────────────────────────────

/**
 * Summarize the impact of every successful change in the last `days`.
 * Designed for weekly/ad-hoc reviews by Claude Coworker: one round-trip
 * returns per-change attribution + per-action counts + a campaign-deduped
 * aggregate sum, instead of forcing the agent to stitch getChanges +
 * getCampaignPerformance by hand.
 */
export async function reviewChangeImpact(
  accountId: string,
  options: { days?: number; limit?: number; now?: Date } = {},
): Promise<ReviewChangeImpact> {
  const days = Math.min(Math.max(options.days ?? 7, 1), 90);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const now = options.now ?? new Date();

  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - days);

  const windowConditions = and(
    eq(schema.operations.accountId, accountId),
    eq(schema.operations.opType, OP_TYPE.WRITE),
    eq(schema.operations.success, 1),
    gte(schema.operations.createdAt, windowStart),
  );

  const [rows, totalResult] = await Promise.all([
    db()
      .select()
      .from(schema.operations)
      .where(windowConditions)
      .orderBy(desc(schema.operations.createdAt))
      .limit(limit),
    db()
      .select({ count: sql<number>`count(*)` })
      .from(schema.operations)
      .where(windowConditions),
  ]);
  const totalPopulation = Number(totalResult[0]?.count ?? 0);

  // Prefer the canonical snake_case form via toolCode when available so
  // byAction buckets don't split "pauseKeyword" (post-telemetry-migration
  // rows carrying `tool_name`) and "pause_keyword" (older rows with only
  // `tool_code`) for the SAME logical action.
  const canonicalAction = (row: { toolName: string | null; toolCode: number | null }): string => {
    if (row.toolCode != null && CODE_TO_TOOL[row.toolCode]) return CODE_TO_TOOL[row.toolCode];
    return row.toolName ?? `unknown_${row.toolCode ?? "null"}`;
  };

  const changes: ChangeRow[] = rows.map((row) => ({
    id: row.id,
    action: canonicalAction(row),
    entityType: CODE_TO_ENTITY[row.entityCode ?? ENTITY_CODE.unknown] ?? "unknown",
    entityId: row.entityId ?? "",
    label: row.label,
    campaignId: row.campaignId,
    reasoning: row.reasoning,
    rolledBack: row.rolledBack === 1,
    timestamp: row.createdAt,
  }));

  // Collect unique campaign IDs — one query to grab every snapshot we
  // might need, instead of N+1 per change.
  const campaignIds = Array.from(
    new Set(changes.map((c) => c.campaignId).filter((id): id is string => !!id)),
  );

  let snapshotsByCampaign = new Map<string, SnapshotRow[]>();
  if (campaignIds.length > 0) {
    // Before windows need snapshots up to 7 days before the oldest change;
    // after windows can't exceed `now` because the cron only stores
    // yesterday's data — no point asking the DB for rows that can't exist.
    const snapshotRangeStart = new Date(windowStart);
    snapshotRangeStart.setUTCDate(snapshotRangeStart.getUTCDate() - IMPACT_WINDOW_DAYS);

    const snapshots = await db()
      .select({
        campaignId: schema.performanceSnapshots.campaignId,
        snapshotDate: schema.performanceSnapshots.snapshotDate,
        costMicros: schema.performanceSnapshots.costMicros,
        conversions: schema.performanceSnapshots.conversions,
      })
      .from(schema.performanceSnapshots)
      .where(
        and(
          eq(schema.performanceSnapshots.accountId, accountId),
          inArray(schema.performanceSnapshots.campaignId, campaignIds),
          gte(schema.performanceSnapshots.snapshotDate, snapshotRangeStart.toISOString().slice(0, 10)),
          lte(schema.performanceSnapshots.snapshotDate, now.toISOString().slice(0, 10)),
        ),
      );

    snapshotsByCampaign = snapshots.reduce((map, s) => {
      const arr = map.get(s.campaignId) ?? [];
      arr.push({
        campaignId: s.campaignId,
        snapshotDate: s.snapshotDate,
        costMicros: s.costMicros,
        conversions: s.conversions,
      });
      map.set(s.campaignId, arr);
      return map;
    }, new Map<string, SnapshotRow[]>());
  }

  return computeChangeImpactReview(changes, snapshotsByCampaign, now, days, totalPopulation);
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
  // Only successful writes are undoable — failed bulk attempts never changed anything.
  const [change] = await db()
    .select()
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.id, changeId),
        eq(schema.operations.accountId, accountId),
        eq(schema.operations.opType, OP_TYPE.WRITE),
        eq(schema.operations.success, 1),
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

  // Undo only operates on mapped tool_codes; unmapped new tools gain undo
  // support when added to REVERSIBLE_ACTIONS.
  if (change.toolCode == null || REVERSIBLE_ACTIONS[change.toolCode] === undefined) {
    return { error: `Action "${resolveToolLabel(change)}" is not reversible` };
  }
  const toolName = CODE_TO_TOOL[change.toolCode];

  // Check if entity was modified after this change (stale undo guard) — only successful
  // writes count as modifications.
  const staleConditions = [
    gt(schema.operations.id, changeId),
    eq(schema.operations.accountId, accountId),
    eq(schema.operations.opType, OP_TYPE.WRITE),
    eq(schema.operations.success, 1),
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
