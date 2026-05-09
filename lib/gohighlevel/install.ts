/**
 * Persist HighLevel install results: agency-level OAuth tokens, single-
 * location installs, and bulk agency installs that fan out across many
 * locations.
 *
 * Bulk install path:
 *   1. Caller exchanges the auth code for a Company token (handled by the
 *      OAuth callback). The `isBulkInstallation: true` flag tells us the
 *      install was performed at the agency level for one-or-more locations.
 *   2. We upsert the company-level row first.
 *   3. We call `listInstalledLocations` with the agency token + appId, then
 *      mint a Location token per returned location and upsert one row per
 *      location pointed back at the agency row via `agencyConnectionId`.
 *   4. Per-location failures are caught and surfaced in the return value;
 *      they do NOT block the agency-level connection from being persisted.
 */
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto/secrets";
import {
  createLocationAccessToken,
  listInstalledLocations,
  parseScopes,
  type GoHighLevelTokenResponse,
} from "./oauth";

export type PersistTokenInput = {
  userId: string;
  token: GoHighLevelTokenResponse;
  /** Optional override for the agency connection id when minting per-location rows. */
  agencyConnectionId?: number | null;
  /** App id from `GOHIGHLEVEL_APP_ID` env or upstream — needed for bulk install enumeration. */
  appId?: string | null;
};

export type PersistedConnection = {
  id: number;
  userId: string;
  connectionKey: string;
  companyId: string | null;
  locationId: string | null;
  userType: string;
  agencyConnectionId: number | null;
};

function buildConnectionKey(token: Pick<GoHighLevelTokenResponse, "companyId" | "locationId" | "userId">): string {
  if (token.locationId) return `location:${token.companyId ?? "unknown"}:${token.locationId}`;
  return `company:${token.companyId ?? token.userId ?? "unknown"}`;
}

export async function upsertGoHighLevelConnection(
  input: PersistTokenInput,
): Promise<PersistedConnection> {
  const { token, userId } = input;
  const userType = token.userType ?? (token.locationId ? "Location" : "Company");
  const connectionKey = buildConnectionKey(token);
  const accessTokenExpiresAt = new Date(Date.now() + (token.expires_in ?? 86400) * 1000);
  const scopes = parseScopes(token.scope);
  const platformMetadata = {
    upstream_user_id: token.userId ?? null,
    refresh_token_id: token.refreshTokenId ?? null,
    is_bulk_installation: token.isBulkInstallation ?? null,
    trace_id: token.traceId ?? null,
    connected_at: new Date().toISOString(),
  };

  const insertValues = {
    userId,
    connectionKey,
    companyId: token.companyId ?? null,
    locationId: token.locationId ?? null,
    userType,
    refreshToken: encryptSecret(token.refresh_token),
    accessToken: encryptSecret(token.access_token),
    accessTokenExpiresAt,
    scopes,
    platformMetadata,
    appId: input.appId ?? null,
    agencyConnectionId: input.agencyConnectionId ?? null,
    uninstalledAt: null,
  };

  // Upsert returning the row id. Drizzle's onConflictDoUpdate ignores RETURNING
  // when the conflict path doesn't fire; do an explicit re-select to keep the
  // shape consistent across insert and update branches.
  await db()
    .insert(schema.goHighLevelConnections)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [
        schema.goHighLevelConnections.userId,
        schema.goHighLevelConnections.connectionKey,
      ],
      set: {
        userType,
        refreshToken: insertValues.refreshToken,
        accessToken: insertValues.accessToken,
        accessTokenExpiresAt,
        scopes,
        platformMetadata,
        appId: insertValues.appId,
        agencyConnectionId: insertValues.agencyConnectionId,
        // Re-installing via OAuth clears any soft-delete bit.
        uninstalledAt: null,
        updatedAt: new Date(),
      },
    });

  const [row] = await db()
    .select({
      id: schema.goHighLevelConnections.id,
      userId: schema.goHighLevelConnections.userId,
      connectionKey: schema.goHighLevelConnections.connectionKey,
      companyId: schema.goHighLevelConnections.companyId,
      locationId: schema.goHighLevelConnections.locationId,
      userType: schema.goHighLevelConnections.userType,
      agencyConnectionId: schema.goHighLevelConnections.agencyConnectionId,
    })
    .from(schema.goHighLevelConnections)
    .where(
      and(
        eq(schema.goHighLevelConnections.userId, userId),
        eq(schema.goHighLevelConnections.connectionKey, connectionKey),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("Upsert succeeded but row not found — should not happen.");
  }
  return row as PersistedConnection;
}

export type BulkExpansionResult = {
  agency: PersistedConnection;
  locations: Array<{ locationId: string; status: "ok" | "failed"; reason?: string; connectionId?: number }>;
};

/**
 * Expand a Company-level token marked `isBulkInstallation: true` into per-
 * location rows. Best-effort: per-location failures are reported in the
 * `locations` array but do not throw.
 */
export async function expandBulkInstall(opts: {
  agency: PersistedConnection;
  agencyAccessToken: string;
  appId: string;
}): Promise<BulkExpansionResult> {
  const { agency, agencyAccessToken, appId } = opts;
  if (!agency.companyId) {
    return { agency, locations: [] };
  }

  let installed: { _id: string; name?: string }[] = [];
  try {
    const resp = await listInstalledLocations({
      agencyAccessToken,
      companyId: agency.companyId,
      appId,
    });
    installed = (resp.locations ?? []).filter((loc) => loc.isInstalled !== false);
  } catch (e) {
    console.warn("[ghl-install] listInstalledLocations failed:", e);
    return { agency, locations: [] };
  }

  const results: BulkExpansionResult["locations"] = [];
  for (const loc of installed) {
    try {
      const token = await createLocationAccessToken({
        agencyAccessToken,
        companyId: agency.companyId,
        locationId: loc._id,
      });
      const persisted = await upsertGoHighLevelConnection({
        userId: agency.userId,
        token: { ...token, locationId: token.locationId ?? loc._id, companyId: token.companyId ?? agency.companyId, userType: "Location" },
        agencyConnectionId: agency.id,
        appId,
      });
      // Stamp the location name if HighLevel returned one.
      if (loc.name) {
        await db()
          .update(schema.goHighLevelConnections)
          .set({ locationName: loc.name, updatedAt: new Date() })
          .where(eq(schema.goHighLevelConnections.id, persisted.id));
      }
      results.push({ locationId: loc._id, status: "ok", connectionId: persisted.id });
    } catch (e) {
      results.push({
        locationId: loc._id,
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { agency, locations: results };
}
