import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler } from "mcp-handler";
import { db, schema } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";
import { registerReadTools, registerWriteTools } from "@/lib/mcp";
import type { AuthContext } from "@/lib/google-ads";

// ─── Per-request auth via AsyncLocalStorage ──────────────────────────

const authStore = new AsyncLocalStorage<AuthContext>();

function currentAuth(): AuthContext {
  const auth = authStore.getStore();
  if (!auth) throw new Error("No auth context — request not authenticated.");
  return auth;
}

async function resolveAuth(request: Request): Promise<AuthContext> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (bearerToken) {
    try {
      const [session] = await db()
        .select()
        .from(schema.mcpSessions)
        .where(
          and(
            eq(schema.mcpSessions.accessToken, bearerToken),
            gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
          ),
        )
        .limit(1);

      if (session) {
        if (!session.customerId) {
          throw new Error("Account selection pending. Complete setup at /connect.");
        }
        return {
          refreshToken: session.refreshToken,
          customerId: session.customerId,
        };
      }
    } catch {
      // DB unavailable — fall through to env vars
    }
  }

  // Fallback: env vars (founder's account)
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "";
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID ?? "";
  if (!refreshToken || !customerId) {
    throw new Error("No valid authentication. Sign in at /connect to get your MCP token.");
  }
  return { refreshToken, customerId };
}

// ─── MCP Server ──────────────────────────────────────────────────────

const mcpHandler = createMcpHandler(
  (server) => {
    registerReadTools(server, currentAuth);
    registerWriteTools(server, currentAuth);
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
  },
);

// ─── Request handler ─────────────────────────────────────────────────

async function handler(request: Request): Promise<Response> {
  let auth: AuthContext;
  try {
    auth = await resolveAuth(request);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return authStore.run(auth, () => mcpHandler(request));
}

export { handler as GET, handler as POST, handler as DELETE };
