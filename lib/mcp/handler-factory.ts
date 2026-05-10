import { AsyncLocalStorage } from "node:async_hooks";

// Fix for Node 20+ IPv6 metadata lookup timeout in google-auth-library which causes:
// MetadataLookupWarning: received unexpected error = All promises were rejected code = UNKNOWN
if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = "ads-agent-mcp";
}

import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type AuthContext } from "@/lib/google-ads";
import { withMcpTelemetry } from "@/lib/mcp/telemetry";
import { flushServerEvents } from "@/lib/analytics-server";
import { type Platform } from "@/lib/mcp/resources";
import type { DesignAuthContext } from "@/lib/mcp/platforms/design";
import {
  resolvePlatformAuth,
  resolveSimpleAuth,
  type AuthContextWithSession,
} from "@/lib/mcp/auth-resolver";
import {
  buildUnauthorizedResponse,
  isSchemaRequest,
  mcpHandlerEndpointConfig,
} from "@/lib/mcp/response-utils";
import { captureClientInfo } from "@/lib/mcp/client-info";

// Re-export so existing consumers keep importing this type from the factory.
export type { AuthContextWithSession };

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

/**
 * Build a Next.js App Router request handler that serves the MCP protocol
 * for a single platform. Owns: AsyncLocalStorage threading, telemetry
 * wrapping, error envelopes, schema-introspection bypass, and the
 * 401-with-WWW-Authenticate dance. Auth resolution itself lives in
 * `auth-resolver.ts` so it's testable without mocking ALS or telemetry.
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

  async function handler(request: Request): Promise<Response> {
    let auth: AuthContextWithSession | null = null;
    try {
      auth = await resolvePlatformAuth(request, config);
    } catch (e) {
      // Allow schema introspection without auth so MCP clients can probe
      // capabilities before completing the OAuth dance.
      const { schemaOnly, cloned } = await isSchemaRequest(request);
      if (schemaOnly) return mcpHandler(cloned);
      return buildUnauthorizedResponse(request, config.resourceUrlPath, (e as Error).message);
    }

    if (request.method === "POST" && auth.sessionId != null && !auth.clientName) {
      void captureClientInfo(request.clone(), auth.sessionId, auth.authMethod, auth.userAgent);
    }

    after(flushServerEvents);

    return authStore.run(auth, () => mcpHandler(request));
  }

  return handler;
}

// ─── Simple MCP handler (no customerId / platform connection required) ───────
//
// Used by resource types that authenticate via any valid NotFair session
// (currently: Design). Unlike createPlatformMcpHandler, the auth context
// carries only `userId` — there is no Google / Meta ad-platform binding.

export type SimpleMcpConfig = {
  platform: Platform;
  resourceUrlPath: string;
  tokenPrefix: string;
  legacyTokenPrefixes: readonly string[];
  instructions: string;
  registerTools: (server: McpServer, currentAuth: () => DesignAuthContext) => void;
};

/**
 * Build a Next.js App Router request handler for a "user-only" MCP resource.
 * Auth resolves to `{ userId: string }` via an `oat_design_*`-prefixed bearer
 * token that binds to an `mcp_sessions` row (via sessionId). No customerId,
 * no ad-platform connection required.
 */
export function createSimpleMcpHandler(config: SimpleMcpConfig) {
  const authStore = new AsyncLocalStorage<DesignAuthContext>();

  function currentAuth(): DesignAuthContext {
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
      serverInfo: {
        name: `notfair-${config.platform.replace("_", "-")}-mcp`,
        version: "1.0.0",
      },
    },
    mcpHandlerEndpointConfig(config.resourceUrlPath),
  );

  async function handler(request: Request): Promise<Response> {
    let auth: DesignAuthContext | null = null;
    try {
      auth = await resolveSimpleAuth(request, config);
    } catch (e) {
      const { schemaOnly, cloned } = await isSchemaRequest(request);
      if (schemaOnly) return mcpHandler(cloned);
      return buildUnauthorizedResponse(request, config.resourceUrlPath, (e as Error).message);
    }

    after(flushServerEvents);
    return authStore.run(auth, () => mcpHandler(request));
  }

  return handler;
}
