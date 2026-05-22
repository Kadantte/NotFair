import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { type ConnectedAccount } from "@/lib/google-ads/types";

/**
 * Phase-2 connection-row view used by readers (`lib/session.ts`,
 * select-account, switch-account). Mirrors the shape `mcp_sessions` exposed,
 * so call sites can swap source without changing downstream merge logic.
 */
export type GoogleConnectionView = {
  refreshToken: string;
  /** Empty string when ads-less or pending multi-account selection (matches mcp_sessions semantics). */
  customerId: string;
  /** Connectable accounts, including per-row loginCustomerId where set. */
  customerIds: ConnectedAccount[];
  /** Session-level loginCustomerId — derived from accountIds[active].loginCustomerId. */
  loginCustomerId: string | null;
  googleEmail: string | null;
};

/**
 * Load the user's Google connection row and project it into the same shape
 * `mcp_sessions` exposed pre-migration. Returns null when the user has no
 * connection row yet (phase-1 dual-write should have created one for every
 * live mcp_sessions user — log a warning in that case).
 */
export async function loadGoogleConnection(
  userId: string,
): Promise<GoogleConnectionView | null> {
  const [row] = await db()
    .select({
      refreshToken: schema.adPlatformConnections.refreshToken,
      activeAccountId: schema.adPlatformConnections.activeAccountId,
      accountIds: schema.adPlatformConnections.accountIds,
      platformMetadata: schema.adPlatformConnections.platformMetadata,
    })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, userId),
        eq(schema.adPlatformConnections.platform, "google_ads"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const customerIds: ConnectedAccount[] = (row.accountIds ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? "",
    // Preserve the absent-vs-null distinction documented in google-ads/types.ts:
    // only emit the field when the persisted row actually carries it.
    ...("loginCustomerId" in a ? { loginCustomerId: a.loginCustomerId } : {}),
  }));

  return {
    refreshToken: row.refreshToken,
    customerId: row.activeAccountId ?? "",
    customerIds,
    loginCustomerId: activeLoginCustomerIdFor(
      row.activeAccountId ?? null,
      customerIds,
    ),
    googleEmail: extractGoogleEmail(row.platformMetadata),
  };
}

/**
 * Resolve the session-level `loginCustomerId` from per-row accountIds. Mirrors
 * how the legacy mcp_sessions field was populated: pick the active account's
 * loginCustomerId, falling back to null when:
 *   - no active account (ads-less / pending selection)
 *   - active account has no loginCustomerId field set
 */
export function activeLoginCustomerIdFor(
  activeAccountId: string | null,
  accounts: ConnectedAccount[],
): string | null {
  if (!activeAccountId) return null;
  const target = accounts.find((a) => a.id === activeAccountId);
  if (!target) return null;
  return target.loginCustomerId ?? null;
}

function extractGoogleEmail(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const email = (metadata as { googleEmail?: unknown }).googleEmail;
  return typeof email === "string" ? email : null;
}

