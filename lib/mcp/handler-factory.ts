import { AsyncLocalStorage } from "node:async_hooks";

// Fix for Node 20+ IPv6 metadata lookup timeout in google-auth-library which causes:
// MetadataLookupWarning: received unexpected error = All promises were rejected code = UNKNOWN
if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = "ads-agent-mcp";
}

import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, schema } from "@/lib/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { parseCustomerIds, type AuthContext } from "@/lib/google-ads";
import { withMcpTelemetry } from "@/lib/mcp/telemetry";
import { flushServerEvents } from "@/lib/analytics-server";
import { DEFAULT_RESOURCE_PATH, findResource, type Platform } from "@/lib/mcp/resources";

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

export type PlatformMcpConfig = {
  platform: Platform;
  /**
   * Stable resource URL path this handler serves at, e.g. `/api/mcp` or
   * `/api/mcp/google`. Used to:
   * - Build the `WWW-Authenticate: resource_metadata=...` URL on 401.
   * - Filter `oauth_access_tokens.resource_url` so a token issued for one
   *   resource cannot authenticate at a different resource.
   */
  resourceUrlPath: string;
  /** Token prefix for newly-issued tokens, e.g. `oat_google_ads_`. */
  tokenPrefix: string;
  /** Legacy prefixes still accepted at this resource (e.g. `["oat_"]` for Google). */
  legacyTokenPrefixes: readonly string[];
  /**
   * Accept direct (non-`oat_`-prefixed) Bearer tokens that resolve to an
   * `mcp_sessions` row. These are pre-multi-platform session tokens; only
   * the legacy `/api/mcp` resource accepts them. Platform-explicit routes
   * leave this `false` so a session token cannot impersonate a Meta token
   * (or vice-versa) just because the user has both connected.
   */
  acceptDirectBearer?: boolean;
  /** Server-level instructions surfaced to the LLM at `initialize`. */
  instructions: string;
  /** Tool/resource registration callback. Receives the per-request auth lookup. */
  registerTools: (server: McpServer, currentAuth: () => AuthContext) => void;
};

const SCHEMA_METHODS = new Set(["initialize", "tools/list", "notifications/initialized"]);

/**
 * Build a Next.js App Router request handler that serves the MCP protocol
 * for a single platform. Owns: auth resolution, AsyncLocalStorage threading,
 * telemetry wrapping, error envelopes, schema-introspection bypass, and the
 * 401-with-WWW-Authenticate dance.
 *
 * Each route file (`/api/[transport]/route.ts`, `/api/mcp/google/[transport]/route.ts`)
 * is a thin wrapper that calls this factory with its platform-specific config.
 */
export function createPlatformMcpHandler(config: PlatformMcpConfig) {
  const authStore = new AsyncLocalStorage<AuthContextWithSession>();

  function currentAuth(): AuthContext {
    const auth = authStore.getStore();
    if (!auth) throw new Error("No auth context — request not authenticated.");
    return auth;
  }

  const mcpHandler = createMcpHandler(
    (server) => {
      withMcpTelemetry(server);
      config.registerTools(server, currentAuth);
    },
    {
      instructions: config.instructions,
      // Per-platform server name distinguishes dashboards that aggregate
      // across platforms. Tool names themselves are unprefixed — modern MCP
      // clients namespace tools by server before showing them to the model,
      // so a per-platform server identity is sufficient disambiguation.
      serverInfo: {
        name: `notfair-${config.platform.replace("_", "-")}-mcp`,
        version: "1.0.0",
      },
    },
    mcpHandlerEndpointConfig(config.resourceUrlPath),
  );

  async function resolveAuth(request: Request): Promise<AuthContextWithSession> {
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
      // Audience check: a token's `resource_url` must match this handler's
      // resource path. NULL is treated as `/api/mcp` so legacy `oat_*`
      // tokens (issued before the multi-platform shape existed) keep
      // authenticating at the legacy resource without modification.
      const [row] = await db()
        .select({
          session: schema.mcpSessions,
          tokenResourceUrl: schema.oauthAccessTokens.resourceUrl,
        })
        .from(schema.oauthAccessTokens)
        .innerJoin(schema.mcpSessions, eq(schema.oauthAccessTokens.sessionId, schema.mcpSessions.id))
        .where(
          and(
            eq(schema.oauthAccessTokens.token, bearerToken),
            gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
          ),
        )
        .limit(1);
      if (row) {
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
        // /authorize and the issued token defaults to /api/mcp. Without this
        // relaxation, those tokens would 401 at any platform-explicit URL
        // even though the user is authentic and the session is platform-bound.
        const tokenResource = row.tokenResourceUrl ?? DEFAULT_RESOURCE_PATH;
        const tokenPlatform = findResource(tokenResource)?.platform;
        if (tokenPlatform !== config.platform) {
          throw new Error(
            `Token audience mismatch — issued for ${tokenPlatform ?? "unknown"} platform, this resource is ${config.platform}.`,
          );
        }
        session = row.session;
      }
    } else if (config.acceptDirectBearer) {
      // Direct MCP session token (pre-multi-platform flat bearer). Only the
      // legacy `/api/mcp` resource accepts these — platform-explicit paths
      // require an `oat_*` token whose `resource_url` matches.
      const [s] = await db()
        .select()
        .from(schema.mcpSessions)
        .where(
          and(
            eq(schema.mcpSessions.accessToken, bearerToken),
            gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
          ),
        )
        .limit(1);
      session = s;
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

  async function handler(request: Request): Promise<Response> {
    let auth: AuthContextWithSession | null = null;
    try {
      auth = await resolveAuth(request);
    } catch (e) {
      // Allow schema introspection without auth so MCP clients can probe
      // capabilities before completing the OAuth dance.
      const { schemaOnly, cloned } = await isSchemaRequest(request);
      if (schemaOnly) {
        return mcpHandler(cloned);
      }
      // RFC 6750 §3 + MCP spec: 401 responses from protected resources MUST
      // include WWW-Authenticate so clients can discover the auth server and
      // kick off an OAuth flow. resource_metadata points at the path-aware
      // protected-resource document for *this* resource — pointing at the
      // root document would mis-direct clients of platform-explicit paths
      // back at the legacy `/api/mcp` resource.
      const url = new URL(request.url);
      const host = request.headers.get("host") ?? url.host;
      const proto = request.headers.get("x-forwarded-proto") ?? "https";
      const resourceMetadata =
        `${proto}://${host}/.well-known/oauth-protected-resource${config.resourceUrlPath}`;
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

    if (request.method === "POST" && auth.sessionId != null && !auth.clientName) {
      void captureClientInfo(request.clone(), auth.sessionId, auth.authMethod, auth.userAgent);
    }

    after(flushServerEvents);

    return authStore.run(auth, () => mcpHandler(request));
  }

  return handler;
}

/**
 * Configure mcp-handler's URL routing for a given resource path.
 *
 * Two shapes:
 *   - resource path ends in `/mcp` (legacy `/api/mcp`): use `basePath` so
 *     mcp-handler derives `${basePath}/mcp` and `${basePath}/sse`. This
 *     matches the historical `app/api/[transport]/route.ts` setup where the
 *     dynamic `[transport]` segment ("mcp" or "sse") IS the transport name.
 *   - resource path does NOT end in `/mcp` (`/api/mcp/google_ads`): mount
 *     mcp-handler with an explicit `streamableHttpEndpoint` equal to the
 *     resource URL. The route file is a static `route.ts` (no `[transport]`
 *     dynamic). SSE is not exposed for these routes — every modern MCP client
 *     uses streamable-HTTP.
 *
 * `basePath: undefined` is the magic that makes mcp-handler honor the
 * explicit endpoint (the library's default of `""` triggers the derive path).
 */
function mcpHandlerEndpointConfig(resourceUrlPath: string) {
  if (resourceUrlPath.endsWith("/mcp")) {
    const base = resourceUrlPath.slice(0, -"/mcp".length);
    return { basePath: base.length > 0 ? base : "/", maxDuration: 60 } as const;
  }
  return {
    basePath: undefined,
    streamableHttpEndpoint: resourceUrlPath,
    sseEndpoint: `${resourceUrlPath}/sse`,
    sseMessageEndpoint: `${resourceUrlPath}/message`,
    disableSse: true,
    maxDuration: 60,
  } as const;
}

async function isSchemaRequest(request: Request): Promise<{ schemaOnly: boolean; cloned: Request }> {
  if (request.method !== "POST") return { schemaOnly: false, cloned: request };
  const cloned = request.clone();
  try {
    const body = await request.json();
    const method = body?.method;
    return { schemaOnly: typeof method === "string" && SCHEMA_METHODS.has(method), cloned };
  } catch {
    return { schemaOnly: false, cloned };
  }
}

/**
 * The `mcp-remote` wrapper (used by the Claude Code plugin) does not forward
 * the downstream client's clientInfo.name through the MCP handshake — every
 * such request arrives tagged `mcp-remote-fallback-test`. Without this
 * normalization, ~100% of Claude Code traffic is mis-attributed and surface
 * analyses are broken.
 */
function normalizeClientName(
  rawName: string,
  authMethod: string | null | undefined,
  userAgent: string | null | undefined,
): string {
  if (rawName !== "mcp-remote-fallback-test") return rawName;
  if (authMethod === "direct") return "claude-code";
  const ua = userAgent?.toLowerCase() ?? "";
  if (ua.includes("claude-code")) return "claude-code";
  return rawName;
}

async function captureClientInfo(
  cloned: Request,
  sessionId: number,
  authMethod: string | null | undefined,
  userAgent: string | null | undefined,
): Promise<void> {
  try {
    const body = await cloned.json();
    if (body?.method !== "initialize") return;
    const rawName = body?.params?.clientInfo?.name;
    const clientVersion = body?.params?.clientInfo?.version;
    if (typeof rawName !== "string" || !rawName) return;
    const clientName = normalizeClientName(rawName, authMethod, userAgent);
    await db()
      .update(schema.mcpSessions)
      .set({
        clientName,
        clientVersion: typeof clientVersion === "string" ? clientVersion : null,
      })
      .where(eq(schema.mcpSessions.id, sessionId));
  } catch {
    // Never block the request for tracking failures
  }
}
