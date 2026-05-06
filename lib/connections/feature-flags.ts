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

/**
 * Phase-2 Supabase session bridge flag — phase-4 prep.
 *
 * When `true`:
 * - The auth callback **persists** Supabase `sb-*` session cookies instead of
 *   deleting them (today they're cleared after `signInWithIdToken` to keep
 *   total header size under the 8KB limit that produced HTTP 431 errors).
 * - The proxy/middleware refreshes `sb-*` cookies on every protected-path
 *   request so they don't go stale.
 * - lib/session.ts (in a follow-up) prefers the Supabase user_id from the
 *   refreshed session, falling back to `adsagent_token` → mcp_sessions.userId.
 *
 * When `false` (default):
 * - Callback continues deleting sb-* cookies (current behavior); middleware
 *   refresh is a no-op (no sb-* cookies to refresh).
 *
 * Header-size note: Supabase JWTs are ~1–2KB; with adsagent_token + profile
 * cookies already in the header, persisting sb-* gets us close to the 4KB
 * Vercel limit. Audit cookie size before flipping in prod (the original
 * 431 incident is why we delete today).
 *
 * See docs/plans/mcp-sessions-to-connections-migration.md, phase 2.
 */
export function supabaseSessionBridge(): boolean {
  return getEnvBool("SUPABASE_SESSION_BRIDGE");
}
