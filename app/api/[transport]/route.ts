import { AsyncLocalStorage } from "node:async_hooks";

// Fix for Node 20+ IPv6 metadata lookup timeout in google-auth-library which causes:
// MetadataLookupWarning: received unexpected error = All promises were rejected code = UNKNOWN
if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = "ads-agent-mcp";
}
import { createMcpHandler } from "mcp-handler";
import { db, schema } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";
import { registerReadTools, registerWriteTools } from "@/lib/mcp";
import { parseCustomerIds, type AuthContext } from "@/lib/google-ads";
import { jsonResult } from "@/lib/mcp/types";

// ─── Per-request auth via AsyncLocalStorage ──────────────────────────

type AuthContextWithSession = AuthContext & {
  sessionToken?: string;
  sessionId?: number;
  clientName?: string | null;
};

const authStore = new AsyncLocalStorage<AuthContextWithSession>();

function currentAuth(): AuthContext {
  const auth = authStore.getStore();
  if (!auth) throw new Error("No auth context — request not authenticated.");
  return auth;
}

async function resolveAuth(request: Request): Promise<AuthContextWithSession> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!bearerToken) {
    throw new Error("No valid authentication. Sign in at /connect to get your MCP token.");
  }

  // Resolve bearer token to MCP session (one query either path)
  let session;

  if (bearerToken.startsWith("oat_")) {
    // OAuth access token from Claude Connector — join to resolve in one query
    const [row] = await db()
      .select({ session: schema.mcpSessions })
      .from(schema.oauthClients)
      .innerJoin(schema.mcpSessions, eq(schema.oauthClients.sessionId, schema.mcpSessions.id))
      .where(
        and(
          eq(schema.oauthClients.oauthAccessToken, bearerToken),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);
    session = row?.session;
  } else {
    // Direct MCP session token
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
  }

  if (!session) {
    throw new Error("Session not found or expired. Sign in at /connect to get a new MCP token.");
  }

  if (!session.customerId) {
    throw new Error("Account selection pending. Complete setup at /connect.");
  }

  const customerIds = parseCustomerIds(session.customerIds);
  return {
    refreshToken: session.refreshToken,
    customerId: session.customerId,
    customerIds: customerIds.length > 0
      ? customerIds
      : [{ id: session.customerId, name: "" }],
    loginCustomerId: session.loginCustomerId ?? null,
    userId: session.userId ?? null,
      sessionToken: bearerToken,
    sessionId: session.id,
    clientName: session.clientName ?? null,
  };
}

// ─── MCP Server ──────────────────────────────────────────────────────

const mcpHandler = createMcpHandler(
  (server) => {
    registerReadTools(server, currentAuth);
    registerWriteTools(server, currentAuth);

    // ─── Session management tools (registered in app layer) ─────
    server.registerTool("listConnectedAccounts", {
      description: "List Google Ads accounts connected to this session. Returns accountIds for use with all other tools.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    }, async () => {
      const auth = currentAuth();
      const accounts = auth.customerIds ?? [{ id: auth.customerId, name: "" }];
      return jsonResult({
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name || "Unknown Account",
        })),
        defaultAccountId: auth.customerId,
        totalAccounts: accounts.length,
      });
    });
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
  },
);

// ─── Schema-only methods (no auth needed) ───────────────────────────

const SCHEMA_METHODS = new Set(["initialize", "tools/list", "notifications/initialized"]);

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

// ─── Client identity capture ─────────────────────────────────────────

/**
 * On the first `initialize` request for a session, extract clientInfo.name/version
 * and persist them raw on the session row. Fire-and-forget — never blocks.
 */
async function captureClientInfo(cloned: Request, sessionId: number): Promise<void> {
  try {
    const body = await cloned.json();
    if (body?.method !== "initialize") return;
    const clientName = body?.params?.clientInfo?.name;
    const clientVersion = body?.params?.clientInfo?.version;
    if (typeof clientName !== "string" || !clientName) return;
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

// ─── Request handler ─────────────────────────────────────────────────

async function handler(request: Request): Promise<Response> {
  let auth: AuthContextWithSession | null = null;
  try {
    auth = await resolveAuth(request);
  } catch (e) {
    // Allow schema introspection without auth
    const { schemaOnly, cloned } = await isSchemaRequest(request);
    if (schemaOnly) {
      return mcpHandler(cloned);
    }
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Capture client identity once per session — skip if already known
  if (request.method === "POST" && auth.sessionId != null && !auth.clientName) {
    void captureClientInfo(request.clone(), auth.sessionId);
  }

  return authStore.run(auth, () => mcpHandler(request));
}

export { handler as GET, handler as POST, handler as DELETE };
