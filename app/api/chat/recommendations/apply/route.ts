import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/session";
import { applyRecommendation, type ApplyAuth, type ApplyResult } from "@/lib/audit/apply-engine";

/**
 * POST /api/chat/recommendations/apply
 *
 * Body:  { snapshotId: number, items: [{ passKey: string, index: number }, ...] }
 * Auth:  same-origin session cookie (getAuthContext) — no Bearer token path.
 *
 * The route is intentionally a thin shell over `applyRecommendation()`. Per-item
 * results are returned in the same order as the request `items` array, so the
 * UI can correlate cards 1:1 without sorting.
 *
 * Failures are returned as discriminated `status` values, NOT HTTP error codes —
 * the request itself succeeded; individual recommendations may have stale data,
 * expired TTLs, or non-dispatchable shapes. This matches the "partial-success
 * contract" called out in the plan: rolling back successful applies because one
 * failed is itself a write that can fail. Top-level 4xx is reserved for "the
 * request shape itself is wrong" (auth, JSON, schema).
 */

const FEATURE_FLAG_ENABLED = (process.env.FEATURE_AUDIT_APPLY ?? "").toLowerCase() === "true";

type ItemRequest = { passKey: string; index: number };

function parseBody(body: unknown): { snapshotId: number; items: ItemRequest[] } | { error: string } {
  if (!body || typeof body !== "object") return { error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (typeof b.snapshotId !== "number" || !Number.isInteger(b.snapshotId) || b.snapshotId <= 0) {
    return { error: "snapshotId must be a positive integer" };
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { error: "items must be a non-empty array" };
  }
  if (b.items.length > 20) {
    // Hard ceiling so a malicious or buggy client can't enqueue 1000 writes
    // in a single request. Audit pipeline emits max 9 PassItems anyway.
    return { error: "items may contain at most 20 entries" };
  }
  const items: ItemRequest[] = [];
  // Dedupe (passKey, index) pairs — Promise.all in the handler fans these out
  // concurrently, and the apply-engine's pre-insert idempotency check (step 7
  // in apply-engine.ts) is a SELECT, so two identical items in the same batch
  // can both pass it and double-execute the underlying Google write.
  const seen = new Set<string>();
  for (let i = 0; i < b.items.length; i++) {
    const it = b.items[i] as Record<string, unknown> | null;
    if (!it || typeof it !== "object") return { error: `items[${i}] must be an object` };
    if (typeof it.passKey !== "string" || it.passKey.length === 0) {
      return { error: `items[${i}].passKey must be a non-empty string` };
    }
    if (typeof it.index !== "number" || !Number.isInteger(it.index) || it.index < 0) {
      return { error: `items[${i}].index must be a non-negative integer` };
    }
    const dedupKey = `${it.passKey}\x00${it.index}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    items.push({ passKey: it.passKey, index: it.index });
  }
  return { snapshotId: b.snapshotId, items };
}

export async function POST(request: Request): Promise<Response> {
  // Feature-flag gate — the plan calls for a one-line rollback knob without a
  // code revert. OFF returns 503 so the UI can render the text-only fallback.
  if (!FEATURE_FLAG_ENABLED) {
    return NextResponse.json(
      { error: "feature_disabled", message: "Recommendation apply is currently disabled." },
      { status: 503 },
    );
  }

  // Auth.
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx?.session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Body validation.
  const raw = await request.json().catch(() => null);
  const parsed = parseBody(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error }, { status: 400 });
  }
  const { snapshotId, items } = parsed;

  // Build the auth context the engine expects. ctx.auth has refreshToken +
  // customerId; we supplement with userId so execWrite can attribute the
  // operations row + PostHog events correctly.
  const auth: ApplyAuth = {
    ...ctx.auth,
    userId: ctx.session.userId,
    clientName: "audit-apply",
    authMethod: "web",
    sessionId: null,
  };

  // Apply per-item in parallel. The engine itself catches every expected
  // failure mode and returns a structured ApplyResult — only an unexpected
  // throw (DB outage, network kill) escapes here.
  let results: ApplyResult[];
  try {
    results = await Promise.all(
      items.map((it) => applyRecommendation({ auth, snapshotId, passKey: it.passKey, index: it.index })),
    );
  } catch (e) {
    // Truly unexpected — log and return 500 so the UI shows a "try again"
    // banner instead of silently rendering "applied" cards.
    console.error("[apply] unexpected throw", e);
    return NextResponse.json(
      { error: "internal_error", message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ snapshotId, results });
}
