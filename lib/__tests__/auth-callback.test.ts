import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSignInWithIdToken,
  mockInsertValues,
  mockListConnectableAccounts,
  mockSelectRows,
  mockUpdateWhere,
  mockCookieGet,
  mockCookieGetAll,
  mockVerifyOAuthNonce,
} = vi.hoisted(() => ({
  mockSignInWithIdToken: vi.fn(),
  mockInsertValues: vi.fn(),
  mockListConnectableAccounts: vi.fn(),
  mockSelectRows: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockCookieGet: vi.fn(),
  mockCookieGetAll: vi.fn(),
  mockVerifyOAuthNonce: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    getAll: mockCookieGetAll,
  })),
}));

// `after()` only works inside a real Next.js request scope. Stub it so the
// post-response snapshot + analytics work doesn't throw in unit tests.
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
  listConnectableAccounts: mockListConnectableAccounts,
  syncAccountSnapshots: vi.fn(async () => {}),
  parseCustomerIds: vi.fn((raw: string | null | undefined) => {
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Array<{ id: string; name: string }>;
    } catch {
      return [];
    }
  }),
}));

vi.mock("@/lib/oauth-nonce", () => ({
  verifyOAuthNonce: (...args: unknown[]) => mockVerifyOAuthNonce(...args),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
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

// Helper: encode a valid state param with a nonce + payload
const NONCE = "test-nonce-abc123";
function encodeState(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({ nonce: NONCE, next: "/campaigns", popup: false, ...overrides })).toString("base64url");
}

function makeRequest(url: string): Request {
  return new Request(url);
}

describe("Auth callback route — GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_ADS_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "client-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    // By default, server-side nonce fallback is disabled
    mockVerifyOAuthNonce.mockResolvedValue(false);
    mockSelectRows.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
    // By default, the oauth_nonce cookie matches our test nonce
    mockCookieGet.mockImplementation((name: string) => {
      if (name === "oauth_nonce") return { value: NONCE };
      return undefined;
    });
    mockCookieGetAll.mockReturnValue([]);
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { id: "user-123", email: "user@example.com" }, session: null },
      error: null,
    });
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [{ id: "1234567890", name: "Test Account" }],
      managers: [],
    });

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

  it("redirects to /login?error=auth_failed when state nonce doesn't match cookie", async () => {
    // Cookie has a different nonce than the state param
    mockCookieGet.mockImplementation((name: string) => {
      if (name === "oauth_nonce") return { value: "wrong-nonce" };
      return undefined;
    });

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=auth_failed");
  });

  it("redirects to /login?error=auth_failed when no oauth_nonce cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=auth_failed");
  });

  it("succeeds via server-side nonce when cookie is missing", async () => {
    mockCookieGet.mockReturnValue(undefined);
    mockVerifyOAuthNonce.mockResolvedValue(true);

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    const location = response.headers.get("location") ?? "";
    expect(location).toMatch(/\/campaigns$/);
    expect(mockVerifyOAuthNonce).toHaveBeenCalledWith(NONCE);
  });

  it("redirects to /login?error=auth_failed when no code param", async () => {
    const state = encodeState();
    const response = await GET(makeRequest(`http://localhost:3000/auth/callback?state=${state}`));

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

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=invalid&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=auth_failed");
  });

  it("redirects to the requested next path after successful connect", async () => {
    const state = encodeState({ next: "/tools" });
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/tools");
    expect(mockInsertValues).toHaveBeenCalled();
    expect(mockListConnectableAccounts).toHaveBeenCalledWith("google-refresh-token");
  });

  it("redirects to /campaigns by default after successful connect", async () => {
    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    const location = response.headers.get("location") ?? "";
    expect(location).toMatch(/\/campaigns$/);
  });

  it("redirects to account selection when multiple accounts are available", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [
        { id: "1234567890", name: "Account 1" },
        { id: "0987654321", name: "Account 2" },
      ],
      managers: [],
    });

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connect?pending=");
  });

  it("persists loginCustomerId on the session for a single manager-routed client", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [
        {
          id: "5555555555",
          name: "Client A",
          loginCustomerId: "9999999999",
          loginCustomerName: "Acme MCC",
        },
      ],
      managers: [{ id: "9999999999", name: "Acme MCC" }],
    });

    const state = encodeState();
    await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(mockInsertValues).toHaveBeenCalled();
    const insertedRow = mockInsertValues.mock.calls[0][0];
    expect(insertedRow.customerId).toBe("5555555555");
    expect(insertedRow.loginCustomerId).toBe("9999999999");
  });

  it("stores pre-validated accounts (with loginCustomerId) on the pending session for multi-account flow", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [
        { id: "1111111111", name: "Direct Account" },
        {
          id: "2222222222",
          name: "Client B",
          loginCustomerId: "9999999999",
          loginCustomerName: "Acme MCC",
        },
      ],
      managers: [{ id: "9999999999", name: "Acme MCC" }],
    });

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.headers.get("location")).toContain("/connect?pending=");
    expect(mockInsertValues).toHaveBeenCalled();
    const insertedRow = mockInsertValues.mock.calls[0][0];
    expect(insertedRow.customerId).toBe("");
    expect(insertedRow.customerIds).toBeTruthy();
    const stored = JSON.parse(insertedRow.customerIds);
    // Both entries carry an explicit loginCustomerId — null for direct, manager
    // id for manager-routed. authForAccount relies on the field being present
    // (not just truthy) to distinguish direct from legacy fallback.
    expect(stored).toEqual([
      { id: "1111111111", name: "Direct Account", loginCustomerId: null },
      { id: "2222222222", name: "Client B", loginCustomerId: "9999999999" },
    ]);

    const decoded = decodeURIComponent(response.headers.get("location") ?? "");
    expect(decoded).toContain('"loginCustomerName":"Acme MCC"');
  });

  it("returns NO_CLIENT_ACCOUNTS error when only managers exist with no clients", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [],
      managers: [{ id: "9999999999", name: "Acme MCC" }],
    });

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("No%20client%20accounts%20found");
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

    const state = encodeState({ next: "/tools" });
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/tools");
    expect(mockUpdateWhere).toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockListConnectableAccounts).not.toHaveBeenCalled();
    expect(response.cookies.get("adsagent_token")?.value).toBe("existing-token");
  });
});
