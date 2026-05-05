import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCookieGet,
  mockSelectQueues,
  mockStoreOAuthNonce,
  mockIsMetaWaitlistWallEnabled,
} = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockSelectQueues: [] as unknown[][],
  mockStoreOAuthNonce: vi.fn(async (nonce: string) => {
    void nonce;
  }),
  mockIsMetaWaitlistWallEnabled: vi.fn(async () => true),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: vi.fn((...args: unknown[]) => ({ op: "eq", args })),
  gte: vi.fn((...args: unknown[]) => ({ op: "gte", args })),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectQueues.shift() ?? []),
        })),
      })),
    })),
  }),
  schema: {
    mcpSessions: {
      id: "mcp_sessions.id",
      userId: "mcp_sessions.user_id",
      accessToken: "mcp_sessions.access_token",
      expiresAt: "mcp_sessions.expires_at",
    },
    adPlatformConnections: {
      id: "ad_platform_connections.id",
      userId: "ad_platform_connections.user_id",
      platform: "ad_platform_connections.platform",
    },
  },
}));

vi.mock("@/lib/auth-cookies", () => ({
  COOKIE_NAMES: { token: "gads_token" },
}));

vi.mock("@/lib/oauth-nonce", () => ({
  storeOAuthNonce: (nonce: string) => mockStoreOAuthNonce(nonce),
}));

vi.mock("@/lib/app-url", () => ({
  getAppOrigin: () => "https://notfair.test",
}));

vi.mock("@/lib/meta-ads/oauth", () => ({
  buildMetaAuthorizeUrl: ({ state, redirectUri }: { state: string; redirectUri: string }) =>
    `https://facebook.test/dialog/oauth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
}));

vi.mock("@/lib/meta-waitlist", () => ({
  isMetaWaitlistWallEnabled: () => mockIsMetaWaitlistWallEnabled(),
}));

describe("Meta OAuth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectQueues.length = 0;
    mockCookieGet.mockReturnValue({ value: "session-token" });
    mockIsMetaWaitlistWallEnabled.mockResolvedValue(true);
  });

  it("blocks unconnected users at the server-side waitlist gate", async () => {
    mockSelectQueues.push(
      [{ id: 1, userId: "user_1" }],
      [],
    );

    const { GET } = await import("@/app/api/oauth/meta/start/route");
    const res = await GET(new Request("https://notfair.test/api/oauth/meta/start?next=/connect/meta-ads"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://notfair.test/manage-ads-accounts/meta-ads");
    expect(mockStoreOAuthNonce).not.toHaveBeenCalled();
  });

  it("allows existing Meta connections to reauthorize even while the wall is enabled", async () => {
    mockSelectQueues.push(
      [{ id: 1, userId: "user_1" }],
      [{ id: 7 }],
    );

    const { GET } = await import("@/app/api/oauth/meta/start/route");
    const res = await GET(new Request("https://notfair.test/api/oauth/meta/start?next=/manage-ads-accounts/meta-ads"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("https://facebook.test/dialog/oauth");
    expect(location).toContain("redirect_uri=https%3A%2F%2Fnotfair.test%2Fapi%2Foauth%2Fmeta%2Fcallback");
    expect(mockStoreOAuthNonce).toHaveBeenCalledTimes(1);
  });

  it("allows approved or dev-unblocked new users through when the wall helper returns false", async () => {
    mockIsMetaWaitlistWallEnabled.mockResolvedValue(false);
    mockSelectQueues.push(
      [{ id: 1, userId: "user_1" }],
      [],
    );

    const { GET } = await import("@/app/api/oauth/meta/start/route");
    const res = await GET(new Request("https://notfair.test/api/oauth/meta/start"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("https://facebook.test/dialog/oauth");
    expect(mockStoreOAuthNonce).toHaveBeenCalledTimes(1);
  });
});
