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
  if (!result.success) return { ...result, changeId: null };

  invalidateCache(accountId);
  const change = await logChange(accountId, auth.userId, campaignId, result, reasoning);
  recordOperation(auth.userId);
  trackServerEvent(auth.userId, "ai_change_executed", {
    tool_name: result.action,
    entity_type: result.action.includes("keyword") || result.action.includes("bid") ? "keyword" : "campaign",
    account_id: accountId,
    campaign_id: campaignId,
    before_value: result.beforeValue || null,
    after_value: result.afterValue || null,
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
  void logRead(accountId, auth.userId, toolName, campaignId);
  recordOperation(auth.userId);
  trackServerEvent(auth.userId, "ai_read_executed", {
    tool_name: toolName,
    account_id: accountId,
    campaign_id: campaignId ?? null,
  });
  return result;
}
