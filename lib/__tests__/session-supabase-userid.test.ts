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
    mockReadGoogleFromConnections: vi.fn(() => false),
    mockLoadGoogleConnection: vi.fn(async () => null),
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
  loadGoogleConnection: (...args: unknown[]) => mockLoadGoogleConnection(...args),
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

// ─── Tests ──────────────────────────────────────────────────────────

const SUPABASE_USER = {
  id: "supabase-user-uuid-1234",
  email: "user@example.com",
};

const MCP_ROW = {
  accessToken: "session-cookie-token",
  refreshToken: "rt",
  customerId: "111",
  customerIds: '[{"id":"111","name":"Acct"}]',
  loginCustomerId: null,
  userId: SUPABASE_USER.id,
  googleEmail: SUPABASE_USER.email,
};

describe("Phase-4 step 1 — Supabase-first userId resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies._clear();
    mockReadUserIdFromSupabase.mockReturnValue(false);
    mockReadGoogleFromConnections.mockReturnValue(false);
    mockGetUser.mockReturnValue(null);
    // Default: empty for any DB select. Tests override with mockResolvedValueOnce.
    mockSelectChain.mockResolvedValue([]);
  });

  it("flag off — does NOT call supabase.auth.getUser()", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(false);
    mockCookies._set("adsagent_token", "session-cookie-token");
    // 1: cookie-keyed mcp_sessions row.  2: meta connection (none).
    mockSelectChain.mockResolvedValueOnce([MCP_ROW]).mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("flag on + supabase user present — looks up mcp_sessions by user_id", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(SUPABASE_USER);
    // 1: user_id-keyed mcp_sessions row.  2: meta connection (none).
    mockSelectChain.mockResolvedValueOnce([MCP_ROW]).mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (session.connected) {
      expect(session.userId).toBe(SUPABASE_USER.id);
      expect(session.googleEmail).toBe(SUPABASE_USER.email);
    }
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("flag on + no supabase user — falls through to adsagent_token cookie path", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(null); // no Supabase session
    mockCookies._set("adsagent_token", "session-cookie-token");
    // 1: cookie-keyed mcp_sessions row.  2: meta connection (none).
    mockSelectChain.mockResolvedValueOnce([MCP_ROW]).mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("flag on + supabase user but no live mcp_sessions row — falls through to cookie path", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(SUPABASE_USER);
    mockCookies._set("adsagent_token", "session-cookie-token");
    // 1: user_id-keyed (empty).  2: cookie-keyed (row).  3: meta (none).
    mockSelectChain
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([MCP_ROW])
      .mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
  });

  it("flag on + no supabase user + no cookie — returns disconnected", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue(null);
    // No cookies, no DB rows.

    const session = await getSession();

    expect(session.connected).toBe(false);
  });

  it("flag on — Supabase email overrides stale mcp_sessions.googleEmail", async () => {
    mockReadUserIdFromSupabase.mockReturnValue(true);
    mockGetUser.mockReturnValue({
      id: SUPABASE_USER.id,
      email: "current@example.com",
    });
    mockSelectChain
      .mockResolvedValueOnce([{ ...MCP_ROW, googleEmail: "stale@example.com" }])
      .mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (session.connected) {
      // Supabase is the source of truth post-bridge.
      expect(session.googleEmail).toBe("current@example.com");
    }
  });
});
