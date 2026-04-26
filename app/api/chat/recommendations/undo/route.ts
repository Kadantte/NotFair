import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/session";
import { undoApply, type ApplyAuth } from "@/lib/audit/apply-engine";

/**
 * POST /api/chat/recommendations/undo
 *
 * Body:  { auditApplyId: number }
 * Auth:  same-origin session cookie
 *
 * Replays the stored `undoToolCall` from the audit_applies row. Returns the
 * structured `UndoResult`. Like the apply route, terminal failure modes
 * (not_found / forbidden / write_failed / no_undo_available) come back as
 * `status` values — top-level 4xx/5xx is reserved for malformed requests
 * and unexpected throws.
 */

const FEATURE_FLAG_ENABLED = (process.env.FEATURE_AUDIT_APPLY ?? "").toLowerCase() === "true";

export async function POST(request: Request): Promise<Response> {
  if (!FEATURE_FLAG_ENABLED) {
    return NextResponse.json(
      { error: "feature_disabled", message: "Recommendation apply is currently disabled." },
      { status: 503 },
    );
  }

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx?.session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !raw ||
    typeof raw.auditApplyId !== "number" ||
    !Number.isInteger(raw.auditApplyId) ||
    raw.auditApplyId <= 0
  ) {
    return NextResponse.json(
      { error: "invalid_body", message: "auditApplyId must be a positive integer" },
      { status: 400 },
    );
  }

  const auth: ApplyAuth = {
    ...ctx.auth,
    userId: ctx.session.userId,
    clientName: "audit-apply",
    authMethod: "web",
    sessionId: null,
  };

  try {
    const result = await undoApply({ auth, auditApplyId: raw.auditApplyId });
    return NextResponse.json({ result });
  } catch (e) {
    console.error("[undo] unexpected throw", e);
    return NextResponse.json(
      { error: "internal_error", message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
