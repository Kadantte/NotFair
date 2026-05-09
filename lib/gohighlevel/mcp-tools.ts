/**
 * Read-only MCP tools for HighLevel.
 *
 * The tool surface is intentionally small in this first pass:
 *   - listLocations     — what locations does this connection have access to?
 *   - listContacts      — paginate contacts, with simple filters.
 *   - listConversations — paginate conversations, by location.
 *   - listOpportunities — paginate opportunities, by pipeline / location.
 *   - listCalendarEvents — date-bounded events.
 *   - request           — generic GET escape hatch for endpoints we haven't
 *                         wrapped yet. Read-only by construction.
 *
 * Authn: each tool reads the current GHL connection from the AsyncLocalStorage
 * `getGhlAuth()` helper. No request shape leaks here — the route layer is
 * what binds a bearer token to a connection id.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ghlGet } from "@/lib/gohighlevel/client";

export type GhlAuthContext = {
  connectionId: number;
  userId: string;
  companyId: string | null;
  locationId: string | null;
  userType: string;
};

export type GhlAuthLookup = () => GhlAuthContext;

function asTextResult<T>(value: T): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function asErrorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

function safe<A>(
  fn: (args: A, auth: GhlAuthContext) => Promise<unknown>,
  getAuth: GhlAuthLookup,
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      const auth = getAuth();
      const out = await fn(args, auth);
      return asTextResult(out);
    } catch (e) {
      return asErrorResult(e);
    }
  };
}

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const optionalLocationId = z
  .string()
  .optional()
  .describe("HighLevel location id. Omit to use the connection's pinned location.");

function resolveLocationId(args: { locationId?: string }, auth: GhlAuthContext): string {
  const id = args.locationId ?? auth.locationId;
  if (!id) {
    throw new Error(
      "No locationId on this connection. This connection is agency-level — pass an explicit `locationId` arg.",
    );
  }
  return id;
}

export function registerGoHighLevelTools(
  server: McpServer,
  getAuth: GhlAuthLookup,
): void {
  // ─── listLocations ────────────────────────────────────────────────────
  server.registerTool(
    "listLocations",
    {
      description:
        "List HighLevel locations this connection can see. For an agency-level (Company) connection, returns every location under the company. For a Location-level connection, returns just that location.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    safe(async (_args, auth) => {
      if (auth.userType === "Location" && auth.locationId) {
        // Location tokens can only read their own location.
        return await ghlGet(auth.connectionId, `/locations/${auth.locationId}`);
      }
      if (!auth.companyId) {
        throw new Error("Connection has no companyId — cannot list locations.");
      }
      return await ghlGet(auth.connectionId, `/locations/search`, {
        companyId: auth.companyId,
        limit: 100,
      });
    }, getAuth),
  );

  // ─── listContacts ─────────────────────────────────────────────────────
  server.registerTool(
    "listContacts",
    {
      description:
        "List HighLevel contacts for a location. Supports basic pagination (`limit`, `startAfterId`) and a `query` substring filter against name/email/phone.",
      inputSchema: {
        locationId: optionalLocationId,
        limit: z.number().int().min(1).max(100).default(20).describe("Page size, 1-100. Default 20."),
        startAfterId: z.string().optional().describe("Cursor — pass the last contact id from the previous page."),
        query: z.string().optional().describe("Substring search across name/email/phone."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safe(async (args: { locationId?: string; limit?: number; startAfterId?: string; query?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/contacts/", {
        locationId,
        limit: args.limit ?? 20,
        startAfterId: args.startAfterId,
        query: args.query,
      });
    }, getAuth),
  );

  // ─── listConversations ────────────────────────────────────────────────
  server.registerTool(
    "listConversations",
    {
      description:
        "List HighLevel conversations for a location. Use `lastMessageType` (TYPE_SMS, TYPE_EMAIL, TYPE_CALL, ...) to filter by channel.",
      inputSchema: {
        locationId: optionalLocationId,
        limit: z.number().int().min(1).max(100).default(20),
        startAfterDate: z.string().optional().describe("ISO 8601 timestamp to paginate before."),
        lastMessageType: z.string().optional(),
      },
      annotations: READ_ANNOTATIONS,
    },
    safe(async (args: {
      locationId?: string;
      limit?: number;
      startAfterDate?: string;
      lastMessageType?: string;
    }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/conversations/search", {
        locationId,
        limit: args.limit ?? 20,
        startAfterDate: args.startAfterDate,
        lastMessageType: args.lastMessageType,
      });
    }, getAuth),
  );

  // ─── listOpportunities ────────────────────────────────────────────────
  server.registerTool(
    "listOpportunities",
    {
      description:
        "List HighLevel opportunities for a location. Optionally filter by pipeline.",
      inputSchema: {
        locationId: optionalLocationId,
        pipelineId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        startAfter: z.string().optional().describe("Cursor for pagination."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safe(async (args: {
      locationId?: string;
      pipelineId?: string;
      limit?: number;
      startAfter?: string;
    }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/opportunities/search", {
        location_id: locationId,
        pipeline_id: args.pipelineId,
        limit: args.limit ?? 20,
        startAfter: args.startAfter,
      });
    }, getAuth),
  );

  // ─── listCalendarEvents ───────────────────────────────────────────────
  server.registerTool(
    "listCalendarEvents",
    {
      description:
        "List HighLevel calendar events for a location, bounded by `startDate` / `endDate` (ISO 8601). Use `calendarId` to scope to a single calendar.",
      inputSchema: {
        locationId: optionalLocationId,
        calendarId: z.string().optional(),
        startDate: z.string().describe("ISO 8601 start of window."),
        endDate: z.string().describe("ISO 8601 end of window."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safe(async (args: {
      locationId?: string;
      calendarId?: string;
      startDate: string;
      endDate: string;
    }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/calendars/events", {
        locationId,
        calendarId: args.calendarId,
        startTime: args.startDate,
        endTime: args.endDate,
      });
    }, getAuth),
  );

  // ─── request (escape hatch) ───────────────────────────────────────────
  server.registerTool(
    "request",
    {
      description:
        "Generic READ-ONLY GET against the HighLevel API. Path is appended to https://services.leadconnectorhq.com. Use this for endpoints not yet wrapped by a typed tool (e.g. /pipelines, /custom-fields). Query params go in `query`.",
      inputSchema: {
        path: z.string().describe("API path beginning with /."),
        query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      },
      annotations: READ_ANNOTATIONS,
    },
    safe(async (args: { path: string; query?: Record<string, string | number | boolean> }, auth) => {
      if (!args.path.startsWith("/")) throw new Error("`path` must begin with `/`.");
      return await ghlGet(auth.connectionId, args.path, args.query);
    }, getAuth),
  );
}

export const GHL_MCP_INSTRUCTIONS = `NotFair is an MCP for the GoHighLevel CRM. You are an expert revenue-ops practitioner whose goal is to help the user understand their CRM state — contacts, conversations, opportunities, calendar bookings — and surface insight without making changes.

Tool-selection heuristic — pick the most specific tool first:

1. List entities → \`listContacts\`, \`listConversations\`, \`listOpportunities\`,
   \`listCalendarEvents\`, \`listLocations\`. Each takes \`locationId\` (optional —
   defaults to the connection's pinned location for Location-level tokens).

2. Reach for \`request\` only when no typed tool covers the endpoint you need.
   It is a read-only GET against the HighLevel API; pass \`path\` and \`query\`.
   Examples: /pipelines/, /opportunities/pipelines, /users/, /custom-fields/.

3. This MCP is read-only in the current release. There are no mutations
   wired up. If the user asks for a write, tell them to perform it in
   HighLevel directly.

Conventions:
- Money fields are in account currency, with cents typically as integers.
- Pagination cursors vary by endpoint — pass back the cursor field returned
  in the previous response (\`startAfterId\`, \`startAfterDate\`, \`startAfter\`).
- Date fields are ISO 8601 unless otherwise documented.
- Agency-level (Company) connections must pass an explicit \`locationId\` for
  per-location tools. Location-level connections may omit it.

Auth model:
- This MCP authenticates via personal access tokens (PATs) issued from the
  user's NotFair connect page. Each PAT is scoped to a single HighLevel
  connection (Company or Location). Tokens are revocable from the same page.
`;
