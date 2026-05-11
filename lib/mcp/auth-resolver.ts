import { db, schema } from "@/lib/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { parseCustomerIds, type AuthContext } from "@/lib/google-ads";
import { trackServerEvent } from "@/lib/analytics-server";
import { DEFAULT_RESOURCE_PATH, findResource, type Platform } from "@/lib/mcp/resources";
import { activeLoginCustomerIdFor } from "@/lib/connections/google-read";
import { normalizeClientName } from "@/lib/mcp/client-info";

/**
 * Per-request auth context shape, common across every platform MCP. Platform-
 * specific fields (Meta business_id, etc.) belong on a separate context type
 * that the factory threads through alongside this one.
 */
export type AuthContextWithSession = AuthContext & {
  sessionToken?: string;
  clientName?: string | null;
  clientVersion?: string | null;
  /** "oauth" (Claude Connector) or "direct" (Bearer token) */
  authMethod?: string | null;
  /** User-Agent header from the HTTP request */
  userAgent?: string | null;
};

/**
 * Subset of `PlatformMcpConfig` that the auth resolver depends on. Defined
 * here so this module doesn't have to import the full factory config (which
 * would create a cycle: handler-factory → auth-resolver → handler-factory).
 */
export type PlatformAuthConfig = {
  platform: Platform;
  resourceUrlPath: string;
  tokenPrefix: string;
  legacyTokenPrefixes: readonly string[];
  acceptDirectBearer?: boolean;
};

/**
 * RFC 8707 audience check. Throws when the token was issued for a different
 * platform than the resource it's being presented at. Cross-URL within the
 * same platform is allowed (legacy `/api/mcp` and `/api/mcp/google_ads` both
 * map to `google_ads`).
 */
export function assertTokenAudience(
  tokenResourceUrl: string | null | undefined,
  expectedPlatform: Platform,
): void {
  const tokenResource = tokenResourceUrl ?? DEFAULT_RESOURCE_PATH;
  const tokenPlatform = findResource(tokenResource)?.platform;
  if (tokenPlatform !== expectedPlatform) {
    throw new Error(
      `Token audience mismatch — issued for ${tokenPlatform ?? "unknown"} platform, this resource is ${expectedPlatform}.`,
    );
  }
}

/**
 * Resolve a Google or Meta MCP request's bearer token to an
 * `AuthContextWithSession`. Throws on any failure mode — caller turns the
 * thrown Error into a 401 response (or a schema-introspection bypass).
 *
 * Polymorphic on `config.platform`: Meta tokens resolve via
 * `oauth_access_tokens` → `ad_platform_connections`, while Google tokens
 * resolve via `oauth_access_tokens` → either `mcp_sessions` (legacy) or
 * `ad_platform_connections` (Phase-2 connection-bound).
 */
export async function resolvePlatformAuth(
  request: Request,
  config: PlatformAuthConfig,
): Promise<AuthContextWithSession> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  // Dev-only bypass: lets the local dev server serve MCP traffic without an
  // OAuth or Bearer handshake, so eval-mcp subagents (which can't do dynamic
  // client registration against localhost) can iterate against uncommitted
  // code. Triple-gated: NODE_ENV must be development, DEV_LOCAL_EMAIL must
  // be explicitly set, and the caller must have sent NO Authorization
  // header (real bearer flows still work in dev). Only honored on the
  // legacy `/api/mcp` resource — platform-explicit paths require real
  // auth so dev tooling can't accidentally pretend to be a Meta token.
  if (
    !bearerToken
    && process.env.NODE_ENV === "development"
    && process.env.DEV_LOCAL_EMAIL
    && config.resourceUrlPath === DEFAULT_RESOURCE_PATH
  ) {
    const devEmail = process.env.DEV_LOCAL_EMAIL;
    const [s] = await db()
      .select()
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.googleEmail, devEmail),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .orderBy(desc(schema.mcpSessions.createdAt))
      .limit(1);
    if (!s) {
      throw new Error(
        `DEV_LOCAL_EMAIL bypass active but no valid mcpSession found for ${devEmail}. ` +
        `Sign in at http://localhost:3000/connect first.`,
      );
    }
    if (!s.customerId) {
      throw new Error("Dev session has no customerId. Complete setup at /connect.");
    }
    const customerIds = parseCustomerIds(s.customerIds);
    const userAgent = request.headers.get("user-agent") ?? null;
    return {
      refreshToken: s.refreshToken,
      customerId: s.customerId,
      customerIds: customerIds.length > 0 ? customerIds : [{ id: s.customerId, name: "" }],
      loginCustomerId: s.loginCustomerId ?? null,
      userId: s.userId ?? null,
      clientName: s.clientName ?? "dev-local",
      clientVersion: s.clientVersion ?? null,
      authMethod: "dev-local",
      userAgent,
      sessionToken: "dev-local",
      sessionId: s.id,
    };
  }

  if (!bearerToken) {
    throw new Error("No valid authentication. Sign in at /connect to get your MCP token.");
  }

  const isOauthLikePrefix =
    bearerToken.startsWith(config.tokenPrefix)
    || config.legacyTokenPrefixes.some((p) => bearerToken.startsWith(p));
  const authMethod = isOauthLikePrefix ? "oauth" : "direct";
  const userAgent = request.headers.get("user-agent") ?? null;

  let session: typeof schema.mcpSessions.$inferSelect | undefined;

  if (isOauthLikePrefix) {
    // OAuth access token from Claude Connector. Resolve via
    // oauth_access_tokens (per-token rows), NOT via oauth_clients. The
    // per-token table is what lets concurrent code exchanges for the same
    // client_id keep their tokens valid — folding this back onto a column
    // on oauth_clients reintroduces the rotation race that produces a
    // 401 → re-authorize retry loop.
    //
    // Polymorphic dispatch: Google tokens have session_id set (→ join to
    // mcp_sessions); Meta tokens have connection_id set (→ join to
    // ad_platform_connections). Branched on config.platform so the
    // resolver only joins against the table relevant for this MCP.

    if (config.platform === "meta_ads") {
      // Integration-test tokens (`oat_meta_ads_test_*`) opt into Graph API
      // validate-only mode for writes. We reject these in production as
      // defense-in-depth: prod tokens use 64 hex chars and physically
      // cannot start with `_test_`, but this guarantees a leaked test
      // token can't trigger validate-only writes against a customer.
      const isTestToken = bearerToken.startsWith("oat_meta_ads_test_");
      if (isTestToken && process.env.NODE_ENV === "production") {
        throw new Error("Test tokens are not accepted in production.");
      }

      const [row] = await db()
        .select({
          connection: schema.adPlatformConnections,
          tokenResourceUrl: schema.oauthAccessTokens.resourceUrl,
        })
        .from(schema.oauthAccessTokens)
        .innerJoin(
          schema.adPlatformConnections,
          eq(schema.oauthAccessTokens.connectionId, schema.adPlatformConnections.id),
        )
        .where(eq(schema.oauthAccessTokens.token, bearerToken))
        .limit(1);

      if (row) {
        assertTokenAudience(row.tokenResourceUrl, config.platform);

        // Build a Google-shaped AuthContext from the Meta connection. The
        // tool surface is currently Google-only; when Stage 4 introduces
        // real Meta tools, they'll consume Meta-specific fields and this
        // mapping will be replaced with a proper MetaAuthContext. For
        // Stage 3 (skeleton route, _skeleton_status only), the Google
        // shape is sufficient — the auth context just has to exist.
        const conn = row.connection;
        const accounts = (conn.accountIds ?? []).map((a) => ({
          id: a.id,
          name: a.name ?? "",
        }));
        const userAgent = request.headers.get("user-agent") ?? null;
        trackServerEvent(conn.userId ?? null, "mcp_oauth_used", {
          client_name: null,
          client_version: null,
          resource_url: config.resourceUrlPath,
          platform: config.platform,
          binding: "connection",
          user_agent: userAgent,
        });
        return {
          refreshToken: conn.refreshToken,
          customerId: conn.activeAccountId ?? "",
          customerIds: accounts.length > 0
            ? accounts
            : (conn.activeAccountId ? [{ id: conn.activeAccountId, name: "" }] : []),
          loginCustomerId: null,
          userId: conn.userId,
          clientName: null,
          clientVersion: null,
          authMethod: "oauth",
          userAgent,
          sessionToken: bearerToken,
          sessionId: null,
          testMode: isTestToken,
        };
      }
      // Token not found → fall through to the "session not found" throw below.
    } else {
      // Google path. Phase-2 dual-aware: token may bind to either
      // mcp_sessions (legacy, sessionId column) OR ad_platform_connections
      // (new, connectionId column). Look up the token row first, then JOIN
      // to whichever target it points at. This keeps existing tokens working
      // while new tokens issued by the connection-bound flow resolve
      // directly against ad_platform_connections.
      const [tokenRow] = await db()
        .select({
          sessionId: schema.oauthAccessTokens.sessionId,
          connectionId: schema.oauthAccessTokens.connectionId,
          resourceUrl: schema.oauthAccessTokens.resourceUrl,
        })
        .from(schema.oauthAccessTokens)
        .where(eq(schema.oauthAccessTokens.token, bearerToken))
        .limit(1);

      if (tokenRow) {
        // Platform-scoped audience check. A token issued for any URL on this
        // platform is accepted at any other URL on the same platform — both
        // /api/mcp (legacy default) and /api/mcp/google_ads route to the same
        // Google Ads handler, so cross-URL within a platform is safe. The
        // boundary that *matters* — Google tokens cannot impersonate at the
        // future /api/mcp/meta_ads — is enforced because that route's
        // resource maps to a different platform.
        //
        // Strict per-URL audience proved too rigid for real-world clients:
        // rmcp (Codex's MCP client) implements RFC 8414 but skips RFC 9728
        // protected-resource discovery, so it never sends `resource=` on
        // /authorize and the issued token defaults to /api/mcp. The
        // platform-scoped check (assertTokenAudience) lets a default-resource
        // token authenticate at any same-platform URL while still blocking
        // cross-platform impersonation.
        assertTokenAudience(tokenRow.resourceUrl, config.platform);

        if (tokenRow.connectionId !== null) {
          // Phase-2 connection-bound Google token. Build the AuthContext
          // directly off ad_platform_connections — same shape we return for
          // mcp_sessions-bound tokens, just sourced from the connection row.
          //
          // Time-based expiry is intentionally not enforced here: there is
          // no mcp_sessions.expires_at equivalent on the connection row, and
          // the cleanest fix (a token-level expires_at column on
          // oauth_access_tokens) is its own follow-up. Tokens remain
          // revocable via row deletion. Mirrors Meta's behavior today.
          const [conn] = await db()
            .select({
              refreshToken: schema.adPlatformConnections.refreshToken,
              activeAccountId: schema.adPlatformConnections.activeAccountId,
              accountIds: schema.adPlatformConnections.accountIds,
              userId: schema.adPlatformConnections.userId,
            })
            .from(schema.adPlatformConnections)
            .where(eq(schema.adPlatformConnections.id, tokenRow.connectionId))
            .limit(1);

          if (conn) {
            if (!conn.activeAccountId) {
              throw new Error("Account selection pending. Complete setup at /connect.");
            }
            const accounts = (conn.accountIds ?? []).map((a) => ({
              id: a.id,
              name: a.name ?? "",
              ...("loginCustomerId" in a ? { loginCustomerId: a.loginCustomerId } : {}),
            }));
            trackServerEvent(conn.userId ?? null, "mcp_oauth_used", {
              client_name: null,
              client_version: null,
              resource_url: config.resourceUrlPath,
              platform: config.platform,
              binding: "connection",
              user_agent: userAgent,
            });
            return {
              refreshToken: conn.refreshToken,
              customerId: conn.activeAccountId,
              customerIds: accounts.length > 0
                ? accounts
                : [{ id: conn.activeAccountId, name: "" }],
              loginCustomerId: activeLoginCustomerIdFor(conn.activeAccountId, accounts),
              userId: conn.userId,
              clientName: null,
              clientVersion: null,
              authMethod,
              userAgent,
              sessionToken: bearerToken,
              sessionId: null,
            };
          }
          // connectionId set but row missing → fall through to "session not
          // found" throw. Connection was deleted out from under the token.
        } else if (tokenRow.sessionId !== null) {
          const [row] = await db()
            .select({ session: schema.mcpSessions })
            .from(schema.mcpSessions)
            .where(
              and(
                eq(schema.mcpSessions.id, tokenRow.sessionId),
                gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
              ),
            )
            .limit(1);
          if (row) {
            session = row.session;
            trackServerEvent(row.session.userId ?? null, "mcp_oauth_used", {
              client_name: row.session.clientName ?? null,
              client_version: row.session.clientVersion ?? null,
              resource_url: config.resourceUrlPath,
              platform: config.platform,
              binding: "session",
              user_agent: userAgent,
            });
          }
        }
        // Both null is impossible per the XOR CHECK on oauth_access_tokens.
      }
    }
  } else if (config.acceptDirectBearer) {
    // Direct MCP session token (pre-multi-platform flat bearer). Only the
    // legacy `/api/mcp` resource accepts these — platform-explicit paths
    // require an `oat_*` token whose `resource_url` matches.
    //
    // Option B (locked 2026-05-07): no time-based expiry check. Direct-bearer
    // tokens are long-lived credentials, revocable only by deleting the row.
    // Mirrors how Meta + connection-bound Google OAuth tokens already work.
    const [s] = await db()
      .select()
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.accessToken, bearerToken))
      .limit(1);
    session = s;

    // Phase-3 prep telemetry. Counts authenticated direct-bearer hits so we
    // can identify which users + MCP clients still rely on the legacy auth
    // path before we cut it off (plan §"Phase 3 — Direct-bearer MCP cutoff",
    // step 1: "Run for ≥1 week to find affected users."). No behavior
    // change. Failed lookups (s undefined) don't fire — there's no
    // userId/clientName to capture, and they're already 401-ing.
    if (s) {
      trackServerEvent(s.userId ?? null, "mcp_direct_bearer_used", {
        // Raw clientName (not normalized) so dashboards can group by
        // exact identity — "claude-code" vs "claude-code (oauth)" matter
        // for outreach decisions.
        client_name: s.clientName ?? null,
        client_version: s.clientVersion ?? null,
        resource_url: config.resourceUrlPath,
        platform: config.platform,
        user_agent: userAgent,
      });
    }
  } else {
    throw new Error("Token does not match any accepted prefix for this MCP resource.");
  }

  if (!session) {
    throw new Error("Session not found or expired. Sign in at /connect to get a new MCP token.");
  }

  if (!session.customerId) {
    throw new Error("Account selection pending. Complete setup at /connect.");
  }

  const customerIds = parseCustomerIds(session.customerIds);
  const storedClientName = session.clientName ?? null;
  const normalizedClientName = storedClientName
    ? normalizeClientName(storedClientName, authMethod, userAgent)
    : null;
  return {
    refreshToken: session.refreshToken,
    customerId: session.customerId,
    customerIds: customerIds.length > 0
      ? customerIds
      : [{ id: session.customerId, name: "" }],
    loginCustomerId: session.loginCustomerId ?? null,
    userId: session.userId ?? null,
    clientName: normalizedClientName,
    clientVersion: session.clientVersion ?? null,
    authMethod,
    userAgent,
    sessionToken: bearerToken,
    sessionId: session.id,
  };
}
