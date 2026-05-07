import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Hoisted mocks ──────────────────────────────────────────────────

const {
  mockCookies,
  mockSelectChain,
  mockGetUser,
  mockReadUserIdFromSupabase,
  mockReadGoogleFromConnections,
  mockLoadGoogleConnection,
} = vi.hoisted(() => {
  const cookieStore = new Map<string, { value: string }>();
  return {
    mockCookies: {
      get: (name: string) => cookieStore.get(name),
      _set: (name: string, value: string) => cookieStore.set(name, { value }),
      _clear: () => cookieStore.clear(),
    },
    mockSelectChain: vi.fn(),
    mockGetUser: vi.fn(),
    mockReadUserIdFromSupabase: vi.fn(() => false),
    mockReadGoogleFromConnections: vi.fn(() => true),
    mockLoadGoogleConnection: vi.fn(async () => null as unknown),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookies),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectChain()),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => mockSelectChain()),
          })),
        })),
      })),
    })),
  }),
  schema: {
    mcpSessions: {
      id: "id",
      accessToken: "access_token",
      expiresAt: "expires_at",
      refreshToken: "refresh_token",
      customerId: "customer_id",
      customerIds: "customer_ids",
      loginCustomerId: "login_customer_id",
      userId: "user_id",
      googleEmail: "google_email",
      createdAt: "created_at",
    },
    adPlatformConnections: {
      accountIds: "account_ids",
      activeAccountId: "active_account_id",
      userId: "user_id",
      platform: "platform",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  gte: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("@/lib/google-ads", () => ({
  deriveCustomerName: vi.fn((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return parsed.map((a: { name?: string; id: string }) => a.name || a.id).join(", ");
    } catch {
      return "Google Ads Account";
    }
  }),
  parseCustomerIds: vi.fn((raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }),
}));

vi.mock("@/lib/dev-access", () => ({
  DEV_EMAILS: [],
}));

vi.mock("@/lib/auth-cookies", () => ({
  COOKIE_NAMES: {
    token: "adsagent_token",
    impersonate: "adsagent_impersonate",
    profile: "adsagent_profile",
    activePlatform: "adsagent_active_platform",
  },
}));

vi.mock("@/lib/active-platform", () => ({
  resolveActivePlatform: vi.fn(() => "google_ads"),
}));

vi.mock("@/lib/connections/feature-flags", () => ({
  readUserIdFromSupabase: () => mockReadUserIdFromSupabase(),
  readGoogleFromConnections: () => mockReadGoogleFromConnections(),
}));

vi.mock("@/lib/connections/google-read", () => ({
  loadGoogleConnection: () => mockLoadGoogleConnection(),
  compareForShadowRead: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockGetUser() }, error: null }),
    },
  })),
}));

import { getSession } from "@/lib/session";

// ─── Test data ──────────────────────────────────────────────────────

const SUPABASE_USER = {
  id: "supabase-user-uuid-1234",
  email: "user@example.com",
};

const CONNECTION_VIEW = {
  refreshToken: "rt-from-connection",
  customerId: "111",
  customerIds: [{ id: "111", name: "Acct" }],
  loginCustomerId: null,
  googleEmail: null,
};

const LEGACY_TOKEN_ROW = { accessToken: "legacy-bearer-token" };

const COOKIE_PATH_MCP_ROW = {
  refreshToken: "rt-from-mcp",
  customerId: "999",
  customerIds: '[{"id":"999","name":"Cookie Acct"}]',
  loginCustomerId: null,
  userId: SUPABASE_USER.id,
  googleEmail: SUPABASE_USER.email,
};

// ─── Tests ──────────────────────────────────────────────────────────

describe("Phase-4 step 1 — Supabase-anchored session loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies._clear();
    mockReadUserIdFromSupabase.mockReturnValue(false);
    mockReadGoogleFromConnections.mockReturnValue(true);
    mockGetUser.mockReturnValue(null);
    mockLoadGoogleConnection.mockResolvedValue(null);
    mockSelectChain.mockResolvedValue([]);
  });

  it("flag off — does NOT call supabase.auth.getUser()", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(false);
    mockCookies._set("adsagent_token", "session-cookie-token");
    // 1: cookie-keyed mcp_sessions row.  2: meta connection (none).
    mockSelectChain
      .mockResolvedValueOnce([COOKIE_PATH_MCP_ROW])
      .mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("flag on + supabase user + connection — row sourced from connection, NOT from mcp_sessions", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(SUPABASE_USER);
    mockLoadGoogleConnection.mockResolvedValueOnce(CONNECTION_VIEW);
    // 1: legacy mcp_sessions for Session.token. 2: meta connection (none).
    mockSelectChain
      .mockResolvedValueOnce([LEGACY_TOKEN_ROW])
      .mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (session.connected) {
      expect(session.userId).toBe(SUPABASE_USER.id);
      // customerId comes from the CONNECTION view, not from mcp_sessions
      expect(session.customerId).toBe(CONNECTION_VIEW.customerId);
      expect(session.googleEmail).toBe(SUPABASE_USER.email);
      // Legacy token still surfaced (until phase 3 retires direct-bearer)
      expect(session.token).toBe(LEGACY_TOKEN_ROW.accessToken);
    }
    expect(mockLoadGoogleConnection).toHaveBeenCalled();
  });

  it("flag on + supabase user + NO connection — ads-less but connected", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(SUPABASE_USER);
    mockLoadGoogleConnection.mockResolvedValueOnce(null);
    // 1: legacy mcp_sessions for Session.token (also empty).  2: meta (none).
    mockSelectChain
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (session.connected) {
      expect(session.pendingSetup).toBe(true);
      expect(session.userId).toBe(SUPABASE_USER.id);
      expect(session.token).toBe(""); // no legacy row → empty token
    }
  });

  it("flag on + no supabase user — falls through to legacy cookie path", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(null);
    mockCookies._set("adsagent_token", "session-cookie-token");
    // Cookie path: 1: mcp_sessions by accessToken. 2: meta.
    mockSelectChain
      .mockResolvedValueOnce([COOKIE_PATH_MCP_ROW])
      .mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("flag on + no supabase user + no cookie — disconnected", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(null);

    const session = await getSession();

    expect(session.connected).toBe(false);
  });

  it("Supabase path loads Meta accounts via the same user_id", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(SUPABASE_USER);
    mockLoadGoogleConnection.mockResolvedValueOnce(CONNECTION_VIEW);
    // 1: legacy mcp_sessions for Session.token (none).
    // 2: meta connection — populated for this user.
    mockSelectChain
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          accountIds: [
            { id: "act_meta_1", name: "Meta Acct 1" },
            { id: "act_meta_2", name: "Meta Acct 2" },
          ],
          activeAccountId: "act_meta_1",
        },
      ]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (session.connected) {
      // Google still resolves (from connection)
      expect(session.customerId).toBe(CONNECTION_VIEW.customerId);
      // Meta loaded via the same userId pulled from Supabase
      expect(session.metaAccounts).toEqual([
        { id: "act_meta_1", name: "Meta Acct 1" },
        { id: "act_meta_2", name: "Meta Acct 2" },
      ]);
      expect(session.activeMetaAccountId).toBe("act_meta_1");
    }
  });

  it("Supabase email beats stale connection.googleEmail", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue({ id: SUPABASE_USER.id, email: "current@example.com" });
    mockLoadGoogleConnection.mockResolvedValueOnce({
      ...CONNECTION_VIEW,
      googleEmail: "stale-from-connection-metadata@example.com",
    });
    mockSelectChain.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (session.connected) {
      expect(session.googleEmail).toBe("current@example.com");
    }
  });
});
