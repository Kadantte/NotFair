"use client";

/**
 * Apply state machine for a single audit recommendation.
 *
 * Two render variants share the same hook:
 * - `<RecommendationApply />` — inline button group, designed to slot into
 *   the existing `PassSection` row layout on /audit alongside the action +
 *   impact text already rendered there.
 * - `<RecommendationCard />` — full card (action + impact + buttons),
 *   designed for the AuditChatDrawer where the row layout doesn't exist.
 *
 * Both POST `{ snapshotId, items: [{passKey, index}] }` to the apply route
 * and pattern-match on the per-item ApplyResult. Errors are user-visible at
 * the card level, NOT thrown — partial-success contract requires that one
 * failed apply doesn't bubble up and abort sibling cards.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle, RefreshCw, MessageCircle } from "lucide-react";
import type { ApplyResult } from "@/lib/audit/apply-engine";

// ─── Cross-card result bus ────────────────────────────────────────────
//
// Apply All (step 10) sends one batch request and gets back N results. We
// need each card to update in-place rather than re-render the whole audit
// page. A small event bus keyed by (snapshotId, passKey, index) does the
// job without lifting state into AuditContent and without a context
// provider — both of which would force every PassSection consumer to
// thread a tracker through.
//
// EventTarget is used instead of a plain custom listener registry so the
// browser handles GC of disconnected components correctly.

const RESULT_BUS = typeof window !== "undefined" ? new EventTarget() : null;

function busKey(snapshotId: number, passKey: string, index: number): string {
  return `${snapshotId}:${passKey}:${index}`;
}

function publishResult(snapshotId: number, result: ApplyResult): void {
  if (!RESULT_BUS) return;
  RESULT_BUS.dispatchEvent(
    new CustomEvent(busKey(snapshotId, result.passKey, result.index), { detail: result }),
  );
}

function useResultSubscription(
  snapshotId: number,
  passKey: string,
  index: number,
  onResult: (result: ApplyResult) => void,
): void {
  useEffect(() => {
    if (!RESULT_BUS) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ApplyResult>).detail;
      if (detail) onResult(detail);
    };
    const key = busKey(snapshotId, passKey, index);
    RESULT_BUS.addEventListener(key, handler);
    return () => RESULT_BUS.removeEventListener(key, handler);
  }, [snapshotId, passKey, index, onResult]);
}

// ─── Types ───────────────────────────────────────────────────────────

export type RecommendationItem = {
  /** Free-text human action, e.g. "Pause keyword 'emergency dentist'". */
  action: string;
  /** Forward-looking impact, e.g. "+$147/mo back to your budget". */
  impact: string;
  /** Whitelisted by lib/audit/recommendations.ts. Missing = text-only render. */
  actionType?: string;
};

type CardState =
  | { kind: "idle" }
  | { kind: "applying" }
  | {
      kind: "applied";
      changeId: number;
      auditApplyId: number;
      hasUndo: boolean;
      alreadyAppliedAt?: string;
    }
  | { kind: "undoing"; auditApplyId: number }
  | { kind: "undone"; undoChangeId: number }
  | { kind: "undo_failed"; auditApplyId: number; error: string; hasUndo: boolean; changeId: number }
  | { kind: "expired"; ttlHours: number }
  | { kind: "stale_entity"; reason: string }
  | { kind: "not_authorized" }
  | { kind: "not_supported"; reason: string }
  | { kind: "validation_error"; reason: string }
  | { kind: "write_failed"; error: string };

type ApplyResponse = { snapshotId: number; results: ApplyResult[] };

type CommonProps = {
  snapshotId: number;
  passKey: string;
  index: number;
  item: RecommendationItem;
  /** When false, renders text-only — used during the rollout window where
   * FEATURE_AUDIT_APPLY is OFF on the server. */
  enabled: boolean;
  /** Optional callback invoked on terminal success, so the parent (e.g.
   * Apply All button) can refresh the recently-applied list / undo bar. */
  onApplied?: (changeId: number) => void;
  /** Optional Discuss button click — usually opens the audit chat drawer
   * pre-seeded with this recommendation. Hidden when omitted. */
  onDiscuss?: () => void;
};

// ─── Apply hook ───────────────────────────────────────────────────────

function applyResultToState(r: ApplyResult): CardState {
  switch (r.status) {
    case "applied":
      return {
        kind: "applied",
        changeId: r.changeId,
        auditApplyId: r.auditApplyId,
        hasUndo: true,
      };
    case "noop_already_applied":
      return {
        kind: "applied",
        changeId: r.changeId,
        auditApplyId: r.auditApplyId,
        hasUndo: r.undoToolCall !== null,
        alreadyAppliedAt: r.appliedAt,
      };
    case "expired":
      return { kind: "expired", ttlHours: r.ttlHours };
    case "snapshot_not_found":
    case "recommendation_not_found":
      return { kind: "stale_entity", reason: "This recommendation is no longer available." };
    case "forbidden":
      return { kind: "not_authorized" };
    case "not_dispatchable":
      return { kind: "not_supported", reason: r.reason };
    case "validation_failed": {
      const e = r.error;
      let reason: string;
      if (e.kind === "missing_field") {
        reason = `Missing ${e.field}`;
      } else if (e.kind === "invalid_value") {
        reason = `${e.field}: ${e.reason}`;
      } else {
        reason = `Unsupported action ${e.actionType}`;
      }
      return { kind: "validation_error", reason };
    }
    case "write_failed":
      return { kind: "write_failed", error: r.error };
  }
}

function useApplyRecommendation(props: CommonProps) {
  const [state, setState] = useState<CardState>({ kind: "idle" });

  // Listen for results published by Apply All on the same (snapshotId, passKey, index)
  // so the card flips to its terminal state without owning the request.
  useResultSubscription(
    props.snapshotId,
    props.passKey,
    props.index,
    useCallback(
      (r: ApplyResult) => {
        const next = applyResultToState(r);
        setState(next);
        if (next.kind === "applied") props.onApplied?.(next.changeId);
      },
      [props],
    ),
  );

  const apply = useCallback(async () => {
    setState({ kind: "applying" });
    let response: ApplyResponse;
    try {
      const res = await fetch("/api/chat/recommendations/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotId: props.snapshotId,
          items: [{ passKey: props.passKey, index: props.index }],
        }),
      });
      if (!res.ok) {
        // 401/400/500/503 — top-level failure (auth, body, infra, flag-off).
        // Status-specific copy keeps the user oriented without exposing internals.
        const code = res.status;
        if (code === 503) {
          setState({ kind: "not_supported", reason: "Apply is currently disabled." });
          return;
        }
        if (code === 401) {
          setState({ kind: "not_authorized" });
          return;
        }
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setState({ kind: "write_failed", error: body?.message ?? `HTTP ${code}` });
        return;
      }
      response = (await res.json()) as ApplyResponse;
    } catch (e) {
      setState({
        kind: "write_failed",
        error: e instanceof Error ? e.message : "Network error",
      });
      return;
    }

    const result = response.results[0];
    if (!result) {
      // Defensive — server should always return one result per item, but guard
      // anyway so a backend bug doesn't lock the card in 'applying' forever.
      setState({ kind: "write_failed", error: "No result returned" });
      return;
    }
    const next = applyResultToState(result);
    setState(next);
    if (next.kind === "applied") {
      props.onApplied?.(next.changeId);
    }
  }, [props]);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  // Caller (ApplyControl) passes auditApplyId from the current state. We don't
  // re-read state here because setState updaters run during render, not at the
  // call site — a previous attempt to "read state via setState" silently
  // returned early because the outer variable was never assigned in time.
  const undo = useCallback(async (auditApplyId: number) => {
    setState((prev) => {
      if (prev.kind !== "applied" && prev.kind !== "undo_failed") return prev;
      return { kind: "undoing", auditApplyId };
    });

    const fail = (error: string) =>
      setState((prev) =>
        prev.kind === "undoing"
          ? { kind: "undo_failed", auditApplyId: prev.auditApplyId, error, hasUndo: true, changeId: 0 }
          : prev,
      );

    try {
      const res = await fetch("/api/chat/recommendations/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditApplyId }),
      });
      if (!res.ok) {
        if (res.status === 401) return fail("Not authorized");
        if (res.status === 503) return fail("Apply is currently disabled");
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        return fail(body?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { result: { status: string; changeId?: number; error?: string } };
      const r = data.result;
      if (r.status === "undone" || r.status === "noop_already_undone") {
        setState({ kind: "undone", undoChangeId: r.changeId ?? 0 });
        return;
      }
      // no_undo_available, write_failed, etc. — surface the server's reason.
      setState((prev) =>
        prev.kind === "undoing"
          ? {
              kind: "undo_failed",
              auditApplyId: prev.auditApplyId,
              error: r.error ?? r.status,
              hasUndo: r.status !== "no_undo_available",
              changeId: 0,
            }
          : prev,
      );
    } catch (e) {
      fail(e instanceof Error ? e.message : "Network error");
    }
  }, []);

  return { state, apply, reset, undo };
}

// ─── Inline variant (audit page rows) ────────────────────────────────

/**
 * Right-side action area of an existing PassSection row. Slots in next to
 * `<AskAIButton />` so the row's left content (action text + impact) is
 * unchanged — this keeps the visual continuity for users when the feature
 * flag flips on.
 */
export function RecommendationApply(props: CommonProps) {
  const { state, apply, reset, undo } = useApplyRecommendation(props);

  if (!props.enabled || !props.item.actionType) {
    // Feature disabled OR text-only recommendation — render nothing inline.
    return null;
  }

  const showDiscuss = props.onDiscuss && state.kind === "idle";
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ApplyControl state={state} apply={apply} reset={reset} undo={undo} />
      {showDiscuss && (
        <button
          type="button"
          onClick={props.onDiscuss}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium text-[#C4C0B6] transition hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
        >
          <MessageCircle className="h-3 w-3" />
          Discuss
        </button>
      )}
    </div>
  );
}

// ─── Card variant (audit chat drawer) ────────────────────────────────

/**
 * Standalone card. Shown in chat when the assistant emits an apply marker
 * referencing this (passKey, index) — see step 8 of the plan for the marker
 * convention.
 */
export function RecommendationCard(props: CommonProps) {
  const { state, apply, reset, undo } = useApplyRecommendation(props);
  const dispatchable = props.enabled && Boolean(props.item.actionType);

  return (
    <div className="rounded border border-[#3D3C36] bg-[#1A1917] p-3">
      <div className="text-[13px] text-[#E8E4DD]">{props.item.action}</div>
      <div className="mt-1 font-mono text-[12px] text-[#4CAF6E]">{props.item.impact}</div>
      {!dispatchable ? (
        <div className="mt-2 text-[11px] italic text-[#6B6760]">
          {props.enabled
            ? "Open this recommendation on the audit page to apply."
            : "Apply is currently disabled."}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <ApplyControl state={state} apply={apply} reset={reset} undo={undo} />
          {props.onDiscuss && state.kind === "idle" && (
            <button
              type="button"
              onClick={props.onDiscuss}
              className="flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium text-[#C4C0B6] transition hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
            >
              <MessageCircle className="h-3 w-3" />
              Discuss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared button — the actual state machine UI ─────────────────────

function ApplyControl({
  state,
  apply,
  reset,
  undo,
}: {
  state: CardState;
  apply: () => void;
  reset: () => void;
  undo: (auditApplyId: number) => void;
}) {
  switch (state.kind) {
    case "idle":
      return (
        <button
          type="button"
          onClick={apply}
          className="flex items-center gap-1 rounded-sm bg-[#3D3C36] px-2 py-1 text-[11px] font-medium text-[#E8E4DD] transition hover:bg-[#4D4C46]"
        >
          Apply
        </button>
      );

    case "applying":
      return (
        <button
          type="button"
          disabled
          aria-live="polite"
          className="flex items-center gap-1 rounded-sm bg-[#3D3C36] px-2 py-1 text-[11px] font-medium text-[#E8E4DD] opacity-60"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Applying…
        </button>
      );

    case "applied":
      return (
        <div className="flex items-center gap-2">
          <span
            aria-live="polite"
            className="flex items-center gap-1 text-[11px] font-medium text-[#4CAF6E]"
            title={
              state.alreadyAppliedAt
                ? `Already applied at ${new Date(state.alreadyAppliedAt).toLocaleString()}`
                : `Change #${state.changeId}`
            }
          >
            <Check className="h-3 w-3" />
            {state.alreadyAppliedAt ? "Already applied" : "Applied"}
          </span>
          {state.hasUndo && (
            <button
              type="button"
              onClick={() => undo(state.auditApplyId)}
              className="text-[11px] text-[#C4C0B6] underline-offset-2 hover:text-[#E8E4DD] hover:underline"
            >
              Undo
            </button>
          )}
        </div>
      );

    case "undoing":
      return (
        <span
          aria-live="polite"
          className="flex items-center gap-1 text-[11px] font-medium text-[#C4C0B6]"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Undoing…
        </span>
      );

    case "undone":
      return (
        <span
          aria-live="polite"
          className="flex items-center gap-1 text-[11px] font-medium text-[#C4C0B6]"
          title={state.undoChangeId ? `Undo change #${state.undoChangeId}` : undefined}
        >
          <Check className="h-3 w-3" />
          Undone
        </span>
      );

    case "undo_failed":
      return (
        <button
          type="button"
          onClick={() => undo(state.auditApplyId)}
          className="flex items-center gap-1 rounded-sm border border-[#C45D4A40] bg-[#C45D4A10] px-2 py-1 text-[11px] font-medium text-[#C45D4A] hover:bg-[#C45D4A20]"
          title={state.error}
        >
          <RefreshCw className="h-3 w-3" />
          Retry undo
        </button>
      );

    case "expired":
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#D4882A]" title={`Older than ${state.ttlHours}h`}>
          <RefreshCw className="h-3 w-3" />
          Re-run audit
        </span>
      );

    case "stale_entity":
      return (
        <span className="text-[11px] text-[#D4882A]" title={state.reason}>
          Stale
        </span>
      );

    case "not_authorized":
      return <span className="text-[11px] text-[#C45D4A]">Not authorized</span>;

    case "not_supported":
      return (
        <span className="text-[11px] text-[#6B6760]" title={state.reason}>
          Not supported
        </span>
      );

    case "validation_error":
      return (
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 text-[11px] text-[#C45D4A] hover:text-[#E0735C]"
          title={state.reason}
        >
          <AlertTriangle className="h-3 w-3" />
          Cannot apply
        </button>
      );

    case "write_failed":
      return (
        <button
          type="button"
          onClick={apply}
          className="flex items-center gap-1 rounded-sm border border-[#C45D4A40] bg-[#C45D4A10] px-2 py-1 text-[11px] font-medium text-[#C45D4A] hover:bg-[#C45D4A20]"
          title={state.error}
        >
          <RefreshCw className="h-3 w-3" />
          Try again
        </button>
      );
  }
}

// Re-export ApplyResult type for parents that want to handle results directly.
export type { ApplyResult };

/**
 * Convenience batch-apply helper. The Apply All button (step 10) calls this
 * with all dispatchable PassItems for the snapshot; per-item results are
 * surfaced via the optional `onItemResult` callback so the parent can update
 * each card in-place rather than re-rendering from scratch.
 *
 * Kept in this file so the request-shape contract (1 endpoint, 1 batch) is
 * defined once — the card hook above sends a single-item batch through the
 * same code path.
 */
export async function applyBatch(
  snapshotId: number,
  items: ReadonlyArray<{ passKey: string; index: number }>,
  onItemResult?: (result: ApplyResult) => void,
): Promise<ApplyResponse> {
  const res = await fetch("/api/chat/recommendations/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshotId, items }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as ApplyResponse;
  // Publish each per-item result onto the bus so any subscribed card flips
  // to its terminal state in-place — keeps the ✅✅❌ visual that the plan
  // calls out without lifting state up to AuditContent.
  for (const r of data.results) {
    publishResult(snapshotId, r);
    onItemResult?.(r);
  }
  return data;
}

export const __test_only_applyResultToState = applyResultToState;
