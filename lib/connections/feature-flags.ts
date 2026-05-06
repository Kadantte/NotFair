import { getEnvBool } from "@/lib/env";

/**
 * Phase-2 rollout flag for the mcp_sessions → ad_platform_connections migration.
 *
 * When `true`:
 * - lib/session.ts merges connection-row fields (refreshToken, customerId,
 *   customerIds, loginCustomerId, googleEmail) on top of mcp_sessions; the
 *   connection row is the source of truth, mcp_sessions is the cookie binding.
 * - select-account / switch-account read candidates from
 *   ad_platform_connections.accountIds.
 * - New OAuth code → token exchanges for Google bind to connectionId.
 *
 * When `false` (default):
 * - All reads behave exactly as phase-1: mcp_sessions is the source of truth.
 *   The connection row is dual-written but inert at read time.
 *
 * Shadow-read instrumentation (PostHog `google_connection_mismatch`) runs in
 * both states so we can validate parity before flipping the flag.
 *
 * See docs/plans/mcp-sessions-to-connections-migration.md, phase 2.
 */
export function readGoogleFromConnections(): boolean {
  return getEnvBool("READ_GOOGLE_FROM_CONNECTIONS");
}
