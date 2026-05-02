import "server-only";
import type { Session } from "@/lib/session";

/**
 * Decide where to send a user who tried to use a Google-Ads-only surface
 * but lacks a Google customer. Multi-platform aware:
 *
 *   - Not signed in           → /login (caller decides whether to bounce).
 *   - 0 platforms connected   → /manage-ads-accounts (the onboarding hub).
 *   - Meta-only user          → /connect/meta-ads (Meta's natural home; the
 *                               Google-only feature isn't usable for them).
 *
 * Returns null when the user actually has a Google customer — caller should
 * keep going (the "Not authenticated" gate must be triggered by something
 * else, not an absence of platforms).
 */
export function unsupportedFeatureRedirect(session: Session): string | null {
  if (!session.connected) return "/login";
  const hasGoogle = !session.pendingSetup && session.customerId !== "";
  const hasMeta = session.metaAccounts.length > 0;
  if (!hasGoogle && !hasMeta) return "/manage-ads-accounts";
  if (!hasGoogle && hasMeta) return "/connect/meta-ads";
  return null;
}
