import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSignInWithIdToken,
  mockInsertValues,
  mockListAccessibleCustomers,
  mockSelectRows,
  mockUpdateWhere,
} = vi.hoisted(() => ({
  mockSignInWithIdToken: vi.fn(),
  mockInsertValues: vi.fn(),
  mockListAccessibleCustomers: vi.fn(),
  mockSelectRows: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithIdToken: mockSignInWithIdToken,
    },
  })),
}));

vi.mock("@/lib/google-ads", () => ({
  deriveCustomerName: vi.fn((raw: string | null | undefined) => {
    if (!raw) return "Google Ads Account";
    try {
      const parsed = JSON.parse(raw) as Array<{ id: string; name?: string }>;
      return parsed.map((item) => item.name || item.id).join(", ");
    } catch {
      return "Google Ads Account";
    }
  }),
  listAccessibleCustomers: mockListAccessibleCustomers,
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
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
      values: (...args: unknown[]) => mockInsertValues(...args),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: (...args: unknown[]) => mockUpdateWhere(...args),
      })),
    })),
  }),
  schema: {
    mcpSessions: {
      id: "id",
      userId: "user_id",
      googleEmail: "google_email",
      expiresAt: "expires_at",
      createdAt: "created_at",
      customerId: "customer_id",
      customerIds: "customer_ids",
      accessToken: "access_token",
    },
  },
}));

import { GET } from "@/app/auth/callback/route";

function makeRequest(url: string): Request {
  return new Request(url);
}

describe("Auth callback route — GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_ADS_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "client-secret";

    mockSelectRows.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { id: "user-123", email: "user@example.com" }, session: null },
      error: null,
    });
    mockListAccessibleCustomers.mockResolvedValue([
      {
        id: "1234567890",
        name: "Test Account",
        isManager: false,
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "google-access-token",
          refresh_token: "google-refresh-token",
          id_token: "google-id-token",
        }),
      }),
    );
  });

  it("redirects to /login?error=auth_failed when no code param", async () => {
    const response = await GET(makeRequest("http://localhost:3000/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=auth_failed");
  });

  it("redirects to /login?error=auth_failed when Google token exchange fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "invalid_grant",
        }),
      }),
    );

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=invalid"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=auth_failed");
  });

  it("redirects to the requested next path after successful connect", async () => {
    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code&next=/tools"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/tools");
    expect(mockInsertValues).toHaveBeenCalled();
    expect(mockListAccessibleCustomers).toHaveBeenCalledWith("google-refresh-token");
  });

  it("redirects to /campaigns by default after successful connect", async () => {
    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    const location = response.headers.get("location") ?? "";
    expect(location).toMatch(/\/campaigns$/);
  });

  it("redirects to account selection when multiple accounts are available", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "1234567890", name: "Account 1", isManager: false },
      { id: "0987654321", name: "Account 2", isManager: false },
    ]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connect?pending=");
  });

  it("reuses an existing connected session for the same user", async () => {
    mockSelectRows.mockResolvedValue([
      {
        id: 7,
        accessToken: "existing-token",
        customerId: "1234567890",
        customerIds: '[{"id":"1234567890","name":"Existing Account"}]',
      },
    ]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code&next=/tools"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/tools");
    expect(mockUpdateWhere).toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockListAccessibleCustomers).not.toHaveBeenCalled();
    expect(response.cookies.get("adsagent_token")?.value).toBe("existing-token");
  });
});
