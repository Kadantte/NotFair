import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectRows,
  mockInsertValues,
  mockIdentifyUser,
} = vi.hoisted(() => ({
  mockSelectRows: vi.fn(),
  mockInsertValues: vi.fn(),
  mockIdentifyUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => mockSelectRows()),
          })),
          limit: vi.fn(async () => mockSelectRows()),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: (...args: unknown[]) => mockInsertValues(...args),
    })),
  }),
  schema: {
    oauthClients: {
      clientId: "client_id",
      sessionId: "session_id",
      redirectUris: "redirect_uris",
    },
    mcpSessions: {
      id: "id",
      customerId: "customer_id",
      expiresAt: "expires_at",
    },
    adPlatformConnections: {
      id: "id",
      userId: "user_id",
      platform: "platform",
      activeAccountId: "active_account_id",
    },
    goHighLevelConnections: {
      id: "id",
      userId: "user_id",
      scopes: "scopes",
      updatedAt: "updated_at",
      uninstalledAt: "uninstalled_at",
    },
    authorizationCodes: {},
  },
}));

vi.mock("@/lib/auth/identify-user", () => ({
  identifyUser: (...args: unknown[]) => mockIdentifyUser(...args),
}));

vi.mock("@/lib/demo/seed", () => ({
  ensureDemoOAuthClient: vi.fn(async () => undefined),
}));

vi.mock("@/lib/demo/constants", () => ({
  DEMO_OAUTH_CLIENT_ID: "__demo__",
}));

vi.mock("@/lib/gohighlevel/scopes", () => ({
  hasAllGoHighLevelScopes: () => true,
}));

import { GET } from "@/app/api/oauth/authorize/route";

const REGISTERED_REDIRECT_URI = "https://claude.ai/cb";

function authorizeRequest(resource: string): Request {
  const u = new URL("https://www.notfair.co/api/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", "dcr-client");
  u.searchParams.set("redirect_uri", REGISTERED_REDIRECT_URI);
  u.searchParams.set("state", "xyz");
  u.searchParams.set("resource", resource);
  return new Request(u.toString());
}

const GOOGLE_RESOURCE = "https://www.notfair.co/api/mcp/google_ads";
const META_RESOURCE = "https://www.notfair.co/api/mcp/meta_ads";

/**
 * Parse the `next` query param off a redirect Location, treat it as a
 * relative URL, and return the parsed pieces. Lets us assert pathname +
 * key/value pairs structurally rather than coupling to URLSearchParams
 * ordering or %-encoding.
 */
function parseNext(location: string): { pathname: string; params: URLSearchParams } {
  const next = new URL(location).searchParams.get("next");
  if (!next) throw new Error(`Redirect Location has no \`next\` param: ${location}`);
  const parsed = new URL(next, "https://www.notfair.co");
  return { pathname: parsed.pathname, params: parsed.searchParams };
}

function expectNextRoundTrips(location: string, resource: string): void {
  const { pathname, params } = parseNext(location);
  expect(pathname).toBe("/api/oauth/authorize");
  expect(params.get("response_type")).toBe("code");
  expect(params.get("client_id")).toBe("dcr-client");
  expect(params.get("redirect_uri")).toBe(REGISTERED_REDIRECT_URI);
  expect(params.get("state")).toBe("xyz");
  expect(params.get("resource")).toBe(resource);
}

describe("OAuth /authorize — guided redirects replace JSON 403s", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("redirects to /api/auth/signin with prompt=select_account+consent when the user has no Google Ads connection", async () => {
    // oauth_clients lookup — DCR client (session_id NULL, redirect_uris set)
    mockSelectRows.mockResolvedValueOnce([
      { sessionId: null, redirectUris: [REGISTERED_REDIRECT_URI] },
    ]);
    mockIdentifyUser.mockResolvedValue({ userId: "user-1" });
    // ad_platform_connections lookup — empty (no Google connection at all)
    mockSelectRows.mockResolvedValueOnce([]);

    const response = await GET(authorizeRequest(GOOGLE_RESOURCE));

    expect(response.status).toBe(307);
    const location = response.headers.get("location")!;
    const loc = new URL(location);
    expect(loc.pathname).toBe("/api/auth/signin");
    expect(loc.searchParams.get("prompt")).toBe("select_account+consent");
    expectNextRoundTrips(location, GOOGLE_RESOURCE);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("redirects to the Google account picker when the connection has no activeAccountId", async () => {
    mockSelectRows.mockResolvedValueOnce([
      { sessionId: null, redirectUris: [REGISTERED_REDIRECT_URI] },
    ]);
    mockIdentifyUser.mockResolvedValue({ userId: "user-1" });
    // Connection row exists but no activeAccountId — picker, don't 403.
    mockSelectRows.mockResolvedValueOnce([{ id: 42, activeAccountId: null }]);

    const response = await GET(authorizeRequest(GOOGLE_RESOURCE));

    expect(response.status).toBe(307);
    const location = response.headers.get("location")!;
    expect(new URL(location).pathname).toBe(
      "/manage-ads-accounts/google-ads/select",
    );
    expectNextRoundTrips(location, GOOGLE_RESOURCE);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("mints an authorization code when the Google connection has an activeAccountId", async () => {
    mockSelectRows.mockResolvedValueOnce([
      { sessionId: null, redirectUris: [REGISTERED_REDIRECT_URI] },
    ]);
    mockIdentifyUser.mockResolvedValue({ userId: "user-1" });
    mockSelectRows.mockResolvedValueOnce([
      { id: 42, activeAccountId: "1234567890" },
    ]);

    const response = await GET(authorizeRequest(GOOGLE_RESOURCE));

    expect(response.status).toBe(307);
    const loc = new URL(response.headers.get("location")!);
    expect(loc.origin).toBe("https://claude.ai");
    expect(loc.pathname).toBe("/cb");
    expect(loc.searchParams.get("code")).toMatch(/^[a-f0-9]{64}$/);
    expect(loc.searchParams.get("state")).toBe("xyz");

    // Auth code was inserted with the resolved connection binding.
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertArg = mockInsertValues.mock.calls[0][0];
    expect(insertArg.connectionId).toBe(42);
    expect(insertArg.sessionId).toBeNull();
    expect(insertArg.gohighlevelConnectionId).toBeNull();
    expect(insertArg.resourceUrl).toBe("/api/mcp/google_ads");
  });

  it("redirects to the Meta picker when the Meta connection has no activeAccountId", async () => {
    mockSelectRows.mockResolvedValueOnce([
      { sessionId: null, redirectUris: [REGISTERED_REDIRECT_URI] },
    ]);
    mockIdentifyUser.mockResolvedValue({ userId: "user-1" });
    // Meta connection exists, no activeAccountId.
    mockSelectRows.mockResolvedValueOnce([{ id: 99, activeAccountId: null }]);

    const response = await GET(authorizeRequest(META_RESOURCE));

    expect(response.status).toBe(307);
    const location = response.headers.get("location")!;
    expect(new URL(location).pathname).toBe("/manage-ads-accounts/meta-ads");
    expectNextRoundTrips(location, META_RESOURCE);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});
