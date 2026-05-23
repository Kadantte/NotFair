import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Hoisted mocks ──────────────────────────────────────────────────

const {
  mockCookies,
  mockSelectChain,
  mockGetUser,
  mockLoadGoogleConnection,
} = vi.hoisted(() => {
  const cookieStore = new Map<string, { value: string }>();
  return {
    mockCookies: {
      get: (name: string) => cookieStore.get(name),
      getAll: () => Array.from(cookieStore.entries()).map(([name, v]) => ({ name, value: v.value })),
      _set: (name: string, value: string) => cookieStore.set(name, { value }),
      _clear: () => cookieStore.clear(),
    },
    mockSelectChain: vi.fn(),
    mockGetUser: vi.fn(),
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
  DEV_EMAILS: ["dev@example.com"],
}));

vi.mock("@/lib/auth-cookies", () => ({
  COOKIE_NAMES: {
    impersonate: "adsagent_impersonate",
    profile: "adsagent_profile",
    activePlatform: "adsagent_active_platform",
  },
}));

vi.mock("@/lib/active-platform", () => ({
  resolveActivePlatform: vi.fn(() => "google_ads"),
}));

vi.mock("@/lib/connections/google-read", () => ({
  loadGoogleConnection: () => mockLoadGoogleConnection(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockGetUser() }, error: null }),
    },
  })),
}));

// ─── Test data ──────────────────────────────────────────────────────

const DEV_USER = {
  id: "dev-user-uuid",
  email: "dev@example.com",
};

const NON_DEV_USER = {
  id: "non-dev-user-uuid",
  email: "notadev@example.com",
};

const DEV_CONNECTION = {
  refreshToken: "real-refresh",
  customerId: "111-111-1111",
  customerIds: [{ id: "111-111-1111", name: "Dev Account" }],
  loginCustomerId: null,
  googleEmail: "dev@example.com",
};

const TARGET_MCP_ROW = {
  userId: "target-user-uuid",
  googleEmail: "user@example.com",
  customerId: "222-222-2222",
};

const TARGET_CONNECTION = {
  refreshToken: "target-refresh",
  customerId: "222-222-2222",
  customerIds: [{ id: "222-222-2222", name: "Ucuz Taxi" }],
  loginCustomerId: null,
  googleEmail: "user@example.com",
};

// ─── Import after mocks ─────────────────────────────────────────────

import { getSession, getSessionAuth, getAuthContext } from "@/lib/session";

describe("Session impersonation (Supabase path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies._clear();
    mockGetUser.mockReturnValue(null);
    mockLoadGoogleConnection.mockResolvedValue(null);
    mockSelectChain.mockResolvedValue([]);
  });

  it("returns normal session when no impersonate cookie", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockLoadGoogleConnection.mockResolvedValueOnce(DEV_CONNECTION);
    // legacyTokenRow (none) + meta connection (none)
    mockSelectChain.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    expect(session.customerId).toBe("111-111-1111");
    expect(session.isDev).toBe(true);
    expect(session.impersonating).toBeUndefined();
  });

  it("returns impersonated session when dev has impersonate cookie", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockCookies._set("adsagent_impersonate", "42");
    // First select: target mcp_sessions row (for userId+email translation).
    // Then: loadGoogleConnection for the target. Then: legacyTokenRow + meta.
    mockSelectChain
      .mockResolvedValueOnce([TARGET_MCP_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockLoadGoogleConnection.mockResolvedValueOnce(TARGET_CONNECTION);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    expect(session.customerId).toBe("222-222-2222");
    expect(session.googleEmail).toBe("user@example.com");
    expect(session.impersonating).toBe(true);
  });

  it("derives isDev from real email, not impersonated email", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockCookies._set("adsagent_impersonate", "42");
    mockSelectChain
      .mockResolvedValueOnce([TARGET_MCP_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockLoadGoogleConnection.mockResolvedValueOnce(TARGET_CONNECTION);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    // isDev should be true because real user (dev@example.com) is in DEV_EMAILS
    // even though impersonated user (user@example.com) is not
    expect(session.isDev).toBe(true);
  });

  it("ignores impersonate cookie when real user is NOT a dev", async () => {
    mockGetUser.mockReturnValue(NON_DEV_USER);
    mockCookies._set("adsagent_impersonate", "42");
    mockLoadGoogleConnection.mockResolvedValueOnce({
      ...DEV_CONNECTION,
      googleEmail: NON_DEV_USER.email,
    });
    mockSelectChain.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    // Should return the real session, not impersonated
    expect(session.customerId).toBe("111-111-1111");
    expect(session.impersonating).toBeUndefined();
  });

  it("hard-fails when impersonated session is expired/missing", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockCookies._set("adsagent_impersonate", "42");
    // Target session not found
    mockSelectChain.mockResolvedValueOnce([]);

    const session = await getSession();

    // Hard-fail: returns disconnected to prevent accidental writes to real account
    expect(session.connected).toBe(false);
  });

  it("falls back to real session when impersonate cookie has malformed value", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockCookies._set("adsagent_impersonate", "not-a-number");
    mockLoadGoogleConnection.mockResolvedValueOnce(DEV_CONNECTION);
    mockSelectChain.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    expect(session.customerId).toBe("111-111-1111");
    expect(session.impersonating).toBeUndefined();
  });

  it("getSessionAuth throws when impersonated session missing", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockCookies._set("adsagent_impersonate", "42");
    mockSelectChain.mockResolvedValueOnce([]);

    await expect(getSessionAuth()).rejects.toThrow("Not authenticated");
  });

  it("getAuthContext includes realGoogleEmail when impersonating", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockCookies._set("adsagent_impersonate", "42");
    mockSelectChain
      .mockResolvedValueOnce([TARGET_MCP_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockLoadGoogleConnection.mockResolvedValueOnce(TARGET_CONNECTION);

    const { auth, session } = await getAuthContext();

    expect(auth.customerId).toBe("222-222-2222");
    expect(auth.refreshToken).toBe("target-refresh");
    expect(auth.realGoogleEmail).toBe("dev@example.com");
    expect(session.googleEmail).toBe("user@example.com");
  });

  it("getAuthContext does NOT include realGoogleEmail when not impersonating", async () => {
    mockGetUser.mockReturnValue(DEV_USER);
    mockLoadGoogleConnection.mockResolvedValueOnce(DEV_CONNECTION);
    mockSelectChain.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { auth } = await getAuthContext();

    expect(auth.customerId).toBe("111-111-1111");
    expect(auth.realGoogleEmail).toBeUndefined();
  });
});
