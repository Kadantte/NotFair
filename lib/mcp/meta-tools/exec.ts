import { logChange, logRead, ERROR_CLASS, type CallTelemetry } from "@/lib/db/tracking";
import {
  enforceRateLimit,
  recordOperation,
  RateLimitError,
} from "@/lib/mcp/rate-limit";
import { getTelemetry } from "@/lib/mcp/telemetry";
import { trackServerEvent } from "@/lib/analytics-server";
import type { AuthContext } from "@/lib/google-ads";

/**
 * Meta-side mirrors of `lib/tools/execute.ts`. They centralize
 * rate-limit + DB logging + cache-bump for every Meta MCP tool so each
 * handler stays focused on the Graph API work.
 *
 * Tracking parity with Google: every successful or rejected call inserts a
 * row into `operations` with `platform = 'meta_ads'`. That powers /usage
 * counts, free-tier enforcement, and any future per-platform breakdowns.
 */

type ToolAuth = AuthContext & {
  /** PostHog/Reddit attribution requires this — same as Google's ToolAuth. */
  userId?: string | null;
  clientName?: string | null;
  clientVersion?: string | null;
  authMethod?: string | null;
  userAgent?: string | null;
};

function buildTelemetry(
  ctx: ReturnType<typeof getTelemetry>,
  latencyMs: number | null,
  bytesOut: number | null,
  errorClass: string | null = null,
  errorMessage: string | null = null,
): CallTelemetry {
  return {
    requestId: ctx?.requestId ?? null,
    toolName: ctx?.toolName ?? null,
    args: ctx?.args ?? null,
    latencyMs,
    bytesOut,
    errorClass: (errorClass ?? null) as CallTelemetry["errorClass"],
    errorMessage,
  };
}

function byteLengthOf(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return 0;
  }
}

/** Best-effort error-message extraction matching execute.ts behavior. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

/**
 * Meta-side write envelope returned by the Meta tool handlers. Mirrors
 * `WriteResult` (Google) but with JSON-snapshot before/after instead of
 * pre-formatted strings.
 */
export type MetaWriteEnvelope = {
  success: boolean;
  action: string;
  entityType: "campaign" | "adset" | "ad" | "account";
  entityId: string;
  accountId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

function snapshotToString(snap: Record<string, unknown> | null): string {
  if (!snap) return "";
  try {
    return JSON.stringify(snap);
  } catch {
    return "";
  }
}

/**
 * Run a Meta MCP write. Rate-limits, executes the Graph API mutation,
 * inserts an `operations` row with `platform = 'meta_ads'`, and bumps the
 * usage cache. The returned envelope is what the agent sees.
 */
export async function execMetaWrite(
  auth: ToolAuth,
  fn: () => Promise<MetaWriteEnvelope>,
): Promise<MetaWriteEnvelope> {
  await enforceRateLimit(auth.userId ?? null);
  const ctx = getTelemetry();
  const t0 = performance.now();
  let result: MetaWriteEnvelope;
  try {
    result = await fn();
  } catch (error) {
    const latencyMs = Math.round(performance.now() - t0);
    if (ctx?.toolName) {
      void logRead({
        accountId: "",
        userId: auth.userId ?? null,
        toolName: ctx.toolName,
        clientSource: auth.clientName,
        platform: "meta_ads",
        telemetry: buildTelemetry(ctx, latencyMs, 0, ERROR_CLASS.THROWN, describeError(error)),
      });
    }
    throw error;
  }

  const latencyMs = Math.round(performance.now() - t0);
  const bytesOut = byteLengthOf(result);
  const telemetry = buildTelemetry(
    ctx,
    latencyMs,
    bytesOut,
    result.success ? null : ERROR_CLASS.WRITE_REJECTED,
  );
  await logChange({
    accountId: result.accountId,
    userId: auth.userId ?? null,
    campaignId: null,
    platform: "meta_ads",
    writeResult: {
      success: result.success,
      action: result.action,
      entityId: result.entityId,
      beforeValue: snapshotToString(result.before),
      afterValue: snapshotToString(result.after),
    },
    clientSource: auth.clientName,
    telemetry,
  });
  recordOperation(auth.userId ?? null);
  trackServerEvent(auth.userId ?? null, result.success ? "ai_change_executed" : "ai_change_failed", {
    platform: "meta_ads",
    tool_name: result.action,
    entity_type: result.entityType,
    account_id: result.accountId,
    campaign_id: null,
    before_value: snapshotToString(result.before) || null,
    after_value: snapshotToString(result.after) || null,
    error: result.success ? null : null,
    client_name: auth.clientName ?? null,
    client_version: auth.clientVersion ?? null,
    auth_method: auth.authMethod ?? null,
    user_agent: auth.userAgent ?? null,
    latency_ms: latencyMs,
  });
  return result;
}

/**
 * Run a Meta MCP read. Rate-limits, executes the Graph API call,
 * inserts an `operations` row with `platform = 'meta_ads'`, and bumps the
 * usage cache. Identical contract to `execRead` (Google) — the wrapped fn
 * returns whatever shape the tool exposes.
 */
export async function execMetaRead<T>(
  auth: ToolAuth,
  accountId: string,
  toolName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = getTelemetry();
  try {
    await enforceRateLimit(auth.userId ?? null);
  } catch (error) {
    if (error instanceof RateLimitError) {
      void logRead({
        accountId,
        userId: auth.userId ?? null,
        toolName,
        clientSource: auth.clientName,
        platform: "meta_ads",
        telemetry: buildTelemetry(ctx, 0, null, ERROR_CLASS.RATE_LIMIT, describeError(error)),
      });
    }
    throw error;
  }
  const t0 = performance.now();
  let result: T;
  try {
    result = await fn();
  } catch (error) {
    const latencyMs = Math.round(performance.now() - t0);
    void logRead({
      accountId,
      userId: auth.userId ?? null,
      toolName,
      clientSource: auth.clientName,
      platform: "meta_ads",
      telemetry: buildTelemetry(ctx, latencyMs, 0, ERROR_CLASS.THROWN, describeError(error)),
    });
    throw error;
  }
  const latencyMs = Math.round(performance.now() - t0);
  queueMicrotask(() => {
    const bytesOut = byteLengthOf(result);
    void logRead({
      accountId,
      userId: auth.userId ?? null,
      toolName,
      clientSource: auth.clientName,
      platform: "meta_ads",
      telemetry: buildTelemetry(ctx, latencyMs, bytesOut, null),
    });
    trackServerEvent(auth.userId ?? null, "ai_read_executed", {
      platform: "meta_ads",
      tool_name: toolName,
      account_id: accountId,
      campaign_id: null,
      client_name: auth.clientName ?? null,
      client_version: auth.clientVersion ?? null,
      auth_method: auth.authMethod ?? null,
      user_agent: auth.userAgent ?? null,
      latency_ms: latencyMs,
      bytes_out: bytesOut,
    });
  });
  recordOperation(auth.userId ?? null);
  return result;
}
