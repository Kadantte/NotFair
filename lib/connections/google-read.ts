import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  parseCustomerIds,
  type ConnectedAccount,
} from "@/lib/google-ads/types";
import { trackServerEvent } from "@/lib/analytics-server";

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

/**
 * Shadow-read comparison: emits `google_connection_mismatch` to PostHog when
 * mcp_sessions and ad_platform_connections disagree. Runs in both flag states
 * so we can validate parity before flipping `READ_GOOGLE_FROM_CONNECTIONS=true`
 * — and keep validating afterward in case dual-write regresses.
 *
 * Cheap to call on every session read: fields are scalars / small arrays.
 */
export function compareForShadowRead(args: {
  userId: string;
  fromSession: {
    refreshToken: string;
    customerId: string;
    customerIds: string;
    loginCustomerId: string | null;
    googleEmail: string | null;
  };
  fromConnection: GoogleConnectionView | null;
  /**
   * Where the comparison was triggered. Lets us aggregate by surface in
   * PostHog (session-load, select-account, switch-account, etc.) and spot
   * if a specific path is leaking dual-write failures.
   */
  source: string;
}): void {
  const { userId, fromSession, fromConnection, source } = args;

  // Missing connection row is itself a mismatch — phase-1 dual-write was
  // supposed to populate one for every live mcp_sessions user. Surface it
  // separately from field-level diffs so we know to re-run the backfill.
  if (!fromConnection) {
    trackServerEvent(userId, "google_connection_mismatch", {
      source,
      kind: "missing_connection_row",
    });
    return;
  }

  const sessionAccounts = parseCustomerIds(fromSession.customerIds);
  const diffs: Record<string, { session: unknown; connection: unknown }> = {};

  if (fromSession.refreshToken !== fromConnection.refreshToken) {
    diffs.refreshToken = {
      // Don't ship full token values to PostHog — hash to a short fingerprint.
      session: fingerprint(fromSession.refreshToken),
      connection: fingerprint(fromConnection.refreshToken),
    };
  }
  if (fromSession.customerId !== fromConnection.customerId) {
    diffs.customerId = {
      session: fromSession.customerId,
      connection: fromConnection.customerId,
    };
  }
  if (!accountListsEqual(sessionAccounts, fromConnection.customerIds)) {
    diffs.customerIds = {
      session: sessionAccounts.map(simplifyAccount),
      connection: fromConnection.customerIds.map(simplifyAccount),
    };
  }
  if ((fromSession.loginCustomerId ?? null) !== (fromConnection.loginCustomerId ?? null)) {
    diffs.loginCustomerId = {
      session: fromSession.loginCustomerId,
      connection: fromConnection.loginCustomerId,
    };
  }
  // googleEmail intentionally not shadow-checked: phase-1 dual-write only
  // populates it on fresh writes; older connection rows may have empty
  // platformMetadata. Reads continue to source it from mcp_sessions until
  // phase 4 cuts the cookie path entirely.

  if (Object.keys(diffs).length === 0) return;

  trackServerEvent(userId, "google_connection_mismatch", {
    source,
    kind: "field_diff",
    fields: Object.keys(diffs),
    diffs,
  });
}

function accountListsEqual(
  a: ConnectedAccount[],
  b: ConnectedAccount[],
): boolean {
  if (a.length !== b.length) return false;
  // Order matters in mcp_sessions today (curation order); compare positionally.
  return a.every((aa, i) => {
    const bb = b[i];
    if (!bb) return false;
    if (aa.id !== bb.id) return false;
    if ((aa.name ?? "") !== (bb.name ?? "")) return false;
    const aLcid = "loginCustomerId" in aa ? aa.loginCustomerId ?? null : undefined;
    const bLcid = "loginCustomerId" in bb ? bb.loginCustomerId ?? null : undefined;
    return aLcid === bLcid;
  });
}

function simplifyAccount(a: ConnectedAccount): Record<string, unknown> {
  return {
    id: a.id,
    name: a.name,
    ...("loginCustomerId" in a ? { loginCustomerId: a.loginCustomerId } : {}),
  };
}

function fingerprint(value: string): string {
  // 8 hex chars is enough to spot drift without leaking the token.
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
