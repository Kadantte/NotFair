import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { createMcpHandler } from "mcp-handler";
import { db, schema } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";
import { registerReadTools, registerWriteTools } from "@/lib/mcp";
import { parseCustomerIds, type AuthContext } from "@/lib/google-ads";
import { jsonResult } from "@/lib/mcp/types";

// ─── Per-request auth via AsyncLocalStorage ──────────────────────────

type AuthContextWithSession = AuthContext & {
  sessionToken?: string;
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
        const customerIds = parseCustomerIds(session.customerIds);
        return {
          refreshToken: session.refreshToken,
          customerId: session.customerId,
          customerIds: customerIds.length > 0
            ? customerIds
            : [{ id: session.customerId, name: "" }],
          sessionToken: bearerToken,
        };
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("Account selection pending")) {
        throw e;
      }
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

    // ─── Session management tools (registered in app layer) ─────
    server.registerTool("listConnectedAccounts", {
      title: "List Connected Accounts",
      description:
        "List all Google Ads accounts connected to this session. Shows which accounts you can target with the accountId parameter on other tools.",
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

// ─── Request handler ─────────────────────────────────────────────────

async function handler(request: Request): Promise<Response> {
  let auth: AuthContextWithSession;
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
