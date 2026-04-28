import { AsyncLocalStorage } from "node:async_hooks";

// Fix for Node 20+ IPv6 metadata lookup timeout in google-auth-library which causes:
// MetadataLookupWarning: received unexpected error = All promises were rejected code = UNKNOWN
if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = "ads-agent-mcp";
}
import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { db, schema } from "@/lib/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { registerReadTools, registerWriteTools, registerCodeModeTools } from "@/lib/mcp";
import { parseCustomerIds, type AuthContext } from "@/lib/google-ads";
import { typedResult } from "@/lib/mcp/types";
import { withMcpTelemetry } from "@/lib/mcp/telemetry";
import { PLAYBOOKS } from "@/lib/mcp/playbooks";
import { flushServerEvents } from "@/lib/analytics-server";

// ─── Per-request auth via AsyncLocalStorage ──────────────────────────

type AuthContextWithSession = AuthContext & {
  sessionToken?: string;
  clientName?: string | null;
  clientVersion?: string | null;
  /** "oauth" (Claude Connector) or "direct" (Bearer token) */
  authMethod?: string | null;
  /** User-Agent header from the HTTP request */
  userAgent?: string | null;
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

  // Dev-only bypass: lets the local dev server serve MCP traffic without an
  // OAuth or Bearer handshake, so eval-mcp subagents (which can't do dynamic
  // client registration against localhost) can iterate against uncommitted
  // code. Triple-gated: NODE_ENV must be development, DEV_LOCAL_EMAIL must be
  // explicitly set, and the caller must have sent NO Authorization header
  // (real bearer flows still work in dev). Resolves to the most recent valid
  // mcpSession for that email — piggybacks on whatever the user last signed
  // in with, no test fixtures or fake customers needed.
  if (!bearerToken && process.env.NODE_ENV === "development" && process.env.DEV_LOCAL_EMAIL) {
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
      // Synthesize a customerIds entry for legacy sessions where the column is empty.
      // Omit loginCustomerId on the synthesized entry so authForAccount falls back
      // to the session-level value (the only source of truth for legacy data).
      customerIds: customerIds.length > 0 ? customerIds : [{ id: s.customerId, name: "" }],
      loginCustomerId: s.loginCustomerId ?? null,
      userId: s.userId ?? null,
      clientName: s.clientName ?? "dev-local",
      clientVersion: s.clientVersion ?? null,
      // Distinct from "oauth" / "direct" so dev traffic doesn't poison
      // client-type analytics. Telemetry writers key off this.
      authMethod: "dev-local",
      userAgent,
      sessionToken: "dev-local",
      sessionId: s.id,
    };
  }

  if (!bearerToken) {
    throw new Error("No valid authentication. Sign in at /connect to get your MCP token.");
  }

  const authMethod = bearerToken.startsWith("oat_") ? "oauth" : "direct";
  const userAgent = request.headers.get("user-agent") ?? null;

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

// ─── MCP Server ──────────────────────────────────────────────────────

// Server-level routing heuristic. The MCP spec surfaces this to the agent as
// system-level guidance; it's the right home for "which tool do I pick?"
// decisions that would otherwise get baked into individual tool descriptions
// (and rot on every refactor). Keep it short, outcome-framed, and tool-neutral
// where possible — named tools referenced here must exist.
const MCP_INSTRUCTIONS = `NotFair is an MCP for Google Ads API. You are an expert Paid Ads specialist whose goal is to assist the user in understanding and managing their Google Ads account.

Tool-selection heuristic — pick ONE path per user question:

1. Read-only questions (audits, analytics, dashboards, diagnostics) → \`runScript\`.
   Examples: "how is my account doing", "audit my account", "find wasted spend",
   "why did conversions drop last week", "build me a performance dashboard",
   "what's working and what's not", "any quick wins".

   \`runScript\` runs a JS sandbox with \`ads.gaql(query)\` and
   \`ads.gaqlParallel([queries])\` — fan out up to 20 GAQL queries in one call
   and correlate surfaces (spend, search terms, quality scores, change events)
   in a single pass. Cast a wide net on the first call; filtering happens
   in-script for free.

   Example — single query:
   \`\`\`js
   return await ads.gaql(\`
     SELECT campaign.name, metrics.cost_micros, metrics.conversions
     FROM campaign
     WHERE segments.date DURING LAST_7_DAYS
     ORDER BY metrics.cost_micros DESC
     LIMIT 20
   \`);
   \`\`\`

   Example — parallel fan-out for an audit (gaqlParallel takes
   [{name, query, limit?}, ...] and returns { [name]: GaqlReport }):
   \`\`\`js
   const r = await ads.gaqlParallel([
     { name: "campaigns", query: \`
       SELECT campaign.name, metrics.cost_micros, metrics.conversions,
              metrics.ctr, metrics.average_cpc
         FROM campaign WHERE segments.date DURING LAST_30_DAYS\` },
     { name: "searchTerms", query: \`
       SELECT search_term_view.search_term, metrics.cost_micros,
              metrics.conversions, campaign.name
         FROM search_term_view WHERE segments.date DURING LAST_30_DAYS
         ORDER BY metrics.cost_micros DESC\`, limit: 100 },
     { name: "qualityScores", query: \`
       SELECT ad_group_criterion.keyword.text,
              ad_group_criterion.quality_info.quality_score,
              metrics.cost_micros
         FROM keyword_view WHERE segments.date DURING LAST_30_DAYS\` }
   ]);
   const wastedSpend = (r.searchTerms.rows ?? []).filter(row =>
     row.metrics.conversions === 0 && row.metrics.cost_micros > 50_000_000);
   return { campaigns: r.campaigns.rows, wastedSpend, qualityScores: r.qualityScores.rows };
   \`\`\`

   Follow-up rule: after a \`runScript\` pass, don't chain \`runScript\` calls
   unless the next one has a fundamentally different shape. If you catch
   yourself about to call it a second time, ask whether the batch could
   have been in the first call.

2. Mutations (pause, bid change, add keyword, create campaign) → individual
   write tools. Never wrap mutations in \`runScript\` — writes happen through
   dedicated tools with guardrails and change-tracking.

Humanized response contract — applies to every \`runScript\` row:

- Enum integer fields are augmented with a sibling \`<field>_name\` carrying the canonical Google Ads enum name. Read \`bidding_strategy_type_name\` (e.g. \`"MAXIMIZE_CONVERSIONS"\`), not the integer (\`10\`). Common landmines: BiddingStrategyType 10=MAXIMIZE_CONVERSIONS, 11=MAXIMIZE_CONVERSION_VALUE, 9=TARGET_SPEND (a.k.a. Maximize Clicks), 15=TARGET_IMPRESSION_SHARE — easy to swap if you read the integer.
- Money fields ending in \`_micros\` get a sibling \`<base>_value\` (numeric, currency-agnostic major units — \`cost_micros: 11_000_000\` ⇒ \`cost_value: 11\`). Use \`_value\` for math and display; the raw \`_micros\` field is preserved for callers that need it (e.g. mutation tools that take micros).

3. Specialized non-GAQL reads → dedicated tools (not \`runScript\`):
   - \`summarizeAccountSetup\` — canonical "what is this account configured to do?" snapshot (currency, time zone, every campaign with named bidding strategy + tCPA/tROAS in major units, every conversion action with category + primary_for_goal). Call this ONCE at the start of any strategic conversation BEFORE \`runScript\` — it pre-shapes the conversion hierarchy and bidding posture so you don't misread enum integers (the BiddingStrategyType landmines: 10=MAXIMIZE_CONVERSIONS, 11=MAXIMIZE_CONVERSION_VALUE, 9=TARGET_SPEND, 15=TARGET_IMPRESSION_SHARE) or treat micros as dollars.
   - \`searchGeoTargets\` — geo target name lookup via GeoTargetConstantService.
   - \`getRecommendations\` — Google's recommendation engine.
   - \`getKeywordIdeas\` — Keyword Planner search-volume data.
   - \`getChanges\` / \`reviewChangeImpact\` — NotFair's own change log + impact analysis.
   - \`getResourceMetadata\` / \`listQueryableResources\` — GAQL schema discovery (use before writing an unfamiliar query).

Handling write rejections — important:

When a write tool returns \`success: false\`, check \`structuredContent.nextTool\` before retrying:

- If \`nextTool.name\` is set, call THAT tool next with \`nextTool.args\`. Do NOT retry the original tool — the rejection identified a routing mismatch (e.g. trying to pause a negative keyword, or hitting a guardrail). Retrying the same call will fail the same way.
- If \`nextTool\` is absent, the prose \`error\` message is your guide; fix the inputs and try again, or escalate to the user if the message names a precondition you can't satisfy.

When a rejection's \`error\` field lists actual existing entities (e.g. \`removeNegativeKeyword\` reporting the campaign's real negative keywords), treat that list as ground truth — your planning data was stale or hallucinated. Re-plan against the listed entities before issuing more writes; do not bulk-retry the same plan.`;

const mcpHandler = createMcpHandler(
  (server) => {
    withMcpTelemetry(server);
    registerReadTools(server, currentAuth);
    registerWriteTools(server, currentAuth);
    registerCodeModeTools(server, currentAuth);

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
      return typedResult({
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name || "Unknown Account",
        })),
        defaultAccountId: auth.customerId,
        totalAccounts: accounts.length,
      });
    });

    // ─── MCP resources — playbooks ────────────────────────────────
    // Publishes canonical tool-call sequences so Claude fetches the
    // recipe for "build a dashboard" / "explain a regression" instead
    // of rediscovering it every session. Content is bundled at build
    // time; no auth required to read.
    for (const playbook of PLAYBOOKS) {
      server.registerResource(
        playbook.uri.replace("adsagent://playbooks/", ""),
        playbook.uri,
        {
          title: playbook.name,
          description: playbook.description,
          mimeType: "text/markdown",
        },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: playbook.content,
            },
          ],
        }),
      );
    }
  },
  {
    instructions: MCP_INSTRUCTIONS,
  },
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
 * The `mcp-remote` wrapper (used by the Claude Code plugin) does not forward
 * the downstream client's clientInfo.name through the MCP handshake — every
 * such request arrives tagged `mcp-remote-fallback-test`. Without this
 * normalization, ~100% of Claude Code traffic is mis-attributed and surface
 * analyses are broken. See docs/analysis/2026-04-15_11-32_claude-code-vs-connector-onboarding.md.
 */
function normalizeClientName(
  rawName: string,
  authMethod: string | null | undefined,
  userAgent: string | null | undefined,
): string {
  if (rawName !== "mcp-remote-fallback-test") return rawName;
  // mcp-remote wrapper — infer the downstream client.
  // Claude Code is the only client we document using direct-auth (Bearer mcp session token) via mcp-remote.
  if (authMethod === "direct") return "claude-code";
  const ua = userAgent?.toLowerCase() ?? "";
  if (ua.includes("claude-code")) return "claude-code";
  return rawName;
}

/**
 * On the first `initialize` request for a session, extract clientInfo.name/version
 * and persist them on the session row. Fire-and-forget — never blocks.
 */
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
    // RFC 6750 §3 + MCP spec: 401 responses from protected resources MUST
    // include WWW-Authenticate so clients can discover the auth server and
    // kick off an OAuth flow. resource_metadata points at the RFC 9470
    // protected-resource document (served from the same host as the request
    // so apex vs. www stays consistent for Claude's audience validation).
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const resourceMetadata = `${proto}://${host}/.well-known/oauth-protected-resource`;
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

  // Capture client identity once per session — skip if already known.
  // We normalize in-memory in resolveAuth, so auth.clientName is never the
  // raw fallback sentinel here; re-capture only when truly unknown.
  if (request.method === "POST" && auth.sessionId != null && !auth.clientName) {
    void captureClientInfo(request.clone(), auth.sessionId, auth.authMethod, auth.userAgent);
  }

  // Keep the Lambda alive long enough for posthog-node to POST queued events
  // (e.g. first_tool_call_attempted). No-op if nothing was captured.
  after(flushServerEvents);

  return authStore.run(auth, () => mcpHandler(request));
}

export { handler as GET, handler as POST, handler as DELETE };
