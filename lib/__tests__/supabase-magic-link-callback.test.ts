import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExchangeCodeForSession,
  mockGetUser,
  mockInsertValues,
  mockSelectRows,
} = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockInsertValues: vi.fn(),
  mockSelectRows: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(() => {}),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getUser: mockGetUser,
      updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

vi.mock("@/lib/db", () => {
  const dbObj = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectRows()),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: (...args: unknown[]) => {
        mockInsertValues(...args);
        const thenable = Promise.resolve(undefined) as Promise<undefined> & {
          onConflictDoUpdate: (set: unknown) => Promise<undefined>;
        };
        thenable.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
        return thenable;
      },
    })),
  };

  return {
    db: () => dbObj,
    schema: {
      mcpSessions: { id: "id", userId: "user_id" },
      adPlatformConnections: { id: "id", userId: "user_id", platform: "platform" },
      userAttribution: {
        userId: "user_id",
        email: "email",
        signupMethod: "signup_method",
        source: "source",
        medium: "medium",
        campaign: "campaign",
        term: "term",
        content: "content",
        gclid: "gclid",
        fbclid: "fbclid",
        rdtCid: "rdt_cid",
        twclid: "twclid",
        firstLandingUrl: "first_landing_url",
        firstLandingPath: "first_landing_path",
        signupReferrer: "signup_referrer",
        signupReferrerDomain: "signup_referrer_domain",
        attributionCapturedAt: "attribution_captured_at",
        attributionSource: "attribution_source",
        attributionVersion: "attribution_version",
        rawAttribution: "raw_attribution",
        paidSource: "paid_source",
        paidMedium: "paid_medium",
        paidCampaign: "paid_campaign",
        paidTerm: "paid_term",
        paidContent: "paid_content",
        paidGclid: "paid_gclid",
        paidFbclid: "paid_fbclid",
        paidRdtCid: "paid_rdt_cid",
        paidTwclid: "paid_twclid",
        paidLandingUrl: "paid_landing_url",
        paidLandingPath: "paid_landing_path",
        paidCapturedAt: "paid_captured_at",
        latestPaidTouch: "latest_paid_touch",
        updatedAt: "updated_at",
      },
    },
  };
});

vi.mock("@/lib/x-signup", () => ({
  X_SIGNUP_ID_COOKIE: "x_signup_id",
  buildXSignupConversionId: vi.fn((userId: string) => `signup-${userId}`),
}));

import { GET } from "@/app/auth/supabase/callback/route";

function makeRequest(url: string): Request {
  return new Request(url);
}

describe("Supabase magic-link callback route - GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-123",
          email: "writer@example.com",
          user_metadata: { full_name: "Test Writer", avatar_url: "https://example.com/avatar.png" },
        },
      },
      error: null,
    });
    mockSelectRows.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("exchanges the Supabase code and redirects to next without touching mcp_sessions", async () => {
    const response = await GET(
      makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code&next=%2Fconnect%2Fmeta-ads"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/connect/meta-ads");
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("supabase-code");
    // No mcp_sessions row, no adsagent_token — identity is carried by Supabase sb-* cookies.
    expect(mockInsertValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: expect.anything() }),
    );
    expect(response.cookies.get("adsagent_token")?.value).toBeUndefined();
    expect(response.cookies.get("adsagent_profile")?.value).toContain("Test%20Writer");
  });

  it("fires the X signup cookie for first-time users", async () => {
    // No prior mcp_sessions OR ad_platform_connections rows for this user.
    mockSelectRows.mockResolvedValue([]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code"),
    );

    expect(response.cookies.get("x_signup_id")?.value).toBe("signup-user-123");
  });

  it("skips the X signup cookie for returning users", async () => {
    // hasAnySession returns true (existing row in mcp_sessions OR ad_platform_connections).
    mockSelectRows.mockResolvedValue([{ id: 1 }]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code"),
    );

    expect(response.cookies.get("x_signup_id")?.value).toBeUndefined();
  });

  it("redirects back to login when Supabase rejects the code", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: new Error("invalid auth code"),
    });

    const response = await GET(
      makeRequest("http://localhost:3000/auth/supabase/callback?code=bad-code"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth_failed&reason=supabase_auth",
    );
  });
});
