import { logChange, logRead } from "@/lib/db/tracking";
import { invalidateCache } from "@/lib/google-ads";
import type { WriteResult } from "@/lib/google-ads";
import { enforceRateLimit, recordOperation } from "@/lib/mcp/rate-limit";
import { trackServerEvent } from "@/lib/analytics-server";

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
};

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
): Promise<WriteResult & { changeId: number | null }> {
  await enforceRateLimit(auth.userId);
  const result = await fn();

  // Log + count every returned WriteResult, success or failure. Rationale: Google counts every
  // attempted mutate op toward its quota, and we err on the side of over-counting so the user's
  // daily limit can't be under-reported. Pre-validation rejections count too — trivial over-count
  // vs Google but simpler and safer than tracking per-call reached-api state. Throws from fn()
  // still propagate uncounted (network outages shouldn't charge the user).
  if (result.success) invalidateCache(accountId);
  const change = await logChange(accountId, auth.userId, campaignId, result, reasoning, auth.clientName);
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
  });
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
  await enforceRateLimit(auth.userId);
  const result = await fn();
  void logRead(accountId, auth.userId, toolName, campaignId, auth.clientName);
  recordOperation(auth.userId);
  trackServerEvent(auth.userId, "ai_read_executed", {
    tool_name: toolName,
    account_id: accountId,
    campaign_id: campaignId ?? null,
    client_name: auth.clientName ?? null,
    client_version: auth.clientVersion ?? null,
    auth_method: auth.authMethod ?? null,
    user_agent: auth.userAgent ?? null,
  });
  return result;
}
