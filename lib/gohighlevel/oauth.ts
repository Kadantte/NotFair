import { eq, sql as drizzleSql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getEnv, getRequiredEnv } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { GOHIGHLEVEL_READONLY_SCOPES, GOHIGHLEVEL_SCOPES } from "@/lib/gohighlevel/scopes";

// Re-export so existing callers (server-side install, callback) keep working
// while the client-safe canonical lives in `./scopes`.
export { GOHIGHLEVEL_READONLY_SCOPES, GOHIGHLEVEL_SCOPES };

/**
 * Distinguishes the GHL token-refresh advisory-lock namespace from any other
 * advisory lock the app might use. The keyspace is 32-bit signed; the second
 * argument to `pg_try_advisory_xact_lock(key1, key2)` is the connection id,
 * so picking a unique key1 partitions the lock space by feature.
 */
const GHL_REFRESH_ADVISORY_LOCK_KEY1 = 0x67686c72; // "ghlr"

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
const LOCATION_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/locationToken";
const INSTALLED_LOCATIONS_URL = "https://services.leadconnectorhq.com/oauth/installedLocations";
export const GHL_API_VERSION = "2021-07-28";
const DEFAULT_REDIRECT_PATH = "/api/oauth/crm/callback";

/**
 * Refresh the access token when it has fewer than this many seconds left.
 * Five minutes is a comfortable window — long enough to absorb clock skew
 * and the token-endpoint round trip, short enough to not refresh
 * gratuitously on every call.
 */
const REFRESH_LEEWAY_SECONDS = 5 * 60;

function clientId(): string {
  return getRequiredEnv("GOHIGHLEVEL_CLIENT_ID");
}

export function getGoHighLevelClientId(): string {
  return clientId();
}

function clientSecret(): string {
  return getRequiredEnv("GOHIGHLEVEL_CLIENT_SECRET");
}

export function getGoHighLevelInstallUrl(): string {
  return getRequiredEnv("GOHIGHLEVEL_INSTALL_URL");
}

export function getGoHighLevelRedirectUri(origin: string): string {
  return getEnv("GOHIGHLEVEL_REDIRECT_URI") ?? `${origin}${DEFAULT_REDIRECT_PATH}`;
}

export type GoHighLevelTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token: string;
  scope?: string;
  refreshTokenId?: string;
  userType?: "Company" | "Location" | string;
  companyId?: string;
  locationId?: string;
  userId?: string;
  isBulkInstallation?: boolean;
  traceId?: string;
};

export type GoHighLevelInstalledLocation = {
  _id: string;
  name?: string;
  isInstalled?: boolean;
  address?: string;
};

export type GoHighLevelInstalledLocationsResponse = {
  locations: GoHighLevelInstalledLocation[];
  count?: number;
  installToFutureLocations?: boolean;
};

export function parseScopes(scope: string | undefined): string[] {
  return (scope ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json.message === "string"
      ? json.message
      : typeof json.error === "string"
        ? json.error
        : `HTTP ${res.status}`;
    throw new Error(`HighLevel OAuth request failed: ${message}`);
  }
  return json as Record<string, unknown>;
}

export async function exchangeCodeForToken(opts: {
  code: string;
  redirectUri: string;
  userType?: "Company" | "Location";
}): Promise<GoHighLevelTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "authorization_code",
    code: opts.code,
    user_type: opts.userType ?? "Company",
    redirect_uri: opts.redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return (await parseJsonResponse(res)) as GoHighLevelTokenResponse;
}

export async function refreshAccessToken(opts: {
  refreshToken: string;
  redirectUri: string;
  userType?: "Company" | "Location";
}): Promise<GoHighLevelTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    user_type: opts.userType ?? "Company",
    redirect_uri: opts.redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return (await parseJsonResponse(res)) as GoHighLevelTokenResponse;
}

export async function createLocationAccessToken(opts: {
  agencyAccessToken: string;
  companyId: string;
  locationId: string;
}): Promise<GoHighLevelTokenResponse> {
  const res = await fetch(LOCATION_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Version: GHL_API_VERSION,
      Authorization: `Bearer ${opts.agencyAccessToken}`,
    },
    body: new URLSearchParams({
      companyId: opts.companyId,
      locationId: opts.locationId,
    }),
  });
  return (await parseJsonResponse(res)) as GoHighLevelTokenResponse;
}

/**
 * Enumerate the locations a given agency has installed an app at. Used by
 * the bulk-install path to mint per-location tokens after an agency-level
 * OAuth completes with `isBulkInstallation: true`.
 */
export async function listInstalledLocations(opts: {
  agencyAccessToken: string;
  companyId: string;
  appId: string;
  limit?: number;
  skip?: number;
}): Promise<GoHighLevelInstalledLocationsResponse> {
  const params = new URLSearchParams({
    companyId: opts.companyId,
    appId: opts.appId,
    limit: String(opts.limit ?? 100),
    skip: String(opts.skip ?? 0),
  });
  const res = await fetch(`${INSTALLED_LOCATIONS_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Version: GHL_API_VERSION,
      Authorization: `Bearer ${opts.agencyAccessToken}`,
    },
  });
  return (await parseJsonResponse(res)) as GoHighLevelInstalledLocationsResponse;
}

// ──────────────────────────────────────────────────────────────────────
// getValidAccessToken — auto-refresh-on-demand
// ──────────────────────────────────────────────────────────────────────

type ConnectionLike = {
  id: number;
  userType: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
};

async function loadConnection(connectionId: number): Promise<ConnectionLike | null> {
  const [row] = await db()
    .select({
      id: schema.goHighLevelConnections.id,
      userType: schema.goHighLevelConnections.userType,
      refreshToken: schema.goHighLevelConnections.refreshToken,
      accessToken: schema.goHighLevelConnections.accessToken,
      accessTokenExpiresAt: schema.goHighLevelConnections.accessTokenExpiresAt,
    })
    .from(schema.goHighLevelConnections)
    .where(eq(schema.goHighLevelConnections.id, connectionId))
    .limit(1);
  return row ?? null;
}

function isExpired(expiresAt: Date | null, leewaySeconds = REFRESH_LEEWAY_SECONDS): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - Date.now() <= leewaySeconds * 1000;
}

/**
 * Resolve a connection id to a currently-valid access token, refreshing
 * on the fly when the stored token is within the leeway window of expiry.
 *
 * Concurrency model:
 *   HighLevel rotates the refresh_token on every refresh and invalidates the
 *   prior one. Two concurrent calls that both see a near-expired token would
 *   both POST the SAME refresh_token; the second post returns invalid_grant
 *   and bricks the connection. We avoid this with a per-connection Postgres
 *   transactional advisory lock — only one refresh runs at a time per
 *   connection id; the loser re-loads the row inside the same transaction
 *   and reuses the freshly-stored access_token.
 *
 * Throws when the connection doesn't exist or the upstream refresh call
 * fails. Callers should treat a thrown error as "this connection needs
 * re-OAuth" and surface that to the user.
 */
export async function getValidAccessToken(
  connectionId: number,
  opts?: { redirectUri?: string },
): Promise<string> {
  // Fast path: no lock needed when the cached token is comfortably valid.
  const fastPath = await loadConnection(connectionId);
  if (!fastPath) throw new Error(`HighLevel connection ${connectionId} not found.`);
  if (fastPath.accessToken && !isExpired(fastPath.accessTokenExpiresAt)) {
    return decryptSecret(fastPath.accessToken);
  }

  // Slow path: take an advisory lock keyed on the connection id, re-check
  // expiry inside the lock (another concurrent refresh may already have
  // landed), and refresh once if still needed.
  const drizzleDb = db();
  return await drizzleDb.transaction(async (tx) => {
    await tx.execute(
      drizzleSql`SELECT pg_advisory_xact_lock(${GHL_REFRESH_ADVISORY_LOCK_KEY1}, ${connectionId})`,
    );

    // Re-load inside the lock. If a peer just refreshed, we'll see their token.
    const [conn] = await tx
      .select({
        id: schema.goHighLevelConnections.id,
        userType: schema.goHighLevelConnections.userType,
        refreshToken: schema.goHighLevelConnections.refreshToken,
        accessToken: schema.goHighLevelConnections.accessToken,
        accessTokenExpiresAt: schema.goHighLevelConnections.accessTokenExpiresAt,
      })
      .from(schema.goHighLevelConnections)
      .where(eq(schema.goHighLevelConnections.id, connectionId))
      .limit(1);

    if (!conn) throw new Error(`HighLevel connection ${connectionId} not found.`);

    if (conn.accessToken && !isExpired(conn.accessTokenExpiresAt)) {
      return decryptSecret(conn.accessToken);
    }

    const refreshTokenPlain = decryptSecret(conn.refreshToken);
    const userType = conn.userType === "Location" ? "Location" : "Company";
    const redirectUri = opts?.redirectUri
      ?? getEnv("GOHIGHLEVEL_REDIRECT_URI")
      ?? `${getEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000"}${DEFAULT_REDIRECT_PATH}`;

    const refreshed = await refreshAccessToken({
      refreshToken: refreshTokenPlain,
      redirectUri,
      userType,
    });

    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 86400) * 1000);
    await tx
      .update(schema.goHighLevelConnections)
      .set({
        accessToken: encryptSecret(refreshed.access_token),
        accessTokenExpiresAt: newExpiresAt,
        refreshToken: encryptSecret(refreshed.refresh_token),
        updatedAt: new Date(),
      })
      .where(eq(schema.goHighLevelConnections.id, connectionId));

    return refreshed.access_token;
  });
}
