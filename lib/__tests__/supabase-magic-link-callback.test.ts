import { beforeEach, describe, expect, it, vi } from "vitest";

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
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => mockSelectRows()),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: (...args: unknown[]) => {
        mockInsertValues(...args);
        return Promise.resolve(undefined);
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
    expect(mockInsertValues).toHaveBeenCalledOnce();

    const insertedRow = mockInsertValues.mock.calls[0][0] as Record<string, unknown>;
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
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(response.cookies.get("adsagent_token")?.value).toBe("existing-connected-token");
    expect(response.cookies.get("adsagent_customer")?.value).toBe("Existing%20Account");
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
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});
