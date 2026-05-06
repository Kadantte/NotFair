import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({ get: vi.fn() }));
const fetchMock = vi.hoisted(() => vi.fn());
const dbCalls = vi.hoisted(() => ({
  selectFromSessions: vi.fn(),
  selectFromConnections: vi.fn(),
  deleteOauthBySession: vi.fn(),
  deleteAuthCodesBySession: vi.fn(),
  deleteOauthByConn: vi.fn(),
  deleteAuthCodesByConn: vi.fn(),
  deleteConnections: vi.fn(),
  deleteSessions: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: () => sessionMock.get(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
  }),
}));

vi.mock("@/lib/db", () => {
  // Each .from() call returns a thenable .where() that resolves to the
  // configured rows for that table. We dispatch by the schema reference.
  const fakeDb = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            if (table === schemaMock.adPlatformConnections) {
              return Promise.resolve(dbCalls.selectFromConnections());
            }
            return Promise.resolve(dbCalls.selectFromSessions());
          },
          // No-limit path used when fetching all session rows for a user.
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve(dbCalls.selectFromSessions()).then(resolve),
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        if (table === schemaMock.oauthAccessTokens) {
          // Distinguish session-based vs connection-based by call order:
          // session deletes happen first per the route. Track via a counter.
          if (deleteOauthState.count === 0) {
            deleteOauthState.count++;
            return Promise.resolve(dbCalls.deleteOauthBySession());
          }
          return Promise.resolve(dbCalls.deleteOauthByConn());
        }
        if (table === schemaMock.authorizationCodes) {
          if (deleteAuthState.count === 0) {
            deleteAuthState.count++;
            return Promise.resolve(dbCalls.deleteAuthCodesBySession());
          }
          return Promise.resolve(dbCalls.deleteAuthCodesByConn());
        }
        if (table === schemaMock.adPlatformConnections) {
          return Promise.resolve(dbCalls.deleteConnections());
        }
        if (table === schemaMock.mcpSessions) {
          return Promise.resolve(dbCalls.deleteSessions());
        }
        return Promise.resolve();
      },
    }),
  };

  return { db: () => fakeDb, schema: schemaMock };
});

const schemaMock = {
  mcpSessions: { id: "mcp_sessions.id", refreshToken: "mcp_sessions.refresh_token", userId: "mcp_sessions.user_id" },
  adPlatformConnections: {
    id: "ad_platform_connections.id",
    userId: "ad_platform_connections.user_id",
    platform: "ad_platform_connections.platform",
    refreshToken: "ad_platform_connections.refresh_token",
  },
  oauthAccessTokens: { sessionId: "oauth_access_tokens.session_id", connectionId: "oauth_access_tokens.connection_id" },
  authorizationCodes: { sessionId: "authorization_codes.session_id", connectionId: "authorization_codes.connection_id" },
};

const deleteOauthState = { count: 0 };
const deleteAuthState = { count: 0 };

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
}));

beforeEach(() => {
  sessionMock.get.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  for (const fn of Object.values(dbCalls)) fn.mockReset();
  deleteOauthState.count = 0;
  deleteAuthState.count = 0;
  // Default: route's selects resolve to nothing/empty. Tests override.
  dbCalls.selectFromSessions.mockReturnValue([]);
  dbCalls.selectFromConnections.mockReturnValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DELETE /api/auth/disconnect-google", () => {
  it("returns 403 when not authenticated", async () => {
    sessionMock.get.mockResolvedValue({ connected: false });
    const { DELETE } = await import("@/app/api/auth/disconnect-google/route");

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("not_authenticated");
  });

  it("refuses when impersonating to avoid wiping the impersonated user's session", async () => {
    sessionMock.get.mockResolvedValue({
      connected: true,
      userId: "user_123",
      impersonating: true,
    });
    const { DELETE } = await import("@/app/api/auth/disconnect-google/route");

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("impersonating_refused");
  });

  it("is idempotent when there is nothing to disconnect", async () => {
    sessionMock.get.mockResolvedValue({
      connected: true,
      userId: "user_123",
    });
    dbCalls.selectFromSessions.mockReturnValue([]);
    dbCalls.selectFromConnections.mockReturnValue([]);

    const { DELETE } = await import("@/app/api/auth/disconnect-google/route");
    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.alreadyDisconnected).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbCalls.deleteSessions).not.toHaveBeenCalled();
    expect(dbCalls.deleteConnections).not.toHaveBeenCalled();
  });

  it("clears the session cookie on idempotent and successful paths", async () => {
    sessionMock.get.mockResolvedValue({
      connected: true,
      userId: "user_123",
    });
    dbCalls.selectFromSessions.mockReturnValue([]);
    dbCalls.selectFromConnections.mockReturnValue([]);

    const { DELETE } = await import("@/app/api/auth/disconnect-google/route");
    const response = await DELETE();

    // Set-Cookie: at least one cookie must be expired (Max-Age=0 or expires=epoch)
    const setCookie = response.headers.getSetCookie?.() ?? [];
    expect(setCookie.length).toBeGreaterThan(0);
    expect(setCookie.some((c) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c))).toBe(true);
  });
});
