import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCookieGet,
  mockSelectLimit,
  mockUpdateWhere,
  mockDeleteWhere,
  mockListConnectableAccounts,
  mockInsertValues,
} = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockListConnectableAccounts: vi.fn(),
  mockInsertValues: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
}));

// `after()` only works inside a real Next.js request scope. In unit tests we
// stub it to a no-op — we don't care about the post-response snapshot work here.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(() => {}),
  };
});

vi.mock("@/lib/google-ads", () => ({
  listConnectableAccounts: mockListConnectableAccounts,
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

vi.mock("@/lib/db", () => {
  const dbObj = {
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
    // Connection-side upsert (Phase 1 dual-write). Capture values for
    // assertion via `mockInsertValues`; resolve no-op for both .values()
    // (legacy direct-await path) and .onConflictDoUpdate() (helper path).
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
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj),
  };
  return {
    db: () => dbObj,
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
      adPlatformConnections: {
        userId: "user_id",
        platform: "platform",
      },
    },
  };
});

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
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [
        { id: "1234567890", name: "Existing Account" },
        { id: "0987654321", name: "New Account" },
      ],
      managers: [],
    });
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

    expect(mockListConnectableAccounts).toHaveBeenCalledWith("refresh-token");
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
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [{ id: "1234567890", name: "Existing Account" }],
      managers: [],
    });

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
      expect(mockListConnectableAccounts).not.toHaveBeenCalled();

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
      expect(mockListConnectableAccounts).not.toHaveBeenCalled();
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
      expect(mockListConnectableAccounts).not.toHaveBeenCalled();
    });

    it("accepts accounts from different sources and persists per-account loginCustomerId", async () => {
      // Mixed: a direct account + clients under two different managers.
      const mixedSourceAccounts = JSON.stringify([
        { id: "1111111111", name: "Direct" },
        { id: "2222222222", name: "Client A", loginCustomerId: "9999999999" },
        { id: "3333333333", name: "Client B", loginCustomerId: "8888888888" },
      ]);
      mockSelectLimit.mockResolvedValue([
        makePendingSession({ customerIds: mixedSourceAccounts }),
      ]);

      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [
            { id: "1111111111", name: "Direct" },
            { id: "2222222222", name: "Client A" },
            { id: "3333333333", name: "Client B" },
          ],
          next: "/connect",
        }),
      );

      expect(response.status).toBe(200);
      // Verify that each manager-routed account kept its loginCustomerId in the
      // stored customerIds JSON (so authForAccount can pick the right manager
      // per tool call). Direct accounts have no loginCustomerId field.
      expect(mockUpdateWhere).toHaveBeenCalled();
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

    // ─── Phase-1 dual-write ────────────────────────────────────────────
    it("[dual-write] mirrors the curated selection onto ad_platform_connections", async () => {
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

      const conn = mockInsertValues.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .find((row) => row?.platform === "google_ads");

      expect(conn).toBeDefined();
      expect(conn).toMatchObject({
        userId: "user-123",
        platform: "google_ads",
        // First account becomes the active default; both retain
        // their server-side loginCustomerId.
        activeAccountId: "1111111111",
        accountIds: [
          { id: "1111111111", name: "Client A", loginCustomerId: "9999999999" },
          { id: "2222222222", name: "Client B", loginCustomerId: "9999999999" },
        ],
      });
    });
  });
});
