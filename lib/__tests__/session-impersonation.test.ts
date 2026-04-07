import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockCookies, mockSelectChain } = vi.hoisted(() => {
  const cookieStore = new Map<string, { value: string }>();
  return {
    mockCookies: {
      get: (name: string) => cookieStore.get(name),
      _set: (name: string, value: string) => cookieStore.set(name, { value }),
      _clear: () => cookieStore.clear(),
      _store: cookieStore,
    },
    mockSelectChain: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookies),
}));

// DB mock: returns different results based on the where clause call count
// First call = real session lookup, second call (if any) = impersonated session lookup
vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectChain()),
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
      userId: "user_id",
      googleEmail: "google_email",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  gte: vi.fn(),
  and: vi.fn(),
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
    token: "adsagent_token",
    customer: "adsagent_customer",
    impersonate: "adsagent_impersonate",
  },
}));

// ─── Test data ──────────────────────────────────────────────────────

const REAL_SESSION = {
  refreshToken: "real-refresh",
  customerId: "111-111-1111",
  customerIds: '[{"id":"111-111-1111","name":"Dev Account"}]',
  userId: "dev-user",
  googleEmail: "dev@example.com",
};

const TARGET_SESSION = {
  refreshToken: "target-refresh",
  customerId: "222-222-2222",
  customerIds: '[{"id":"222-222-2222","name":"Ucuz Taxi"}]',
  userId: "target-user",
  googleEmail: "user@example.com",
};

// ─── Import after mocks ─────────────────────────────────────────────

import { getSession, getSessionAuth, getAuthContext } from "@/lib/session";

describe("Session impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies._clear();
  });

  it("returns normal session when no impersonate cookie", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    expect(session.customerId).toBe("111-111-1111");
    expect(session.isDev).toBe(true);
    expect(session.impersonating).toBeUndefined();
  });

  it("returns impersonated session when dev has impersonate cookie", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockCookies._set("adsagent_impersonate", "42");
    // First call: real session lookup
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);
    // Second call: target session lookup
    mockSelectChain.mockResolvedValueOnce([TARGET_SESSION]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    expect(session.customerId).toBe("222-222-2222");
    expect(session.googleEmail).toBe("user@example.com");
    expect(session.impersonating).toBe(true);
  });

  it("derives isDev from real email, not impersonated email", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockCookies._set("adsagent_impersonate", "42");
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);
    mockSelectChain.mockResolvedValueOnce([TARGET_SESSION]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    // isDev should be true because real user (dev@example.com) is in DEV_EMAILS
    // even though impersonated user (user@example.com) is not
    expect(session.isDev).toBe(true);
  });

  it("ignores impersonate cookie when real user is NOT a dev", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockCookies._set("adsagent_impersonate", "42");
    const nonDevSession = { ...REAL_SESSION, googleEmail: "notadev@example.com" };
    mockSelectChain.mockResolvedValueOnce([nonDevSession]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    // Should return the real session, not impersonated
    expect(session.customerId).toBe("111-111-1111");
    expect(session.impersonating).toBeUndefined();
  });

  it("falls back to real session when impersonated session is expired/missing", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockCookies._set("adsagent_impersonate", "42");
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);
    // Target session not found
    mockSelectChain.mockResolvedValueOnce([]);

    const session = await getSession();

    // Graceful fallback: returns the dev's own session
    expect(session.connected).toBe(true);
    if (!session.connected) return;
    expect(session.customerId).toBe("111-111-1111");
    expect(session.impersonating).toBeUndefined();
  });

  it("falls back to real session when impersonate cookie has malformed value", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockCookies._set("adsagent_impersonate", "not-a-number");
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);

    const session = await getSession();

    expect(session.connected).toBe(true);
    if (!session.connected) return;
    expect(session.customerId).toBe("111-111-1111");
    expect(session.impersonating).toBeUndefined();
  });

  it("getSessionAuth returns real session when impersonated session missing", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockCookies._set("adsagent_impersonate", "42");
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);
    mockSelectChain.mockResolvedValueOnce([]);

    const row = await getSessionAuth();
    expect(row.customerId).toBe("111-111-1111");
  });

  it("getAuthContext includes realGoogleEmail when impersonating", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockCookies._set("adsagent_impersonate", "42");
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);
    mockSelectChain.mockResolvedValueOnce([TARGET_SESSION]);

    const { auth, session } = await getAuthContext();

    expect(auth.customerId).toBe("222-222-2222");
    expect(auth.refreshToken).toBe("target-refresh");
    expect(auth.realGoogleEmail).toBe("dev@example.com");
    expect(session.googleEmail).toBe("user@example.com");
  });

  it("getAuthContext does NOT include realGoogleEmail when not impersonating", async () => {
    mockCookies._set("adsagent_token", "real-token");
    mockSelectChain.mockResolvedValueOnce([REAL_SESSION]);

    const { auth } = await getAuthContext();

    expect(auth.customerId).toBe("111-111-1111");
    expect(auth.realGoogleEmail).toBeUndefined();
  });
});
