/**
 * GoHighLevel MCP route at `/api/mcp/gohighlevel`.
 *
 * Two auth paths land here:
 *
 * 1. **Personal Access Tokens** (`ghl_pat_<connectionId>_<random>`) — minted
 *    by the user from /connect/gohighlevel for direct CLI/Codex/etc. use.
 *    Lookup: SHA-256 the token, search `gohighlevel_access_tokens.token_hash`.
 *
 * 2. **Claude consumer-OAuth tokens** (`oat_gohighlevel_<random>`) — minted
 *    by Claude.ai's "Add custom connector" flow via /api/oauth/authorize +
 *    /api/oauth/token when `resource=/api/mcp/gohighlevel`. Lookup:
 *    `oauth_access_tokens.token` join `gohighlevel_connections` via the new
 *    `gohighlevel_connection_id` column. Audience-checked against this
 *    resource's platform.
 *
 * Both paths build the same `GhlAuthContext` for tools.
 *
 * Schema introspection (`initialize` / `tools/list`) is permitted without a
 * bearer so MCP clients can probe before pairing.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler } from "mcp-handler";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  GHL_MCP_INSTRUCTIONS,
  registerGoHighLevelTools,
  type GhlAuthContext,
} from "@/lib/gohighlevel/mcp-tools";
import { GHL_PAT_PREFIX, hashPat, parseConnectionIdFromPat } from "@/lib/gohighlevel/pat";
import { hasAllGoHighLevelReadonlyScopes } from "@/lib/gohighlevel/scopes";
import { findResource } from "@/lib/mcp/resources";

export const runtime = "nodejs";

const RESOURCE_URL_PATH = "/api/mcp/gohighlevel";
const OAT_PREFIX = findResource(RESOURCE_URL_PATH)?.tokenPrefix ?? "oat_gohighlevel_";
const SCHEMA_METHODS = new Set(["initialize", "tools/list", "notifications/initialized"]);

const authStore = new AsyncLocalStorage<GhlAuthContext>();

function currentAuth(): GhlAuthContext {
  const auth = authStore.getStore();
  if (!auth) throw new Error("No auth context — request not authenticated.");
  return auth;
}

const mcpHandler = createMcpHandler(
  (server) => {
    registerGoHighLevelTools(server, currentAuth);
  },
  {
    instructions: GHL_MCP_INSTRUCTIONS,
    serverInfo: {
      name: "notfair-gohighlevel-mcp",
      version: "1.0.0",
    },
  },
  {
    basePath: undefined,
    streamableHttpEndpoint: RESOURCE_URL_PATH,
    sseEndpoint: `${RESOURCE_URL_PATH}/sse`,
    sseMessageEndpoint: `${RESOURCE_URL_PATH}/message`,
    disableSse: true,
    maxDuration: 60,
  },
);

async function resolveOatAuth(bearerToken: string): Promise<GhlAuthContext> {
  // Look up oauth_access_tokens by the literal token. The polymorphic FK
  // points at gohighlevel_connections via gohighlevel_connection_id; we
  // insist on that being non-null so a Google/Meta token can never auth here
  // even if it shares a prefix collision.
  const [row] = await db()
    .select({
      gohighlevelConnectionId: schema.oauthAccessTokens.gohighlevelConnectionId,
      resourceUrl: schema.oauthAccessTokens.resourceUrl,
      connectionId: schema.goHighLevelConnections.id,
      userId: schema.goHighLevelConnections.userId,
      companyId: schema.goHighLevelConnections.companyId,
      locationId: schema.goHighLevelConnections.locationId,
      userType: schema.goHighLevelConnections.userType,
      scopes: schema.goHighLevelConnections.scopes,
      uninstalledAt: schema.goHighLevelConnections.uninstalledAt,
    })
    .from(schema.oauthAccessTokens)
    .innerJoin(
      schema.goHighLevelConnections,
      eq(schema.oauthAccessTokens.gohighlevelConnectionId, schema.goHighLevelConnections.id),
    )
    .where(eq(schema.oauthAccessTokens.token, bearerToken))
    .limit(1);

  if (!row) throw new Error("OAuth token not found or not bound to a HighLevel connection.");

  // Audience check: token's resource_url must be this MCP's resource path.
  // findResource of any OTHER platform here would be a misrouted token.
  const tokenResource = row.resourceUrl ?? RESOURCE_URL_PATH;
  const tokenPlatform = findResource(tokenResource)?.platform;
  if (tokenPlatform !== "gohighlevel") {
    throw new Error(
      `Token audience mismatch — issued for ${tokenPlatform ?? "unknown"} platform, this resource is gohighlevel.`,
    );
  }
  if (row.uninstalledAt) {
    throw new Error("HighLevel app has been uninstalled for this connection.");
  }
  if (!hasAllGoHighLevelReadonlyScopes(row.scopes)) {
    throw new Error("HighLevel connection needs reauthorization for the current read-only scope set.");
  }

  return {
    connectionId: row.connectionId,
    userId: row.userId,
    companyId: row.companyId,
    locationId: row.locationId,
    userType: row.userType,
  };
}

async function resolvePatAuth(bearerToken: string): Promise<GhlAuthContext> {
  // Fast pre-filter on the connection id embedded in the token. The hash
  // lookup is the actual authentication; the prefix short-circuits obviously
  // wrong tokens before the DB hit.
  const candidateConnId = parseConnectionIdFromPat(bearerToken);
  if (candidateConnId == null) throw new Error("Malformed PAT.");

  const tokenHash = hashPat(bearerToken);
  const [row] = await db()
    .select({
      tokenId: schema.goHighLevelAccessTokens.id,
      connectionId: schema.goHighLevelConnections.id,
      userId: schema.goHighLevelConnections.userId,
      companyId: schema.goHighLevelConnections.companyId,
      locationId: schema.goHighLevelConnections.locationId,
      userType: schema.goHighLevelConnections.userType,
      scopes: schema.goHighLevelConnections.scopes,
      uninstalledAt: schema.goHighLevelConnections.uninstalledAt,
    })
    .from(schema.goHighLevelAccessTokens)
    .innerJoin(
      schema.goHighLevelConnections,
      eq(schema.goHighLevelAccessTokens.connectionId, schema.goHighLevelConnections.id),
    )
    .where(
      and(
        eq(schema.goHighLevelAccessTokens.tokenHash, tokenHash),
        isNull(schema.goHighLevelAccessTokens.revokedAt),
      ),
    )
    .limit(1);

  if (!row) throw new Error("PAT not found or revoked.");
  if (row.connectionId !== candidateConnId) throw new Error("PAT/connection mismatch.");
  if (row.uninstalledAt) throw new Error("HighLevel app has been uninstalled for this connection.");
  if (!hasAllGoHighLevelReadonlyScopes(row.scopes)) {
    throw new Error("HighLevel connection needs reauthorization for the current read-only scope set.");
  }

  // Best-effort touch of last_used_at — fire-and-forget.
  void db()
    .update(schema.goHighLevelAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.goHighLevelAccessTokens.id, row.tokenId))
    .catch(() => {
      // Telemetry write failures should never break a tool call.
    });

  return {
    connectionId: row.connectionId,
    userId: row.userId,
    companyId: row.companyId,
    locationId: row.locationId,
    userType: row.userType,
  };
}

async function resolveAuth(request: Request): Promise<GhlAuthContext> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!bearerToken) {
    throw new Error(
      "Missing Bearer token. Add the connector in Claude or issue a PAT at /connect/gohighlevel.",
    );
  }

  if (bearerToken.startsWith(OAT_PREFIX)) {
    return await resolveOatAuth(bearerToken);
  }
  if (bearerToken.startsWith(GHL_PAT_PREFIX)) {
    return await resolvePatAuth(bearerToken);
  }
  throw new Error(
    `Token prefix not recognized. Expected ${OAT_PREFIX}* (Claude OAuth) or ${GHL_PAT_PREFIX}* (PAT).`,
  );
}

async function isSchemaRequest(request: Request): Promise<{ schemaOnly: boolean; cloned: Request }> {
  if (request.method !== "POST") return { schemaOnly: false, cloned: request };
  // Clone first, parse the clone — leaves the original body stream untouched
  // for downstream handlers. Reading `request.json()` here would consume the
  // stream and break any subsequent middleware that also reads the body.
  const cloned = request.clone();
  const probe = request.clone();
  try {
    const body = await probe.json();
    const method = body?.method;
    return { schemaOnly: typeof method === "string" && SCHEMA_METHODS.has(method), cloned };
  } catch {
    return { schemaOnly: false, cloned };
  }
}

async function handler(request: Request): Promise<Response> {
  let auth: GhlAuthContext | null = null;
  try {
    auth = await resolveAuth(request);
  } catch (e) {
    const { schemaOnly, cloned } = await isSchemaRequest(request);
    if (schemaOnly) return mcpHandler(cloned);

    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const resourceMetadata =
      `${proto}://${host}/.well-known/oauth-protected-resource${RESOURCE_URL_PATH}`;
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Authentication required" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
        },
      },
    );
  }

  return authStore.run(auth, () => mcpHandler(request));
}

export { handler as GET, handler as POST, handler as DELETE };
