/**
 * Tests for app/api/auth/google/callback/route.ts
 *
 * Focuses on the manager account (MCC) code paths added in the loginCustomerId
 * feature — specifically:
 *   - listClientAccountsUnderManager is called when no direct accounts exist
 *   - loginCustomerId is stored in the pending/confirmed session
 *   - the cap of 10 managers is respected
 *   - partial manager failures are handled gracefully
 *   - loginCustomerId is NOT exposed in the redirect URL
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListAccessibleCustomers,
  mockListClientAccountsUnderManager,
  mockInsertValues,
  mockSelectSessions,
} = vi.hoisted(() => ({
  mockListAccessibleCustomers: vi.fn(),
  mockListClientAccountsUnderManager: vi.fn(),
  mockInsertValues: vi.fn(),
  mockSelectSessions: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/google-ads", () => ({
  listAccessibleCustomers: mockListAccessibleCustomers,
  listClientAccountsUnderManager: mockListClientAccountsUnderManager,
  getUsableAccounts: <T extends { isManager: boolean }>(
    customers: Array<T | { error: string }>,
  ) => customers.filter((c): c is T => !("error" in c) && !c.isManager),
  hasManagerAccount: <T extends { isManager: boolean }>(
    customers: Array<T | { error: string }>,
  ) => customers.some((c) => !("error" in c) && c.isManager),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectSessions()),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: (...args: unknown[]) => mockInsertValues(...args),
    })),
  }),
  schema: {
    mcpSessions: {
      id: "id",
      userId: "user_id",
      googleEmail: "google_email",
      expiresAt: "expires_at",
      customerId: "customer_id",
      customerIds: "customer_ids",
      accessToken: "access_token",
      loginCustomerId: "login_customer_id",
    },
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
  })),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

import { GET } from "@/app/api/auth/google/callback/route";

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/auth/google/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

const GOOD_TOKEN_RESPONSE = {
  ok: true,
  json: async () => ({
    access_token: "goog-access",
    refresh_token: "goog-refresh",
    scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email",
  }),
};

const USERINFO_RESPONSE = {
  ok: true,
  json: async () => ({ email: "user@example.com" }),
};

function mockFetch(...responses: { ok: boolean; json: () => Promise<unknown> }[]) {
  let callIndex = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    const res = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return res;
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Google OAuth callback route — GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.GOOGLE_ADS_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "client-secret";

    mockInsertValues.mockResolvedValue(undefined);
    mockSelectSessions.mockResolvedValue([]);
    mockFetch(GOOD_TOKEN_RESPONSE, USERINFO_RESPONSE);
  });

  // ─── Error cases ────────────────────────────────────────────────────────────

  it("redirects with error when no code param", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=");
  });

  it("redirects with error when Google token exchange fails", async () => {
    mockFetch({ ok: false, json: async () => ({ error: "invalid_grant" }) });
    const response = await GET(makeRequest({ code: "bad-code" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=");
  });

  it("redirects with error when no usable accounts found and no manager accounts", async () => {
    mockListAccessibleCustomers.mockResolvedValue([]);
    const response = await GET(makeRequest({ code: "valid-code" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=");
  });

  // ─── Direct account (non-MCC) flows ─────────────────────────────────────────

  it("creates a session and redirects to /connect for a single direct account", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "1234567890", name: "Direct Account", isManager: false },
    ]);

    const response = await GET(makeRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connect");
    expect(mockListClientAccountsUnderManager).not.toHaveBeenCalled();

    // Session stored without loginCustomerId (direct account)
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.customerId).toBe("1234567890");
    expect(insertCall.loginCustomerId).toBeNull();
  });

  it("creates a pending session and redirects to account selection for multiple direct accounts", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "1111111111", name: "Account One", isManager: false },
      { id: "2222222222", name: "Account Two", isManager: false },
    ]);

    const response = await GET(makeRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/connect?pending=");
    expect(location).toContain("accounts=");

    // loginCustomerId must NOT appear in the redirect URL
    expect(location).not.toContain("loginCustomerId");
    expect(location).not.toContain("login_customer_id");
  });

  // ─── Manager account (MCC) flows ─────────────────────────────────────────────

  it("fetches client accounts from manager when no direct accounts exist", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "9999999999", name: "My MCC", isManager: true },
    ]);
    mockListClientAccountsUnderManager.mockResolvedValue([
      { id: "1111111111", name: "Client A" },
    ]);

    const response = await GET(makeRequest({ code: "valid-code" }));

    expect(mockListClientAccountsUnderManager).toHaveBeenCalledWith(
      "goog-refresh",
      "9999999999",
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connect");

    // Single client account → direct session creation with loginCustomerId
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.customerId).toBe("1111111111");
    expect(insertCall.loginCustomerId).toBe("9999999999");
  });

  it("stores all client accounts in pending session when manager has multiple clients", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "9999999999", name: "My MCC", isManager: true },
    ]);
    mockListClientAccountsUnderManager.mockResolvedValue([
      { id: "1111111111", name: "Client A" },
      { id: "2222222222", name: "Client B" },
    ]);

    const response = await GET(makeRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/connect?pending=");

    // Pending session stored with loginCustomerId in customerIds JSON
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.customerId).toBe(""); // pending
    const stored = JSON.parse(insertCall.customerIds);
    expect(stored).toHaveLength(2);
    expect(stored[0].loginCustomerId).toBe("9999999999");
    expect(stored[1].loginCustomerId).toBe("9999999999");

    // loginCustomerId must NOT appear in the redirect URL (stripped from accountsParam)
    expect(location).not.toContain("loginCustomerId");
  });

  it("returns an error when manager account has no client accounts", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "9999999999", name: "Empty MCC", isManager: true },
    ]);
    mockListClientAccountsUnderManager.mockResolvedValue([]);

    const response = await GET(makeRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=");
  });

  it("continues with successful managers when one manager query fails (partial failure)", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "9999999999", name: "Good MCC", isManager: true },
      { id: "8888888888", name: "Bad MCC", isManager: true },
    ]);
    mockListClientAccountsUnderManager.mockImplementation(
      async (_refreshToken: string, managerId: string) => {
        if (managerId === "8888888888") throw new Error("quota exceeded");
        return [{ id: "1111111111", name: "Client A" }];
      },
    );

    const response = await GET(makeRequest({ code: "valid-code" }));

    // Should succeed using the one account from the good manager
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connect");
    expect(mockListClientAccountsUnderManager).toHaveBeenCalledTimes(2);
  });

  it("caps manager queries at 10 even when more than 10 manager accounts exist", async () => {
    const managers = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1).padStart(10, "9"),
      name: `MCC ${i}`,
      isManager: true,
    }));
    mockListAccessibleCustomers.mockResolvedValue(managers);
    mockListClientAccountsUnderManager.mockResolvedValue([
      { id: "1111111111", name: "Client A" },
    ]);

    await GET(makeRequest({ code: "valid-code" }));

    expect(mockListClientAccountsUnderManager).toHaveBeenCalledTimes(10);
  });

  it("prefers direct accounts over manager accounts when both exist", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "1234567890", name: "Direct Account", isManager: false },
      { id: "9999999999", name: "My MCC", isManager: true },
    ]);

    const response = await GET(makeRequest({ code: "valid-code" }));

    // Direct account wins — listClientAccountsUnderManager should never be called
    expect(mockListClientAccountsUnderManager).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
  });

  // ─── Popup flow ──────────────────────────────────────────────────────────────

  it("returns HTML account selection page in popup flow with multiple MCC clients", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "9999999999", name: "My MCC", isManager: true },
    ]);
    mockListClientAccountsUnderManager.mockResolvedValue([
      { id: "1111111111", name: "Client A" },
      { id: "2222222222", name: "Client B" },
    ]);

    const response = await GET(makeRequest({ code: "valid-code", state: "popup" }));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Select accounts");
    expect(html).toContain("1111111111");
    expect(html).toContain("2222222222");
    // loginCustomerId must NOT appear in the HTML sent to the client
    expect(html).not.toContain("loginCustomerId");
  });
});
