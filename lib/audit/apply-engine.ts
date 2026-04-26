/**
 * Apply engine — validates and executes a single audit recommendation.
 *
 * The HTTP route at app/api/chat/recommendations/apply/route.ts is a thin
 * shell over `applyRecommendation()`. The engine owns the per-item pipeline
 * so the same logic can be exercised by tests and (later) by an automated
 * apply policy without going through HTTP.
 *
 * The validation order matches the plan: load → RLS → TTL → lookup →
 * dispatch → idempotency → execute → persist. Each stage returns a
 * structured result rather than throwing, so the route can render specific
 * user-facing messages per failure mode.
 */
import { db, schema } from "@/lib/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { execWrite } from "@/lib/tools/execute";
import {
  pauseCampaign,
  enableCampaign,
  pauseKeyword,
  enableKeyword,
  addNegativeKeyword,
  removeNegativeKeyword,
  pauseAd,
  enableAd,
  updateBid,
  updateCampaignBudget,
  toMicros,
  type AuthContext,
  type WriteResult,
} from "@/lib/google-ads";
import {
  dispatchRecommendation,
  isDispatchable,
  type Recommendation,
  type RecommendationActionType,
  type ToolCall,
  type DispatchError,
} from "./recommendations";

// ─── Public types ─────────────────────────────────────────────────────

export type ApplyAuth = AuthContext & { userId: string | null };

export type ApplyInput = {
  auth: ApplyAuth;
  snapshotId: number;
  passKey: string;
  index: number;
};

/**
 * Discriminated union covering every terminal state of an apply attempt.
 * The route maps each `status` to an HTTP-friendly shape; cards in the UI
 * pattern-match on `status` to render the right state (applied / failed /
 * stale / expired).
 */
export type ApplyResult =
  | {
      status: "applied";
      passKey: string;
      index: number;
      auditApplyId: number;
      changeId: number;
      undoToolCall: ToolCall;
    }
  | {
      status: "noop_already_applied";
      passKey: string;
      index: number;
      auditApplyId: number;
      changeId: number;
      undoToolCall: ToolCall | null;
      appliedAt: string;
    }
  | { status: "snapshot_not_found"; passKey: string; index: number }
  | { status: "forbidden"; passKey: string; index: number }
  | {
      status: "expired";
      passKey: string;
      index: number;
      ttlHours: number;
      ageHours: number;
    }
  | {
      status: "recommendation_not_found";
      passKey: string;
      index: number;
    }
  | {
      status: "not_dispatchable";
      passKey: string;
      index: number;
      reason: string;
    }
  | {
      status: "validation_failed";
      passKey: string;
      index: number;
      error: DispatchError;
    }
  | {
      status: "write_failed";
      passKey: string;
      index: number;
      error: string;
    };

// ─── TTL ──────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;

/**
 * Per-action-type TTL. Budget and bid moves rot fast — the account state
 * they assumed (current spend pacing, competitor bid, today's auction) can
 * change within hours. Pauses and negatives are stable for ~a day.
 *
 * If you change these values, also update the user-visible copy on the
 * stale card state (re-run-audit affordance) so the message stays accurate.
 */
function ttlMsForActionType(actionType: RecommendationActionType): number {
  switch (actionType) {
    case "update_budget":
    case "update_bid":
      return 6 * HOUR_MS;
    default:
      return 24 * HOUR_MS;
  }
}

// ─── PassItem → Recommendation mapping ────────────────────────────────

type PersistedPassItem = {
  action?: string;
  impact?: string;
  actionType?: string;
  targetId?: string;
  campaignId?: string;
  adGroupId?: string;
  // Future fields the audit pipeline doesn't emit yet but the dispatcher needs:
  criterionId?: string;
  adId?: string;
  keyword?: string;
  matchType?: "BROAD" | "PHRASE" | "EXACT";
  currentDailyBudgetDollars?: number;
  proposedDailyBudgetDollars?: number;
  currentBidDollars?: number;
  proposedBidDollars?: number;
  // Tagging added by persist.ts
  passKey?: string;
  index?: number;
};

/**
 * The audit pipeline (scoring.ts) historically packed the criterionId or the
 * negative keyword text into `targetId`. The mapping below splays that single
 * field into the explicit fields the dispatcher expects. Future audit-pipeline
 * work (step 8 in the plan) will populate `criterionId` / `keyword` /
 * budget+bid amounts directly so this mapping becomes a passthrough.
 */
function toRecommendation(item: PersistedPassItem): Recommendation | { error: "not_dispatchable"; reason: string } {
  const at = item.actionType;
  if (!at) return { error: "not_dispatchable", reason: "PassItem has no actionType — text-only recommendation" };
  if (!isDispatchable(at)) {
    return { error: "not_dispatchable", reason: `actionType ${at} is not on the dispatch whitelist` };
  }

  switch (at) {
    case "pause_campaign":
      return { actionType: at, campaignId: item.campaignId };
    case "pause_keyword":
      return {
        actionType: at,
        campaignId: item.campaignId,
        adGroupId: item.adGroupId,
        // PassItem packs criterionId into targetId for keywords. Prefer the
        // explicit field if a future audit row sets it directly.
        criterionId: item.criterionId ?? item.targetId,
      };
    case "add_negative":
      return {
        actionType: at,
        campaignId: item.campaignId,
        // PassItem packs negative keyword text into targetId. Prefer explicit.
        keyword: item.keyword ?? item.targetId,
        matchType: item.matchType,
      };
    case "pause_ad":
      return {
        actionType: at,
        campaignId: item.campaignId,
        adGroupId: item.adGroupId,
        adId: item.adId ?? item.targetId,
      };
    case "update_budget":
      return {
        actionType: at,
        campaignId: item.campaignId,
        currentDailyBudgetDollars: item.currentDailyBudgetDollars,
        proposedDailyBudgetDollars: item.proposedDailyBudgetDollars,
      };
    case "update_bid":
      return {
        actionType: at,
        campaignId: item.campaignId,
        adGroupId: item.adGroupId,
        criterionId: item.criterionId ?? item.targetId,
        currentBidDollars: item.currentBidDollars,
        proposedBidDollars: item.proposedBidDollars,
      };
  }
}

// ─── ToolCall execution ───────────────────────────────────────────────

/**
 * Map a dispatcher ToolCall to the underlying google-ads function call,
 * wrapped in `execWrite` so we get rate limiting, telemetry, change-log row,
 * and PostHog `ai_change_executed` events for free.
 *
 * If a tool name lands here that the engine wasn't built to execute, the
 * function throws — the apply route catches that and returns `not_dispatchable`.
 * The dispatcher's whitelist (`DISPATCHABLE_ACTION_TYPES`) and this switch
 * MUST stay in lockstep; the unit tests in
 * `__tests__/audit-recommendations-apply.test.ts` lock the dispatcher half
 * and changes here must not silently drift.
 */
async function executeToolCall(
  auth: ApplyAuth,
  accountId: string,
  toolCall: ToolCall,
): Promise<WriteResult & { changeId: number | null }> {
  const args = toolCall.args;
  const cid = (args.campaignId as string | undefined) ?? null;
  switch (toolCall.tool) {
    case "pauseCampaign":
      return execWrite(auth, accountId, cid, () => pauseCampaign(auth, args.campaignId as string));
    case "enableCampaign":
      return execWrite(auth, accountId, cid, () => enableCampaign(auth, args.campaignId as string));
    case "pauseKeyword":
      return execWrite(auth, accountId, cid, () =>
        pauseKeyword(auth, args.campaignId as string, args.adGroupId as string, args.criterionId as string),
      );
    case "enableKeyword":
      return execWrite(auth, accountId, null, () =>
        enableKeyword(auth, args.adGroupId as string, args.criterionId as string),
      );
    case "addNegativeKeyword":
      return execWrite(auth, accountId, cid, () =>
        addNegativeKeyword(
          auth,
          args.campaignId as string,
          args.keyword as string,
          (args.matchType as "BROAD" | "PHRASE" | "EXACT" | undefined) ?? "PHRASE",
        ),
      );
    case "removeNegativeKeyword":
      return execWrite(auth, accountId, cid, () =>
        removeNegativeKeyword(
          auth,
          args.campaignId as string,
          args.keyword as string,
          args.matchType as "BROAD" | "PHRASE" | "EXACT" | undefined,
        ),
      );
    case "pauseAd":
      return execWrite(auth, accountId, cid, () =>
        pauseAd(auth, args.adGroupId as string, args.adId as string),
      );
    case "enableAd":
      return execWrite(auth, accountId, cid, () =>
        enableAd(auth, args.adGroupId as string, args.adId as string),
      );
    case "updateBid":
      return execWrite(auth, accountId, cid, () =>
        updateBid(
          auth,
          args.campaignId as string,
          args.adGroupId as string,
          args.criterionId as string,
          toMicros(args.newBidDollars as number),
        ),
      );
    case "updateCampaignBudget":
      return execWrite(auth, accountId, cid, () =>
        updateCampaignBudget(
          auth,
          args.campaignId as string,
          toMicros(args.newDailyBudgetDollars as number),
        ),
      );
    default:
      throw new Error(`apply-engine: unmapped tool ${toolCall.tool}`);
  }
}

// ─── Engine ───────────────────────────────────────────────────────────

/**
 * Apply a single audit recommendation. Catches all expected failure modes
 * and returns a structured ApplyResult; only network/db throws bubble up.
 */
export async function applyRecommendation(input: ApplyInput): Promise<ApplyResult> {
  const { auth, snapshotId, passKey, index } = input;

  // 1. Load snapshot.
  const [snapshot] = await db()
    .select()
    .from(schema.auditSnapshots)
    .where(eq(schema.auditSnapshots.id, snapshotId))
    .limit(1);

  if (!snapshot) return { status: "snapshot_not_found", passKey, index };

  // 2. RLS — the snapshot must belong to the caller. We only let snapshots
  //    with a non-null userId match a non-null auth.userId. Anonymous
  //    snapshots (legacy, userId=null) are intentionally not appliable.
  if (!auth.userId || snapshot.userId !== auth.userId) {
    return { status: "forbidden", passKey, index };
  }

  // 3. Look up the PassItem by (passKey, index). The persisted shape after
  //    lib/audit/persist.ts step-4 patch is a flat tagged array; older rows
  //    persisted before that patch lack `passKey`/`index` tags AND lack
  //    actionType, so they fail at the dispatcher whitelist check below
  //    (text-only fallback).
  const topActions = (snapshot.topActions ?? []) as PersistedPassItem[];
  const item = topActions.find((it) => it.passKey === passKey && it.index === index);
  if (!item) return { status: "recommendation_not_found", passKey, index };

  // 4. Map PassItem → Recommendation. Catches missing actionType (text-only
  //    rows) and any non-whitelisted actionType up front.
  const mapped = toRecommendation(item);
  if ("error" in mapped) {
    return { status: "not_dispatchable", passKey, index, reason: mapped.reason };
  }
  const recommendation: Recommendation = mapped;

  // 5. TTL — depends on actionType. Done after step 4 so the message can
  //    cite the right TTL window when it fails.
  const ttlMs = ttlMsForActionType(recommendation.actionType);
  const ageMs = Date.now() - new Date(snapshot.createdAt).getTime();
  if (ageMs > ttlMs) {
    return {
      status: "expired",
      passKey,
      index,
      ttlHours: Math.round(ttlMs / HOUR_MS),
      ageHours: Math.round(ageMs / HOUR_MS),
    };
  }

  // 6. Dispatcher — produces the ToolCall + undoToolCall, or a structured
  //    validation error if a required field is missing.
  const dispatched = dispatchRecommendation(recommendation);
  if (!dispatched.ok) {
    return { status: "validation_failed", passKey, index, error: dispatched.error };
  }

  // 7. Claim under advisory lock. The lock serializes contending applies of
  //    the same (snapshotId, passKey, index) across processes/tabs/connections,
  //    so the SELECT-then-INSERT below is race-free. The lock is xact-scoped:
  //    auto-released at COMMIT, so it's bounded by this short claim transaction
  //    and does NOT span the Google API call below.
  //
  //    Two-phase pattern:
  //      Phase 1 (this transaction): take lock, decide claim/noop/in-progress,
  //                                  insert claim row with changeId=NULL.
  //      Phase 2 (no transaction):   execute Google write.
  //      Phase 3 (no transaction):   UPDATE claim row with changeId+undo.
  //
  //    The first-phase row exists with changeId=NULL until phase 3 lands. If
  //    phase 2 fails or the process dies between phases, the row stays orphan
  //    and the next click within STALE_CLAIM_MS sees it and refuses (avoids
  //    double-execute); after that window it's reclaimed.
  const claimKey = `audit-apply:${snapshotId}:${passKey}:${index}`;

  type ClaimOutcome =
    | { kind: "claimed"; auditApplyId: number }
    | { kind: "noop"; auditApplyId: number; changeId: number; undoToolCall: ToolCall | null; appliedAt: Date }
    | { kind: "in_progress" };

  const claim: ClaimOutcome = await db().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${claimKey}))`);

    const [existing] = await tx
      .select()
      .from(schema.auditApplies)
      .where(
        and(
          eq(schema.auditApplies.snapshotId, snapshotId),
          eq(schema.auditApplies.passKey, passKey),
          eq(schema.auditApplies.index, index),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.changeId != null) {
        return {
          kind: "noop",
          auditApplyId: existing.id,
          changeId: existing.changeId,
          undoToolCall: (existing.undoToolCall as ToolCall | null) ?? null,
          appliedAt: existing.appliedAt,
        };
      }
      // Claim row with NULL changeId — either an in-flight phase-2 write, or
      // a stale orphan from a crashed/aborted prior attempt.
      const ageMs = Date.now() - new Date(existing.appliedAt).getTime();
      if (ageMs < STALE_CLAIM_MS) return { kind: "in_progress" };
      // Stale — reclaim by deleting under the lock and re-inserting below.
      await tx
        .delete(schema.auditApplies)
        .where(eq(schema.auditApplies.id, existing.id));
    }

    const [inserted] = await tx
      .insert(schema.auditApplies)
      .values({
        snapshotId,
        passKey,
        index,
        userId: auth.userId,
        accountId: auth.customerId,
        actionType: recommendation.actionType,
        // changeId + undoToolCall backfilled in phase 3.
      })
      .returning({ id: schema.auditApplies.id });

    return { kind: "claimed", auditApplyId: inserted.id };
  });

  if (claim.kind === "noop") {
    return {
      status: "noop_already_applied",
      passKey,
      index,
      auditApplyId: claim.auditApplyId,
      changeId: claim.changeId,
      undoToolCall: claim.undoToolCall,
      appliedAt: new Date(claim.appliedAt).toISOString(),
    };
  }

  if (claim.kind === "in_progress") {
    return {
      status: "write_failed",
      passKey,
      index,
      error: "Another apply for this recommendation is already in flight. Try again in a moment.",
    };
  }

  const auditApplyId = claim.auditApplyId;

  // Phase 2 — Google write. If this fails, drop the claim row so the user can
  // retry without hitting the in_progress path on the very next click.
  let writeResult: WriteResult & { changeId: number | null };
  try {
    writeResult = await executeToolCall(auth, auth.customerId, dispatched.toolCall);
  } catch (e) {
    await releaseClaim(auditApplyId);
    return {
      status: "write_failed",
      passKey,
      index,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (!writeResult.success) {
    await releaseClaim(auditApplyId);
    return {
      status: "write_failed",
      passKey,
      index,
      error: writeResult.error ?? "Unknown write failure",
    };
  }

  const changeId = writeResult.changeId;
  if (changeId == null) {
    // execWrite logged at Google but local operations row is missing — undo
    // would have nothing to point at. Drop the claim so retry is honest.
    await releaseClaim(auditApplyId);
    return {
      status: "write_failed",
      passKey,
      index,
      error: "Change applied at Google but local logging failed — undo unavailable.",
    };
  }

  // Phase 3 — backfill the claim row + cross-link operations + bump snapshot.
  // These are independent UPDATEs on different tables; run in parallel.
  await Promise.all([
    db()
      .update(schema.auditApplies)
      .set({
        changeId,
        undoToolCall: dispatched.undoToolCall as unknown as Record<string, unknown>,
      })
      .where(eq(schema.auditApplies.id, auditApplyId)),
    db()
      .update(schema.operations)
      .set({ auditSnapshotId: snapshotId })
      .where(eq(schema.operations.id, changeId)),
    db()
      .update(schema.auditSnapshots)
      .set({ lastApplyAt: sql`now()` })
      .where(eq(schema.auditSnapshots.id, snapshotId)),
  ]);

  return {
    status: "applied",
    passKey,
    index,
    auditApplyId,
    changeId,
    undoToolCall: dispatched.undoToolCall,
  };
}

/**
 * If a Google write older than this is still flagged "in flight" (claim row
 * with NULL changeId), we treat the prior attempt as crashed and reclaim. The
 * window must be longer than the longest realistic Google API call so we never
 * stomp a legitimately-running apply, but short enough that an end user
 * retrying after a process crash doesn't get stuck. 30s leaves headroom over
 * the ~1-3s typical Google Ads write latency.
 */
const STALE_CLAIM_MS = 30_000;

/** Drop a phase-1 claim row so a failed write doesn't block retry. */
async function releaseClaim(auditApplyId: number): Promise<void> {
  // Best-effort — a stale-claim sweep would also pick this up after 30s.
  await db()
    .delete(schema.auditApplies)
    .where(eq(schema.auditApplies.id, auditApplyId));
}

// ─── Undo ─────────────────────────────────────────────────────────────

export type UndoInput = {
  auth: ApplyAuth;
  /** audit_applies.id of the apply to undo. */
  auditApplyId: number;
};

export type UndoResult =
  | { status: "undone"; auditApplyId: number; changeId: number }
  | { status: "noop_already_undone"; auditApplyId: number; changeId: number; undoneAt: string }
  | { status: "not_found"; auditApplyId: number }
  | { status: "forbidden"; auditApplyId: number }
  | { status: "no_undo_available"; auditApplyId: number; reason: string }
  | { status: "write_failed"; auditApplyId: number; error: string };

/**
 * Reverse a previously-applied recommendation by replaying the stored
 * `undoToolCall`. The undo is itself a write — it goes through `execWrite`
 * the same way as the original apply, gets its own `operations` row, and
 * the changeId is recorded on `audit_applies.undo_change_id` so the UI can
 * surface "Undone (change #N)".
 *
 * Idempotent: if `undoneAt` is already set, returns `noop_already_undone`
 * with the prior undo's changeId. Concurrent undos resolve via the prior
 * apply's stored undo_change_id check below.
 */
export async function undoApply(input: UndoInput): Promise<UndoResult> {
  const { auth, auditApplyId } = input;

  const [row] = await db()
    .select()
    .from(schema.auditApplies)
    .where(eq(schema.auditApplies.id, auditApplyId))
    .limit(1);

  if (!row) return { status: "not_found", auditApplyId };
  if (!auth.userId || row.userId !== auth.userId) {
    return { status: "forbidden", auditApplyId };
  }

  // Already undone — return idempotent noop with the existing undo changeId.
  if (row.undoneAt && row.undoChangeId != null) {
    return {
      status: "noop_already_undone",
      auditApplyId,
      changeId: row.undoChangeId,
      undoneAt: new Date(row.undoneAt).toISOString(),
    };
  }

  const undoToolCall = row.undoToolCall as ToolCall | null;
  if (!undoToolCall || typeof undoToolCall.tool !== "string") {
    return {
      status: "no_undo_available",
      auditApplyId,
      reason: "Original apply did not record an undo path.",
    };
  }

  let writeResult: WriteResult & { changeId: number | null };
  try {
    writeResult = await executeToolCall(auth, auth.customerId, undoToolCall);
  } catch (e) {
    return {
      status: "write_failed",
      auditApplyId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (!writeResult.success) {
    return {
      status: "write_failed",
      auditApplyId,
      error: writeResult.error ?? "Unknown undo failure",
    };
  }
  const undoChangeId = writeResult.changeId;
  if (undoChangeId == null) {
    return {
      status: "write_failed",
      auditApplyId,
      error: "Undo applied at Google but local logging failed.",
    };
  }

  await db()
    .update(schema.auditApplies)
    .set({ undoChangeId, undoneAt: sql`now()` })
    .where(eq(schema.auditApplies.id, auditApplyId));

  // Mark the original change as rolled back so impact / change-history
  // queries skip it when summing the apply's effect.
  if (row.changeId != null) {
    await db()
      .update(schema.operations)
      .set({ rolledBack: 1 })
      .where(eq(schema.operations.id, row.changeId));
  }

  return { status: "undone", auditApplyId, changeId: undoChangeId };
}

// ─── Recently-applied lookup (for the undo bar / persistence) ────────

export type RecentApply = {
  id: number;
  snapshotId: number;
  passKey: string;
  index: number;
  actionType: string;
  changeId: number | null;
  undoChangeId: number | null;
  undoToolCall: ToolCall | null;
  appliedAt: string;
  undoneAt: string | null;
};

/**
 * Pull the user's recent applies for the undo-bar UI. Default scope is the
 * last hour so the bar doesn't grow unboundedly. The undo route uses this
 * lookup keyed by audit_applies.id when it actually performs the undo.
 */
export async function listRecentApplies(userId: string, limit = 20): Promise<RecentApply[]> {
  // changeId IS NOT NULL filters out phase-1 claim rows that haven't completed
  // their Google write yet (or whose process died mid-write). They have no
  // change to undo, so they don't belong in the undo bar.
  const rows = await db()
    .select()
    .from(schema.auditApplies)
    .where(
      and(
        eq(schema.auditApplies.userId, userId),
        sql`${schema.auditApplies.changeId} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.auditApplies.appliedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    snapshotId: r.snapshotId,
    passKey: r.passKey,
    index: r.index,
    actionType: r.actionType,
    changeId: r.changeId,
    undoChangeId: r.undoChangeId,
    undoToolCall: (r.undoToolCall as ToolCall | null) ?? null,
    appliedAt: new Date(r.appliedAt).toISOString(),
    undoneAt: r.undoneAt ? new Date(r.undoneAt).toISOString() : null,
  }));
}
