import { logChange, logRead, ERROR_CLASS, type CallTelemetry, type ErrorClass } from "@/lib/db/tracking";
import { autoTrackChangeIntervention } from "@/lib/db/interventions";
import { authForAccount, extractErrorMessage, invalidateCache } from "@/lib/google-ads";
import type { ConnectedAccount, WriteResult } from "@/lib/google-ads";
import { enforceRateLimit, recordOperation, RateLimitError } from "@/lib/mcp/rate-limit";
import { trackServerEvent } from "@/lib/analytics-server";
import { getTelemetry, type ToolCallTelemetry } from "@/lib/mcp/telemetry";
import { redactAndTruncate, sha256Hex, byteLengthOf } from "@/lib/db/redact";
import { syncAccountSnapshot } from "@/lib/google-ads/sync-account";

/**
 * Minimal auth needed for tool execution: refresh token, customer ID, and user ID.
 * Compatible with both AuthContext (MCP) and AgentAuth (chat).
 */
export type ToolAuth = {
  refreshToken: string;
  customerId: string;
  userId?: string | null;
  clientName?: string | null;
  clientVersion?: string | null;
  /** "oauth" (Claude Connector) or "direct" (Bearer token) or "chat" (web UI agent) */
  authMethod?: string | null;
  /** User-Agent header from the HTTP request (usually mcp-remote's UA, not the end client) */
  userAgent?: string | null;
  /** mcp_sessions.id for MCP paths. Null for chat/agent paths. */
  sessionId?: number | null;
  /** Connected accounts for sessions that can target more than one Google Ads customer. */
  customerIds?: ConnectedAccount[];
  /** Google Ads manager account header, when this customer is accessed through an MCC. */
  loginCustomerId?: string | null;
};

const SNAPSHOT_REFRESH_ACTIONS = new Set([
  "create_campaign",
  "createCampaign",
  "pause_campaign",
  "pauseCampaign",
  "enable_campaign",
  "enableCampaign",
  "remove_campaign",
  "removeCampaign",
  "update_budget",
  "updateCampaignBudget",
]);

async function refreshAccountSnapshotIfNeeded(auth: ToolAuth, accountId: string, result: WriteResult) {
  if (!result.success || !SNAPSHOT_REFRESH_ACTIONS.has(result.action)) return;

  try {
    const targetAuth = authForAccount(auth, accountId);
    await syncAccountSnapshot({
      refreshToken: targetAuth.refreshToken,
      customerId: targetAuth.customerId,
      loginCustomerId: targetAuth.loginCustomerId ?? undefined,
    });
  } catch (err) {
    console.warn(`[sync-account] Failed to refresh snapshot after ${result.action} for ${accountId}:`, err);
  }
}

/**
 * Snapshot the telemetry context while we're still inside the AsyncLocalStorage
 * frame. Deferred work reads from this snapshot instead of calling
 * `getTelemetry()` after we've fire-and-forgot the logging step.
 */
function buildTelemetry(
  ctx: ToolCallTelemetry | undefined,
  auth: ToolAuth,
  latencyMs: number,
  bytesOut: number | null,
  errorClass: ErrorClass | null,
  errorMessage: string | null = null,
): CallTelemetry {
  const redactedArgs = ctx ? redactAndTruncate(ctx.args) : null;
  return {
    sessionId: auth.sessionId ?? null,
    requestId: ctx?.requestId ?? null,
    toolName: ctx?.toolName ?? null,
    args: redactedArgs,
    argsSha256: redactedArgs == null ? null : sha256Hex(redactedArgs),
    latencyMs,
    bytesOut,
    errorClass,
    errorMessage,
  };
}

/**
 * Execute a write operation with rate limiting, cache invalidation, and change logging.
 * Single code path used by both MCP tools and the chat agent.
 *
 * @returns The write result with a `changeId` attached (null if logging failed).
 */
export async function execWrite(
  auth: ToolAuth,
  accountId: string,
  campaignId: string | null,
  fn: () => Promise<WriteResult>,
  reasoning?: string,
  // Bulk fan-out handlers call the real Google API once upstream, then invoke
  // execWrite N times with `fn = async () => result` to log per-item rows for
  // undo/impact history. Timing the stub reads 0ms, which collapses the
  // /dev/telemetry p50/p95 for every bulk write. The caller measures the real
  // API latency and threads it in here so every fan-out row carries the same
  // honest invocation latency.
  options?: { overrideLatencyMs?: number },
): Promise<WriteResult & { changeId: number | null }> {
  await enforceRateLimit(auth.userId);
  const ctx = getTelemetry();
  const t0 = performance.now();
  let result: WriteResult;
  try {
    result = await fn();
  } catch (error) {
    // Network/runtime throws propagate uncounted — the user's quota shouldn't
    // charge for infra failures — but we still log a telemetry row so the
    // admin dashboard sees the outage.
    const latencyMs = options?.overrideLatencyMs ?? Math.round(performance.now() - t0);
    // Normalize unknown throws (GoogleAdsFailure, raw objects, strings) into a
    // readable string so telemetry rows aren't THROWN+NULL. `log: false`
    // avoids double-logging since the caller will still see the re-throw.
    const errorMessage = extractErrorMessage(error, { log: false });
    if (ctx?.toolName) {
      void logRead({
        accountId,
        userId: auth.userId,
        toolName: ctx.toolName,
        campaignId,
        clientSource: auth.clientName,
        telemetry: buildTelemetry(ctx, auth, latencyMs, 0, ERROR_CLASS.THROWN, errorMessage),
      });
    }
    throw error;
  }

  if (result.success) invalidateCache(accountId);
  const latencyMs = options?.overrideLatencyMs ?? Math.round(performance.now() - t0);
  const bytesOut = byteLengthOf(result);
  const telemetry = buildTelemetry(
    ctx,
    auth,
    latencyMs,
    bytesOut,
    result.success ? null : ERROR_CLASS.WRITE_REJECTED,
  );
  const change = await logChange({
    accountId,
    userId: auth.userId,
    campaignId,
    writeResult: result,
    reasoning,
    clientSource: auth.clientName,
    telemetry,
  });
  recordOperation(auth.userId);
  trackServerEvent(auth.userId, result.success ? "ai_change_executed" : "ai_change_failed", {
    tool_name: result.action,
    entity_type: result.action.includes("keyword") || result.action.includes("bid") ? "keyword" : "campaign",
    account_id: accountId,
    campaign_id: campaignId,
    before_value: result.beforeValue || null,
    after_value: result.afterValue || null,
    error: result.success ? null : result.error ?? null,
    client_name: auth.clientName ?? null,
    client_version: auth.clientVersion ?? null,
    auth_method: auth.authMethod ?? null,
    user_agent: auth.userAgent ?? null,
    latency_ms: latencyMs,
  });
  if (change && result.success) {
    try {
      await autoTrackChangeIntervention({ operation: change });
    } catch (error) {
      console.warn(`[impact-monitor] Failed to attach operation ${change.id} to a change intervention:`, error);
    }
  }
  await refreshAccountSnapshotIfNeeded(auth, accountId, result);
  return { ...result, changeId: change?.id ?? null };
}

/**
 * Execute a read operation with rate limiting and logging.
 * Single code path used by both MCP tools and the chat agent.
 */
export async function execRead<T>(
  auth: ToolAuth,
  accountId: string,
  toolName: string,
  fn: () => Promise<T>,
  campaignId?: string | null,
): Promise<T> {
  const ctx = getTelemetry();
  try {
    await enforceRateLimit(auth.userId);
  } catch (error) {
    if (error instanceof RateLimitError) {
      void logRead({
        accountId,
        userId: auth.userId,
        toolName,
        campaignId,
        clientSource: auth.clientName,
        telemetry: buildTelemetry(
          ctx,
          auth,
          0,
          null,
          ERROR_CLASS.RATE_LIMIT,
          extractErrorMessage(error, { log: false }),
        ),
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
    const errorMessage = extractErrorMessage(error, { log: false });
    void logRead({
      accountId,
      userId: auth.userId,
      toolName,
      campaignId,
      clientSource: auth.clientName,
      telemetry: buildTelemetry(ctx, auth, latencyMs, 0, ERROR_CLASS.THROWN, errorMessage),
    });
    throw error;
  }
  const latencyMs = Math.round(performance.now() - t0);
  // Defer redact + hash + JSON-stringify off the caller's critical path. The
  // await'd promise has already resolved with `result`; the deferred work
  // runs before Node returns to the event loop but after the caller receives
  // the value — so large GAQL results don't pay the serialization cost on
  // the hot path.
  queueMicrotask(() => {
    const bytesOut = byteLengthOf(result);
    const telemetry = buildTelemetry(ctx, auth, latencyMs, bytesOut, null);
    void logRead({
      accountId,
      userId: auth.userId,
      toolName,
      campaignId,
      clientSource: auth.clientName,
      telemetry,
    });
    trackServerEvent(auth.userId, "ai_read_executed", {
      tool_name: toolName,
      account_id: accountId,
      campaign_id: campaignId ?? null,
      client_name: auth.clientName ?? null,
      client_version: auth.clientVersion ?? null,
      auth_method: auth.authMethod ?? null,
      user_agent: auth.userAgent ?? null,
      latency_ms: latencyMs,
      bytes_out: bytesOut,
    });
  });
  recordOperation(auth.userId);
  return result;
}
