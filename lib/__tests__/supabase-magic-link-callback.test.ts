import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExchangeCodeForSession,
  mockGetUser,
  mockInsertValues,
  mockSelectRows,
  mockCookieGetAll,
} = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockInsertValues: vi.fn(),
  mockSelectRows: vi.fn(),
  mockCookieGetAll: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: mockCookieGetAll,
  })),
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
    },
  })),
}));

vi.mock("@/lib/db", () => {
  const dbObj = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectRows()),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => mockSelectRows()),
          })),
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
      mcpSessions: {
        accessToken: "access_token",
        refreshToken: "refresh_token",
        customerId: "customer_id",
        customerIds: "customer_ids",
        userId: "user_id",
        googleEmail: "google_email",
        expiresAt: "expires_at",
        createdAt: "created_at",
      },
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
        firstLandingUrl: "first_landing_url",
        firstLandingPath: "first_landing_path",
        signupReferrer: "signup_referrer",
        signupReferrerDomain: "signup_referrer_domain",
        attributionCapturedAt: "attribution_captured_at",
        attributionSource: "attribution_source",
        attributionVersion: "attribution_version",
        rawAttribution: "raw_attribution",
        updatedAt: "updated_at",
      },
    },
  };
});

vi.mock("@/lib/google-ads", () => ({
  deriveCustomerName: vi.fn((raw: string | null | undefined) => {
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Array<{ name?: string; id: string }>;
    return parsed.map((account) => account.name ?? account.id).join(", ");
  }),
}));

import { GET } from "@/app/auth/supabase/callback/route";

function makeRequest(url: string): Request {
  return new Request(url);
}

function findSessionInsert() {
  return mockInsertValues.mock.calls
    .map((call) => call[0] as Record<string, unknown>)
    .find((row) => Object.prototype.hasOwnProperty.call(row, "accessToken"));
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
    mockCookieGetAll.mockReturnValue([]);
  });

  it("exchanges the Supabase code and mints an email-only app session", async () => {
    const response = await GET(
      makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code&next=%2Fconnect%2Fmeta-ads"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/connect/meta-ads");
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("supabase-code");
    expect(findSessionInsert()).toBeDefined();

    const insertedRow = findSessionInsert() as Record<string, unknown>;
    expect(insertedRow).toMatchObject({
      refreshToken: "",
      customerId: "",
      customerIds: "[]",
      userId: "user-123",
      googleEmail: "writer@example.com",
    });
    expect(response.cookies.get("adsagent_token")?.value).toBe(insertedRow.accessToken);
    expect(response.cookies.get("adsagent_profile")?.value).toContain("Test%20Writer");
  });

  it("clears Supabase cookies after minting the app session", async () => {
    mockCookieGetAll.mockReturnValue([
      { name: "sb-project-auth-token" },
      { name: "unrelated" },
    ]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code"),
    );

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("");
    expect(response.cookies.get("unrelated")).toBeUndefined();
  });

  it("reuses an existing connected app session for the Supabase user", async () => {
    mockSelectRows.mockResolvedValue([
      {
        accessToken: "existing-connected-token",
        customerIds: '[{"id":"1234567890","name":"Existing Account"}]',
      },
    ]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code&next=%2Fcampaigns"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/campaigns");
    expect(findSessionInsert()).toBeUndefined();
    expect(response.cookies.get("adsagent_token")?.value).toBe("existing-connected-token");
    // Phase-2 header reclaim: setSessionCookies actively deletes the legacy
    // adsagent_customer cookie so existing browsers shed it. Verify the
    // delete fires (Max-Age=0).
    const customerDelete = response.cookies.get("adsagent_customer");
    expect(customerDelete?.maxAge).toBe(0);
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
    expect(findSessionInsert()).toBeUndefined();
  });

  describe("STOP_CREATING_MCP_SESSIONS flag", () => {
    beforeEach(() => {
      process.env.STOP_CREATING_MCP_SESSIONS = "true";
    });

    afterEach(() => {
      delete process.env.STOP_CREATING_MCP_SESSIONS;
    });

    it("skips the mcp_sessions INSERT, the adsagent_token cookie, and the sb-* clear for new users", async () => {
      mockCookieGetAll.mockReturnValue([{ name: "sb-project-auth-token" }]);

      const response = await GET(
        makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code"),
      );

      expect(findSessionInsert()).toBeUndefined();
      expect(response.cookies.get("adsagent_token")?.value).toBeUndefined();
      // sb-* cookies must persist — they're now the session.
      expect(response.cookies.get("sb-project-auth-token")).toBeUndefined();
    });

    it("still reissues the legacy cookie for users with an existing mcp_sessions row", async () => {
      mockSelectRows.mockResolvedValue([
        {
          accessToken: "existing-connected-token",
          customerIds: '[{"id":"1234567890","name":"Existing Account"}]',
        },
      ]);

      const response = await GET(
        makeRequest("http://localhost:3000/auth/supabase/callback?code=supabase-code"),
      );

      expect(findSessionInsert()).toBeUndefined();
      // Legacy users keep their adsagent_token rebound — this isn't new state.
      expect(response.cookies.get("adsagent_token")?.value).toBe("existing-connected-token");
    });
  });
});
