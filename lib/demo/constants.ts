import type { AuthContext } from "@/lib/google-ads";

/**
 * Sentinel customer ID used to mark a session as demo/test mode.
 * 10-digit numeric ID so any `safeEntityId` checks that validate numeric
 * IDs pass through — but intentionally outside the real Google Ads CID space
 * that any real user would hold.
 */
export const DEMO_CUSTOMER_ID = "9999999990";

/** Placeholder value stored in mcp_sessions.refresh_token for demo sessions. */
export const DEMO_REFRESH_TOKEN = "demo-session-no-real-refresh-token";

/** Human-readable name shown in account switcher / banner. */
export const DEMO_CUSTOMER_NAME = "Threadline Apparel (Demo)";

/**
 * Fixed OAuth client credentials for the permanent demo account. These are
 * intentionally public so external reviewers (e.g. Anthropic's MCP review
 * team) can pair NotFair to Claude via the Connector flow without needing
 * a Google account. The secret only unlocks the simulated demo account:
 * all writes are no-ops, and no real Google Ads data is accessible.
 */
export const DEMO_OAUTH_CLIENT_ID = "adsagent_demo_anthropic_review";
export const DEMO_OAUTH_CLIENT_SECRET = "demo_f49b2e1c7a084d63ab3fc8e519d6a2f0b0f3c6d94e7158eaa210c4d2c6f3b971";

/**
 * Marker stored in mcp_sessions.client_name so we can look up the persistent
 * demo session without relying on random access tokens.
 */
export const DEMO_SESSION_MARKER = "demo-oauth-anthropic-review";

export function isDemoCustomerId(customerId: string | null | undefined): boolean {
  return !!customerId && customerId === DEMO_CUSTOMER_ID;
}

export function isDemoAuth(auth: Pick<AuthContext, "customerId">): boolean {
  return isDemoCustomerId(auth.customerId);
}
