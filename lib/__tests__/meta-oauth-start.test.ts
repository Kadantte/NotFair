import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCookieGet,
  mockStoreOAuthNonce,
  mockSupabaseGetUser,
} = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockStoreOAuthNonce: vi.fn(async (nonce: string) => {
    void nonce;
  }),
  mockSupabaseGetUser: vi.fn(async (): Promise<{
    data: { user: { id: string; email: string } | null };
    error: null;
  }> => ({
    data: { user: { id: "user_1", email: "user@example.com" } },
    error: null,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockSupabaseGetUser },
  })),
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
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

describe("Meta OAuth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieGet.mockReturnValue({ value: "session-token" });
  });

  it("redirects signed-in users to Meta's OAuth dialog", async () => {
    const { GET } = await import("@/app/api/oauth/meta/start/route");
    const res = await GET(new Request("https://notfair.test/api/oauth/meta/start?next=/manage-ads-accounts/meta-ads"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("https://facebook.test/dialog/oauth");
    expect(location).toContain("redirect_uri=https%3A%2F%2Fnotfair.test%2Fapi%2Foauth%2Fmeta%2Fcallback");
    expect(mockStoreOAuthNonce).toHaveBeenCalledTimes(1);
  });

  it("redirects unauthenticated users to /api/auth/signin", async () => {
    mockSupabaseGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    mockCookieGet.mockReturnValue(undefined);

    const { GET } = await import("@/app/api/oauth/meta/start/route");
    const res = await GET(new Request("https://notfair.test/api/oauth/meta/start"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("/api/auth/signin");
    expect(mockStoreOAuthNonce).not.toHaveBeenCalled();
  });
});
