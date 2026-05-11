import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { GhlAuthContext } from "@/lib/gohighlevel/mcp-tools";

const { ghlDeleteMock, ghlGetMock, ghlPatchMock, ghlPostMock, ghlPutMock } = vi.hoisted(() => ({
  ghlDeleteMock: vi.fn(),
  ghlGetMock: vi.fn(),
  ghlPatchMock: vi.fn(),
  ghlPostMock: vi.fn(),
  ghlPutMock: vi.fn(),
}));

const { selectGhlConnectionRows } = vi.hoisted(() => ({
  selectGhlConnectionRows: vi.fn(),
}));

vi.mock("@/lib/gohighlevel/client", () => ({
  ghlDelete: ghlDeleteMock,
  ghlGet: ghlGetMock,
  ghlPatch: ghlPatchMock,
  ghlPost: ghlPostMock,
  ghlPut: ghlPutMock,
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectGhlConnectionRows()),
        })),
      })),
    })),
  }),
  schema: {
    goHighLevelConnections: {
      id: "id",
      userId: "user_id",
      agencyConnectionId: "agency_connection_id",
      locationId: "location_id",
      userType: "user_type",
      uninstalledAt: "uninstalled_at",
    },
  },
}));

import { registerGoHighLevelTools } from "@/lib/gohighlevel/mcp-tools";
import { GOHIGHLEVEL_READONLY_SCOPES, GOHIGHLEVEL_SCOPES, GOHIGHLEVEL_WRITE_SCOPES } from "@/lib/gohighlevel/scopes";

type RegisteredTool = {
  config: { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
};

function setupTools(authOverrides: Partial<GhlAuthContext> = {}) {
  const auth: GhlAuthContext = {
    connectionId: 42,
    userId: "user_123",
    companyId: "company_123",
    locationId: "loc_123",
    userType: "Company",
    ...authOverrides,
  };
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: vi.fn((name: string, config: RegisteredTool["config"], handler: RegisteredTool["handler"]) => {
      tools.set(name, { config, handler });
    }),
  };

  registerGoHighLevelTools(server as never, () => auth);
  return { tools };
}

describe("GoHighLevel MCP tools", () => {
  beforeEach(() => {
    ghlDeleteMock.mockReset();
    ghlGetMock.mockReset();
    ghlPatchMock.mockReset();
    ghlPostMock.mockReset();
    ghlPutMock.mockReset();
    selectGhlConnectionRows.mockReset();
    ghlDeleteMock.mockResolvedValue({ ok: true });
    ghlGetMock.mockResolvedValue({ ok: true });
    ghlPatchMock.mockResolvedValue({ ok: true });
    ghlPostMock.mockResolvedValue({ ok: true });
    ghlPutMock.mockResolvedValue({ ok: true });
    selectGhlConnectionRows.mockResolvedValue([]);
  });

  it("registers read and approved-write tools with matching OAuth scopes", () => {
    const { tools } = setupTools();

    expect(tools.size).toBeGreaterThan(25);
    expect(tools.get("request")?.config.annotations?.readOnlyHint).toBe(true);
    expect(tools.get("createSubAccount")?.config.annotations?.readOnlyHint).toBe(false);
    expect(tools.get("writeRequest")?.config.annotations?.destructiveHint).toBe(true);
    expect(GOHIGHLEVEL_READONLY_SCOPES.every((scope) => scope.endsWith(".readonly"))).toBe(true);
    expect(GOHIGHLEVEL_WRITE_SCOPES).toContain("locations.write");
    expect(GOHIGHLEVEL_WRITE_SCOPES).toContain("users.write");
    expect(GOHIGHLEVEL_SCOPES).not.toContain("contacts.write");
    expect(GOHIGHLEVEL_READONLY_SCOPES).toContain("documents_contracts_template/list.readonly");
    expect(GOHIGHLEVEL_READONLY_SCOPES).not.toContain("documents_contracts_templates/list.readonly");
  });

  it("uses HighLevel alt scoping for media, invoice, and transaction reads", async () => {
    const { tools } = setupTools();

    await tools.get("listMediaFiles")!.handler({ locationId: "loc_abc", limit: 10 });
    await tools.get("listInvoices")!.handler({ locationId: "loc_abc", status: "paid" });
    await tools.get("listTransactions")!.handler({ locationId: "loc_abc", contactId: "contact_1" });

    expect(ghlGetMock).toHaveBeenNthCalledWith(1, 42, "/medias/files", {
      altId: "loc_abc",
      altType: "location",
      limit: 10,
      offset: undefined,
    });
    expect(ghlGetMock).toHaveBeenNthCalledWith(2, 42, "/invoices/", {
      altId: "loc_abc",
      altType: "location",
      status: "paid",
      limit: 20,
      offset: undefined,
    });
    expect(ghlGetMock).toHaveBeenNthCalledWith(3, 42, "/payments/transactions/", {
      altId: "loc_abc",
      altType: "location",
      contactId: "contact_1",
      limit: 20,
      offset: undefined,
    });
  });

  it("routes Company-scoped location reads through the matching Location connection token", async () => {
    selectGhlConnectionRows.mockResolvedValue([{ id: 99 }]);
    const { tools } = setupTools({ connectionId: 42, userType: "Company", locationId: null });

    await tools.get("listContacts")!.handler({ locationId: "loc_child", limit: 1 });

    expect(ghlGetMock).toHaveBeenCalledWith(99, "/contacts/", {
      locationId: "loc_child",
      limit: 1,
      startAfterId: undefined,
      query: undefined,
    });
  });

  it("creates agency sub-accounts with the agency connection token", async () => {
    const { tools } = setupTools({ connectionId: 42, userType: "Company", companyId: "company_123", locationId: null });

    await tools.get("createSubAccount")!.handler({
      confirm: true,
      payload: { name: "New Client", address: "1 Main St" },
    });

    expect(ghlPostMock).toHaveBeenCalledWith(42, "/locations/", {
      name: "New Client",
      address: "1 Main St",
      companyId: "company_123",
    });
  });

  it("creates users with the connection token", async () => {
    const { tools } = setupTools({ connectionId: 42, userType: "Company", locationId: null });

    await tools.get("createUser")!.handler({
      confirm: true,
      user: { firstName: "Ada", email: "ada@example.com", type: "account" },
    });

    expect(ghlPostMock).toHaveBeenCalledWith(42, "/users/", {
      firstName: "Ada",
      email: "ada@example.com",
      type: "account",
    });
  });

  it("requires explicit confirmation before write tools mutate HighLevel", async () => {
    const { tools } = setupTools();

    const result = await tools.get("writeRequest")!.handler({
      method: "POST",
      path: "/locations/",
      body: { name: "Needs approval" },
    });

    expect(result.isError).toBe(true);
    expect(ghlPostMock).not.toHaveBeenCalled();
  });

  it("limits generic writes to agency setup paths", async () => {
    const { tools } = setupTools();

    const result = await tools.get("writeRequest")!.handler({
      confirm: true,
      method: "POST",
      path: "/contacts/",
      body: { locationId: "loc_123" },
    });

    expect(result.isError).toBe(true);
    expect(ghlPostMock).not.toHaveBeenCalled();
  });

  it("uses endpoint-specific pagination parameters for forms and surveys", async () => {
    const { tools } = setupTools();

    await tools.get("listForms")!.handler({ skip: 40 });
    await tools.get("listFormSubmissions")!.handler({ page: 3 });
    await tools.get("listSurveys")!.handler({ skip: 5 });
    await tools.get("listSurveySubmissions")!.handler({ page: 2 });

    expect(ghlGetMock).toHaveBeenNthCalledWith(1, 42, "/forms/", {
      locationId: "loc_123",
      limit: 20,
      skip: 40,
    });
    expect(ghlGetMock).toHaveBeenNthCalledWith(2, 42, "/forms/submissions", {
      locationId: "loc_123",
      formId: undefined,
      startAt: undefined,
      endAt: undefined,
      limit: 20,
      page: 3,
    });
    expect(ghlGetMock).toHaveBeenNthCalledWith(3, 42, "/surveys/", {
      locationId: "loc_123",
      limit: 20,
      skip: 5,
    });
    expect(ghlGetMock).toHaveBeenNthCalledWith(4, 42, "/surveys/submissions", {
      locationId: "loc_123",
      surveyId: undefined,
      startAt: undefined,
      endAt: undefined,
      limit: 20,
      page: 2,
    });
  });

  it("prevents Location-scoped connections from overriding their location", async () => {
    const { tools } = setupTools({ userType: "Location", locationId: "loc_home", companyId: null });

    const tasks = await tools.get("listTasks")!.handler({ locationId: "loc_other" });
    const users = await tools.get("listUsers")!.handler({ locationId: "loc_other" });

    expect(tasks.isError).toBe(true);
    expect(users.isError).toBe(true);
    expect(ghlGetMock).not.toHaveBeenCalled();
    expect(ghlPostMock).not.toHaveBeenCalled();
  });

  it("constrains the generic request tool to explicit read-path families", async () => {
    const { tools } = setupTools();
    const request = tools.get("request")!;

    await request.handler({ path: "/objects/schema", query: { locationId: "loc_123" } });
    expect(ghlGetMock).toHaveBeenCalledWith(42, "/objects/schema", { locationId: "loc_123" });

    const deniedOauth = await request.handler({ path: "/oauth/installedLocations" });
    const deniedHost = await request.handler({ path: "//evil.test/objects" });

    expect(deniedOauth.isError).toBe(true);
    expect(deniedHost.isError).toBe(true);
  });

  it("prevents generic request from crossing Location-scoped connection boundaries", async () => {
    const { tools } = setupTools({ userType: "Location", locationId: "loc_home", companyId: null });
    const request = tools.get("request")!;

    const deniedQuery = await request.handler({
      path: "/objects/schema",
      query: { locationId: "loc_other" },
    });
    const deniedAlt = await request.handler({
      path: "/payments/transactions/",
      query: { altId: "loc_other", altType: "location" },
    });
    const deniedPath = await request.handler({ path: "/locations/loc_other/customFields" });

    expect(deniedQuery.isError).toBe(true);
    expect(deniedAlt.isError).toBe(true);
    expect(deniedPath.isError).toBe(true);
    expect(ghlGetMock).not.toHaveBeenCalled();
  });
});
