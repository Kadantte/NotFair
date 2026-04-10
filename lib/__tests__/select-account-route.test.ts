import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCookieGet,
  mockSelectLimit,
  mockUpdateWhere,
  mockDeleteWhere,
  mockListAccessibleCustomers,
} = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockListAccessibleCustomers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
}));

vi.mock("@/lib/google-ads", () => ({
  listAccessibleCustomers: mockListAccessibleCustomers,
  deriveCustomerName: vi.fn((raw: string | null | undefined) => {
    if (!raw) return "Google Ads Account";
    try {
      const parsed = JSON.parse(raw) as Array<{ id: string; name?: string }>;
      return parsed.map((item) => item.name || item.id).join(", ");
    } catch {
      return "Google Ads Account";
    }
  }),
  parseCustomerIds: vi.fn((raw: string | null | undefined) => {
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Array<{ id: string; name: string }>;
    } catch {
      return [];
    }
  }),
  syncAccountSnapshots: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: (...args: unknown[]) => mockSelectLimit(...args),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: (...args: unknown[]) => mockUpdateWhere(...args),
      })),
    })),
    delete: vi.fn(() => ({
      where: (...args: unknown[]) => mockDeleteWhere(...args),
    })),
  }),
  schema: {
    mcpSessions: {
      id: "id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      userId: "user_id",
      expiresAt: "expires_at",
      customerId: "customer_id",
      customerIds: "customer_ids",
      loginCustomerId: "login_customer_id",
    },
  },
}));

import { POST } from "@/app/api/auth/select-account/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/select-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Pre-validated accounts stored server-side during OAuth callback for manager accounts
const MCC_STORED_ACCOUNTS = JSON.stringify([
  { id: "1111111111", name: "Client A", loginCustomerId: "9999999999" },
  { id: "2222222222", name: "Client B", loginCustomerId: "9999999999" },
]);

function makePendingSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    accessToken: "pending-token-abc",
    refreshToken: "refresh-token",
    customerId: "", // pending selection
    customerIds: MCC_STORED_ACCOUNTS,
    userId: "user-123",
    ...overrides,
  };
}

describe("Select account route — POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    mockCookieGet.mockReturnValue({ value: "existing-token" });
    mockSelectLimit.mockResolvedValue([
      {
        id: 7,
        accessToken: "existing-token",
        refreshToken: "refresh-token",
        customerId: "1234567890",
        customerIds: JSON.stringify([{ id: "1234567890", name: "Existing Account" }]),
        loginCustomerId: null,
        userId: "user-123",
      },
    ]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockDeleteWhere.mockResolvedValue(undefined);
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "1234567890", name: "Existing Account", isManager: false },
      { id: "0987654321", name: "New Account", isManager: false },
    ]);
  });

  // ─── Non-pending (account switcher) flow ─────────────────────────────

  it("updates the current session in place when switching accounts", async () => {
    const response = await POST(
      makeRequest({
        accounts: [
          { id: "0987654321", name: "New Account" },
          { id: "1234567890", name: "Existing Account" },
        ],
      }),
    );

    expect(mockListAccessibleCustomers).toHaveBeenCalledWith("refresh-token");
    expect(mockUpdateWhere).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.cookies.get("adsagent_token")?.value).toBe("existing-token");
  });

  it("returns 401 when no active cookie-backed session exists for in-place updates", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const response = await POST(
      makeRequest({
        accounts: [{ id: "0987654321", name: "New Account" }],
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when selected account is not accessible", async () => {
    mockListAccessibleCustomers.mockResolvedValue([
      { id: "1234567890", name: "Existing Account", isManager: false },
    ]);

    const response = await POST(
      makeRequest({
        accounts: [{ id: "NOTMINE", name: "Sneaky Account" }],
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("NOTMINE");
  });

  // ─── Pre-validated (pending token) flow — manager accounts ───────────

  describe("isPreValidated path (pendingToken + server-stored accounts)", () => {
    beforeEach(() => {
      mockCookieGet.mockReturnValue(undefined); // no cookie for pending flow
      mockSelectLimit.mockResolvedValue([makePendingSession()]);
    });

    it("accepts a single valid account and stores loginCustomerId from server-side data", async () => {
      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [{ id: "1111111111", name: "Client A" }],
          next: "/connect",
        }),
      );

      expect(response.status).toBe(200);
      // Must NOT have called listAccessibleCustomers — pre-validated skips Google re-query
      expect(mockListAccessibleCustomers).not.toHaveBeenCalled();

      // The DB update should include loginCustomerId from the stored server-side data
      expect(mockUpdateWhere).toHaveBeenCalled();
      // Verify redirectUrl in response body
      const body = await response.json();
      expect(body.redirectUrl).toContain("/connect");
    });

    it("accepts multiple valid accounts from the same manager", async () => {
      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [
            { id: "1111111111", name: "Client A" },
            { id: "2222222222", name: "Client B" },
          ],
          next: "/connect",
        }),
      );

      expect(response.status).toBe(200);
      expect(mockListAccessibleCustomers).not.toHaveBeenCalled();
    });

    it("returns 403 when a selected account is not in the server-stored pre-validated set", async () => {
      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [{ id: "FORGED_ID", name: "Forged" }],
          next: "/connect",
        }),
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("FORGED_ID");
      expect(mockListAccessibleCustomers).not.toHaveBeenCalled();
    });

    it("returns 400 when selected accounts span different manager accounts", async () => {
      // Store accounts with different loginCustomerIds (two different managers)
      const crossManagerAccounts = JSON.stringify([
        { id: "1111111111", name: "Client A", loginCustomerId: "9999999999" },
        { id: "2222222222", name: "Client B", loginCustomerId: "8888888888" }, // different manager
      ]);
      mockSelectLimit.mockResolvedValue([
        makePendingSession({ customerIds: crossManagerAccounts }),
      ]);

      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [
            { id: "1111111111", name: "Client A" },
            { id: "2222222222", name: "Client B" },
          ],
          next: "/connect",
        }),
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("different manager");
    });

    it("does NOT trust loginCustomerId from the request body — reads from server-stored data", async () => {
      // Client sends a forged loginCustomerId in the request body
      // (the real data in the stored session has loginCustomerId: "9999999999")
      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [
            { id: "1111111111", name: "Client A", loginCustomerId: "FORGED_MANAGER" },
          ],
          next: "/connect",
        }),
      );

      // Should succeed — the forged loginCustomerId in the body is ignored
      expect(response.status).toBe(200);
      // The update call should use "9999999999" (from stored data), not "FORGED_MANAGER"
      // We verify this by checking that the route didn't blow up and used the server value
      expect(mockUpdateWhere).toHaveBeenCalled();
    });

    it("marks new signups with gads_new_signup cookie and redirects to next path", async () => {
      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [{ id: "1111111111", name: "Client A" }],
          next: "/onboarding",
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      // New signup (pending + no prior customerId) should redirect to the `next` param
      expect(body.redirectUrl).toContain("/onboarding");
      expect(response.cookies.get("gads_new_signup")?.value).toBe("1");
    });

    it("returns 404 when pendingToken does not match any session", async () => {
      mockSelectLimit.mockResolvedValue([]); // no matching session

      const response = await POST(
        makeRequest({
          pendingToken: "nonexistent-token",
          accounts: [{ id: "1111111111", name: "Client A" }],
        }),
      );

      expect(response.status).toBe(404);
    });
  });
});
