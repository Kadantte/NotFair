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

// ─── Tests ──────────────────────────────────────────────────────────

describe("Supabase-anchored session loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies._clear();
    mockGetUser.mockReturnValue(null);
    mockLoadGoogleConnection.mockResolvedValue(null);
    mockSelectChain.mockResolvedValue([]);
  });

  it("supabase user + connection — row sourced from the connection record", async () => {
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
      expect(session.customerId).toBe(CONNECTION_VIEW.customerId);
      expect(session.googleEmail).toBe(SUPABASE_USER.email);
      // Legacy token still surfaced for the direct-bearer setup display.
      expect(session.token).toBe(LEGACY_TOKEN_ROW.accessToken);
    }
    expect(mockLoadGoogleConnection).toHaveBeenCalled();
  });

  it("supabase user + NO connection — ads-less but connected", async () => {
    mockGetUser.mockReturnValue(SUPABASE_USER);
    mockLoadGoogleConnection.mockResolvedValueOnce(null);
    mockSelectChain
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (session.connected) {
      expect(session.pendingSetup).toBe(true);
      expect(session.userId).toBe(SUPABASE_USER.id);
      expect(session.token).toBe("");
    }
  });

  it("no supabase user — disconnected", async () => {
    mockGetUser.mockReturnValue(null);

    const session = await getSession();

    expect(session.connected).toBe(false);
  });

  it("Supabase path loads Meta accounts via the same user_id", async () => {
    mockGetUser.mockReturnValue(SUPABASE_USER);
    mockLoadGoogleConnection.mockResolvedValueOnce(CONNECTION_VIEW);
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
      expect(session.customerId).toBe(CONNECTION_VIEW.customerId);
      expect(session.metaAccounts).toEqual([
        { id: "act_meta_1", name: "Meta Acct 1" },
        { id: "act_meta_2", name: "Meta Acct 2" },
      ]);
      expect(session.activeMetaAccountId).toBe("act_meta_1");
    }
  });

  it("Supabase email beats stale connection.googleEmail", async () => {
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
