/**
 * Read-only MCP tools for HighLevel.
 *
 * The tool surface is read-heavy and grouped by CRM workflow:
 *   - listLocations     — what locations does this connection have access to?
 *   - listContacts      — paginate contacts, with simple filters.
 *   - listConversations — paginate conversations, by location.
 *   - listOpportunities — paginate opportunities, by pipeline / location.
 *   - listCalendarEvents — date-bounded events.
 *   - metadata/revenue tools — users, pipelines, calendars, custom fields,
 *                              forms/surveys, invoices, payments, products.
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
import { ghlGet, ghlPost } from "@/lib/gohighlevel/client";

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

type ReadToolInput = z.ZodRawShape;

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

function registerReadTool<A extends object>(
  server: McpServer,
  getAuth: GhlAuthLookup,
  name: string,
  description: string,
  inputSchema: ReadToolInput,
  handler: (args: A, auth: GhlAuthContext) => Promise<unknown>,
): void {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: READ_ANNOTATIONS,
    },
    safe(handler as (args: Record<string, unknown>, auth: GhlAuthContext) => Promise<unknown>, getAuth),
  );
}

const REQUEST_ALLOWED_PATH_PREFIXES = [
  "/associations",
  "/documents_contracts",
  "/emails",
  "/invoices",
  "/locations",
  "/objects",
  "/payments",
  "/products",
] as const;

const optionalLocationId = z
  .string()
  .optional()
  .describe("HighLevel location id. Omit to use the connection's pinned location.");

const HIGHLEVEL_ID_RE = /^[A-Za-z0-9_-]+$/;

const paginationInput = {
  limit: z.number().int().min(1).max(100).default(20).describe("Page size, 1-100. Default 20."),
  offset: z.number().int().min(0).optional().describe("Offset for endpoints that support offset pagination."),
} as const;

const skipPaginationInput = {
  limit: z.number().int().min(1).max(100).default(20).describe("Page size, 1-100. Default 20."),
  skip: z.number().int().min(0).optional().describe("Number of records to skip for endpoints that use skip pagination."),
} as const;

const pagePaginationInput = {
  limit: z.number().int().min(1).max(100).default(20).describe("Page size, 1-100. Default 20."),
  page: z.number().int().min(1).optional().describe("One-based page number for endpoints that use page pagination."),
} as const;

function assertHighLevelId(value: string, label: string): string {
  if (!HIGHLEVEL_ID_RE.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or dashes.`);
  }
  return value;
}

function pathSegment(value: string, label: string): string {
  return encodeURIComponent(assertHighLevelId(value, label));
}

function resolveLocationId(args: { locationId?: string }, auth: GhlAuthContext): string {
  if (auth.userType === "Location" && auth.locationId && args.locationId && args.locationId !== auth.locationId) {
    throw new Error("Location-scoped connections cannot override `locationId`.");
  }
  const id = args.locationId ?? auth.locationId;
  if (!id) {
    throw new Error(
      "No locationId on this connection. This connection is agency-level — pass an explicit `locationId` arg.",
    );
  }
  return assertHighLevelId(id, "locationId");
}

function assertAllowedRequestPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#")) {
    throw new Error("`path` must be a root-relative API path without query string or fragment.");
  }
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const allowed = REQUEST_ALLOWED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
  if (!allowed) {
    throw new Error(
      "`request` is limited to explicitly allowed HighLevel read-path families. Use a typed tool for core CRM reads.",
    );
  }
  return path;
}

function decodedPathSegment(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${label} is malformed.`);
  }
}

function assertRequestLocationBoundary(
  path: string,
  query: Record<string, string | number | boolean> | undefined,
  auth: GhlAuthContext,
): Record<string, string | number | boolean> | undefined {
  const guardedQuery = query ? { ...query } : undefined;
  for (const key of ["locationId", "location_id", "altId"]) {
    const value = guardedQuery?.[key];
    if (value === undefined) continue;
    const id = assertHighLevelId(String(value), key);
    if (auth.userType === "Location" && auth.locationId && id !== auth.locationId) {
      throw new Error("Location-scoped connections cannot request another location.");
    }
    guardedQuery![key] = id;
  }

  if (auth.userType === "Location" && auth.locationId) {
    if (path === "/locations" || path === "/locations/search") {
      throw new Error("Use `listLocations` for Location-scoped location reads.");
    }
    if (path.startsWith("/locations/")) {
      const locationId = decodedPathSegment(path.split("/")[2] ?? "", "locationId");
      if (locationId !== auth.locationId) {
        throw new Error("Location-scoped connections cannot request another location.");
      }
    }
  }

  return guardedQuery;
}

export function registerGoHighLevelTools(
  server: McpServer,
  getAuth: GhlAuthLookup,
): void {
  // ─── listLocations ────────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listLocations",
    "List HighLevel locations this connection can see. For an agency-level (Company) connection, returns every location under the company. For a Location-level connection, returns just that location.",
    {},
    async (_args, auth) => {
      if (auth.userType === "Location" && auth.locationId) {
        // Location tokens can only read their own location.
        return await ghlGet(auth.connectionId, `/locations/${pathSegment(auth.locationId, "locationId")}`);
      }
      if (!auth.companyId) {
        throw new Error("Connection has no companyId — cannot list locations.");
      }
      return await ghlGet(auth.connectionId, `/locations/search`, {
        companyId: auth.companyId,
        limit: 100,
      });
    },
  );

  // ─── listContacts ─────────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listContacts",
    "List HighLevel contacts for a location. Supports basic pagination (`limit`, `startAfterId`) and a `query` substring filter against name/email/phone.",
    {
      locationId: optionalLocationId,
      limit: z.number().int().min(1).max(100).default(20).describe("Page size, 1-100. Default 20."),
      startAfterId: z.string().optional().describe("Cursor — pass the last contact id from the previous page."),
      query: z.string().optional().describe("Substring search across name/email/phone."),
    },
    async (args: { locationId?: string; limit?: number; startAfterId?: string; query?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/contacts/", {
        locationId,
        limit: args.limit ?? 20,
        startAfterId: args.startAfterId,
        query: args.query,
      });
    },
  );

  // ─── listConversations ────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listConversations",
    "List HighLevel conversations for a location. Use `lastMessageType` (TYPE_SMS, TYPE_EMAIL, TYPE_CALL, ...) to filter by channel.",
    {
      locationId: optionalLocationId,
      limit: z.number().int().min(1).max(100).default(20),
      startAfterDate: z.string().optional().describe("ISO 8601 timestamp to paginate before."),
      lastMessageType: z.string().optional(),
    },
    async (args: {
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
    },
  );

  // ─── listOpportunities ────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listOpportunities",
    "List HighLevel opportunities for a location. Optionally filter by pipeline.",
    {
      locationId: optionalLocationId,
      pipelineId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      startAfter: z.string().optional().describe("Cursor for pagination."),
    },
    async (args: {
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
    },
  );

  // ─── listCalendarEvents ───────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listCalendarEvents",
    "List HighLevel calendar events for a location, bounded by `startDate` / `endDate` (ISO 8601). Use `calendarId` to scope to a single calendar.",
    {
      locationId: optionalLocationId,
      calendarId: z.string().optional(),
      startDate: z.string().describe("ISO 8601 start of window."),
      endDate: z.string().describe("ISO 8601 end of window."),
    },
    async (args: {
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
    },
  );

  // ─── listCalendars ───────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listCalendars",
    "List HighLevel calendars for a location, including ids needed for calendar event queries.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/calendars/", { locationId });
    },
  );

  // ─── listPipelines ───────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listPipelines",
    "List HighLevel opportunity pipelines and stages for a location. Use these ids to filter `listOpportunities`.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/opportunities/pipelines", { locationId });
    },
  );

  // ─── listUsers ───────────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listUsers",
    "List HighLevel users/team members. Pass `locationId` when you want sub-account scoped users.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      if (auth.userType === "Location") {
        const locationId = resolveLocationId(args, auth);
        return await ghlGet(auth.connectionId, "/users/", { locationId });
      }
      const locationId = args.locationId ? assertHighLevelId(args.locationId, "locationId") : undefined;
      return await ghlGet(auth.connectionId, "/users/", {
        companyId: auth.companyId ?? undefined,
        locationId,
      });
    },
  );

  // ─── listBusinesses ──────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listBusinesses",
    "List HighLevel businesses for a location.",
    {
      locationId: optionalLocationId,
      ...paginationInput,
    },
    async (args: { locationId?: string; limit?: number; offset?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/businesses", {
        locationId,
        limit: args.limit ?? 20,
        offset: args.offset,
      });
    },
  );

  // ─── location metadata ────────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listCustomFields",
    "List custom fields configured for a HighLevel location. Useful for interpreting contact and opportunity custom field ids.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, `/locations/${pathSegment(locationId, "locationId")}/customFields`);
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listCustomValues",
    "List custom values configured for a HighLevel location.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, `/locations/${pathSegment(locationId, "locationId")}/customValues`);
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listTags",
    "List tags configured for a HighLevel location.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, `/locations/${pathSegment(locationId, "locationId")}/tags`);
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listTasks",
    "Search HighLevel tasks for a location. This is read-only even though HighLevel exposes the search endpoint as POST.",
    {
      locationId: optionalLocationId,
      assignedTo: z.string().optional().describe("Optional HighLevel user id to filter assigned tasks."),
      completed: z.boolean().optional().describe("Filter by completion status when supported by HighLevel."),
      dueDateFrom: z.string().optional().describe("ISO 8601 lower bound for due date."),
      dueDateTo: z.string().optional().describe("ISO 8601 upper bound for due date."),
      ...paginationInput,
    },
    async (args: {
      locationId?: string;
      assignedTo?: string;
      completed?: boolean;
      dueDateFrom?: string;
      dueDateTo?: string;
      limit?: number;
      offset?: number;
    }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlPost(auth.connectionId, `/locations/${pathSegment(locationId, "locationId")}/tasks/search`, {
        assignedTo: args.assignedTo,
        completed: args.completed,
        dueDateFrom: args.dueDateFrom,
        dueDateTo: args.dueDateTo,
        limit: args.limit ?? 20,
        offset: args.offset,
      });
    },
  );

  // ─── forms / surveys / workflows ─────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listForms",
    "List HighLevel forms for a location.",
    {
      locationId: optionalLocationId,
      ...skipPaginationInput,
    },
    async (args: { locationId?: string; limit?: number; skip?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/forms/", {
        locationId,
        limit: args.limit ?? 20,
        skip: args.skip,
      });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listFormSubmissions",
    "List HighLevel form submissions for a location.",
    {
      locationId: optionalLocationId,
      formId: z.string().optional(),
      startAt: z.string().optional().describe("ISO 8601 lower bound when supported."),
      endAt: z.string().optional().describe("ISO 8601 upper bound when supported."),
      ...pagePaginationInput,
    },
    async (args: {
      locationId?: string;
      formId?: string;
      startAt?: string;
      endAt?: string;
      limit?: number;
      page?: number;
    }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/forms/submissions", {
        locationId,
        formId: args.formId,
        startAt: args.startAt,
        endAt: args.endAt,
        limit: args.limit ?? 20,
        page: args.page,
      });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listSurveys",
    "List HighLevel surveys for a location.",
    {
      locationId: optionalLocationId,
      ...skipPaginationInput,
    },
    async (args: { locationId?: string; limit?: number; skip?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/surveys/", {
        locationId,
        limit: args.limit ?? 20,
        skip: args.skip,
      });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listSurveySubmissions",
    "List HighLevel survey submissions for a location.",
    {
      locationId: optionalLocationId,
      surveyId: z.string().optional(),
      startAt: z.string().optional().describe("ISO 8601 lower bound when supported."),
      endAt: z.string().optional().describe("ISO 8601 upper bound when supported."),
      ...pagePaginationInput,
    },
    async (args: {
      locationId?: string;
      surveyId?: string;
      startAt?: string;
      endAt?: string;
      limit?: number;
      page?: number;
    }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/surveys/submissions", {
        locationId,
        surveyId: args.surveyId,
        startAt: args.startAt,
        endAt: args.endAt,
        limit: args.limit ?? 20,
        page: args.page,
      });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listWorkflows",
    "List HighLevel workflows for a location. HighLevel exposes workflow metadata, not full internal workflow logic.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/workflows/", { locationId });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listCampaigns",
    "List legacy HighLevel campaigns for a location when available.",
    {
      locationId: optionalLocationId,
    },
    async (args: { locationId?: string }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/campaigns/", { locationId });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listMediaFiles",
    "List files in HighLevel media storage for a location.",
    {
      locationId: optionalLocationId,
      ...paginationInput,
    },
    async (args: { locationId?: string; limit?: number; offset?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/medias/files", {
        altId: locationId,
        altType: "location",
        limit: args.limit ?? 20,
        offset: args.offset,
      });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listTriggerLinks",
    "List HighLevel trigger links for a location.",
    {
      locationId: optionalLocationId,
      ...paginationInput,
    },
    async (args: { locationId?: string; limit?: number; offset?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/links/", {
        locationId,
        limit: args.limit ?? 20,
        offset: args.offset,
      });
    },
  );

  // ─── commerce / revenue ──────────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "listInvoices",
    "List HighLevel invoices for a location.",
    {
      locationId: optionalLocationId,
      status: z.string().optional(),
      ...paginationInput,
    },
    async (args: { locationId?: string; status?: string; limit?: number; offset?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/invoices/", {
        altId: locationId,
        altType: "location",
        status: args.status,
        limit: args.limit ?? 20,
        offset: args.offset,
      });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listTransactions",
    "List HighLevel payment transactions for a location.",
    {
      locationId: optionalLocationId,
      contactId: z.string().optional(),
      ...paginationInput,
    },
    async (args: { locationId?: string; contactId?: string; limit?: number; offset?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/payments/transactions/", {
        altId: locationId,
        altType: "location",
        contactId: args.contactId,
        limit: args.limit ?? 20,
        offset: args.offset,
      });
    },
  );

  registerReadTool(
    server,
    getAuth,
    "listProducts",
    "List HighLevel products for a location.",
    {
      locationId: optionalLocationId,
      ...paginationInput,
    },
    async (args: { locationId?: string; limit?: number; offset?: number }, auth) => {
      const locationId = resolveLocationId(args, auth);
      return await ghlGet(auth.connectionId, "/products/", {
        locationId,
        limit: args.limit ?? 20,
        offset: args.offset,
      });
    },
  );

  // ─── request (escape hatch) ───────────────────────────────────────────
  registerReadTool(
    server,
    getAuth,
    "request",
    "Generic READ-ONLY GET against the HighLevel API. Path is appended to https://services.leadconnectorhq.com. Use this for endpoints not yet wrapped by a typed tool (e.g. /pipelines, /custom-fields). Query params go in `query`.",
    {
      path: z.string().describe("API path beginning with /."),
      query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    },
    async (args: { path: string; query?: Record<string, string | number | boolean> }, auth) => {
      const path = assertAllowedRequestPath(args.path);
      return await ghlGet(auth.connectionId, path, assertRequestLocationBoundary(path, args.query, auth));
    },
  );
}

export const GHL_MCP_INSTRUCTIONS = `NotFair is an MCP for the GoHighLevel CRM. You are an expert revenue-ops practitioner whose goal is to help the user understand their CRM state — contacts, conversations, opportunities, calendar bookings — and surface insight without making changes.

Tool-selection heuristic — pick the most specific tool first:

1. Core CRM reads → \`listContacts\`, \`listConversations\`, \`listOpportunities\`,
   \`listCalendarEvents\`, \`listLocations\`.

2. Metadata and configuration → \`listUsers\`, \`listPipelines\`, \`listCalendars\`,
   \`listCustomFields\`, \`listCustomValues\`, \`listTags\`, \`listTasks\`,
   \`listBusinesses\`, \`listWorkflows\`, \`listCampaigns\`, \`listMediaFiles\`,
   \`listTriggerLinks\`.

3. Intake and revenue context → \`listForms\`, \`listFormSubmissions\`,
   \`listSurveys\`, \`listSurveySubmissions\`, \`listInvoices\`,
   \`listTransactions\`, \`listProducts\`.

4. Reach for \`request\` only when no typed tool covers the endpoint you need.
   It is a read-only GET against the HighLevel API; pass \`path\` and \`query\`.
   Examples: /objects, /associations/, /products/:productId/price/.

5. This MCP is read-only in the current release. There are no mutations
   wired up. If the user asks for a write, tell them to perform it in
   HighLevel directly.

Conventions:
- Money fields are in account currency, with cents typically as integers.
- Pagination cursors vary by endpoint — pass back the cursor field returned
  in the previous response (\`startAfterId\`, \`startAfterDate\`, \`startAfter\`).
- Date fields are ISO 8601 unless otherwise documented.
- Agency-level (Company) connections must pass an explicit \`locationId\` for
  per-location tools. Location-level connections may omit it.
- Use \`listCustomFields\` before interpreting custom field ids on contacts,
  opportunities, form submissions, or custom objects.

Auth model:
- This MCP authenticates via personal access tokens (PATs) issued from the
  user's NotFair connect page. Each PAT is scoped to a single HighLevel
  connection (Company or Location). Tokens are revocable from the same page.
`;
