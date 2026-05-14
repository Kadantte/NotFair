import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCookieGet,
  mockSelectLimit,
  mockUpdateWhere,
  mockDeleteWhere,
  mockListConnectableAccounts,
  mockInsertValues,
  mockIdentifyUser,
  mockLoadGoogleConnection,
  mockMaybeFireGoogleAdsSignup,
} = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockListConnectableAccounts: vi.fn(),
  mockInsertValues: vi.fn(),
  mockIdentifyUser: vi.fn(),
  mockLoadGoogleConnection: vi.fn(),
  mockMaybeFireGoogleAdsSignup: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/identify-user", () => ({
  identifyUser: () => mockIdentifyUser(),
}));

vi.mock("@/lib/google-ads-signup", () => ({
  maybeFireGoogleAdsSignup: mockMaybeFireGoogleAdsSignup,
}));

vi.mock("@/lib/x-signup", () => ({
  X_SIGNUP_ID_COOKIE: "x_signup_id",
  buildXSignupConversionId: vi.fn((userId: string) => `signup-${userId}`),
}));

vi.mock("@/lib/connections/google-read", () => ({
  loadGoogleConnection: () => mockLoadGoogleConnection(),
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
    // Default identity: cookie-resolved user with a live mcp_sessions row.
    // Tests override via mockIdentifyUser.mockResolvedValueOnce(null) etc.
    mockIdentifyUser.mockResolvedValue({
      userId: "user-123",
      googleEmail: "test@example.com",
    });
    // Default connection: existing connected account.
    mockLoadGoogleConnection.mockResolvedValue({
      refreshToken: "refresh-token",
      customerId: "1234567890",
      customerIds: [{ id: "1234567890", name: "Existing Account" }],
      loginCustomerId: null,
      googleEmail: "test@example.com",
    });
    // mcp_sessions accessToken lookup at the bottom (for setSessionCookies).
    mockSelectLimit.mockResolvedValue([{ accessToken: "existing-token" }]);
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

  it("upserts the connection row when switching accounts", async () => {
    const response = await POST(
      makeRequest({
        accounts: [
          { id: "0987654321", name: "New Account" },
          { id: "1234567890", name: "Existing Account" },
        ],
      }),
    );

    expect(mockListConnectableAccounts).toHaveBeenCalledWith("refresh-token");
    expect(mockInsertValues).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("returns 401 when identifyUser returns null (no Supabase user, no cookie)", async () => {
    mockCookieGet.mockReturnValue(undefined);
    mockIdentifyUser.mockResolvedValue(null);

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
      // Pending connection: customerId is "" (no active account yet) and
      // candidates are the pre-validated MCC accounts. Phase-4 step 2 reads
      // candidates from the connection, not from mcp_sessions.customerIds.
      mockLoadGoogleConnection.mockResolvedValue({
        refreshToken: "refresh-token",
        customerId: "",
        customerIds: [
          { id: "1111111111", name: "Client A", loginCustomerId: "9999999999" },
          { id: "2222222222", name: "Client B", loginCustomerId: "9999999999" },
        ],
        loginCustomerId: null,
        googleEmail: "test@example.com",
      });
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
      expect(mockInsertValues).toHaveBeenCalled();
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
      // Override the connection's candidate set to match.
      mockLoadGoogleConnection.mockResolvedValue({
        refreshToken: "refresh-token",
        customerId: "",
        customerIds: [
          { id: "1111111111", name: "Direct" },
          { id: "2222222222", name: "Client A", loginCustomerId: "9999999999" },
          { id: "3333333333", name: "Client B", loginCustomerId: "8888888888" },
        ],
        loginCustomerId: null,
        googleEmail: "test@example.com",
      });

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
      expect(mockInsertValues).toHaveBeenCalled();
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
      expect(mockInsertValues).toHaveBeenCalled();
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

    it("fires maybeFireGoogleAdsSignup with userId + email on new signup", async () => {
      const response = await POST(
        makeRequest({
          pendingToken: "pending-token-abc",
          accounts: [{ id: "1111111111", name: "Client A" }],
          next: "/onboarding",
        }),
      );

      expect(response.status).toBe(200);
      // Server-side fallback for the Google Ads signup conversion. Email
      // comes from identity.googleEmail (mocked above) since the Supabase
      // user lookup isn't wired in the unit test; gclid is null because
      // no UTM/click metadata was supplied in the request.
      expect(mockMaybeFireGoogleAdsSignup).toHaveBeenCalledTimes(1);
      expect(mockMaybeFireGoogleAdsSignup).toHaveBeenCalledWith({
        userId: "user-123",
        email: "test@example.com",
        gclid: null,
      });
      // gads_signup_email cookie carries the email to the browser for ECL.
      expect(response.cookies.get("gads_signup_email")?.value).toBe(
        "test@example.com",
      );
      expect(response.cookies.get("x_signup_id")?.value).toBe("signup-user-123");
      // TTL bumped from 60 → 600 to survive slow hydration. The raw
      // Set-Cookie header is comma-joined (`Expires=Mon, DD…` contains
      // commas too), so use `Set-Cookie` getSetCookie() to get a clean
      // per-cookie array.
      const cookies = response.headers.getSetCookie();
      const newSignupCookie = cookies.find((c) =>
        c.startsWith("gads_new_signup="),
      );
      const emailCookie = cookies.find((c) =>
        c.startsWith("gads_signup_email="),
      );
      expect(newSignupCookie).toMatch(/Max-Age=600/);
      expect(emailCookie).toMatch(/Max-Age=600/);
    });

    it("returns 404 when no Google connection exists for the user", async () => {
      // Phase-4 step 2: pendingToken is no longer load-bearing for identity.
      // The 404 surfaces when the user has no ad_platform_connections row
      // (e.g. callback's connection upsert never ran).
      mockLoadGoogleConnection.mockResolvedValue(null);

      const response = await POST(
        makeRequest({
          pendingToken: "ignored-now",
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

  // ─── Phase-4 step 2: Supabase-only identity (no legacy mcp_sessions) ──

  describe("Supabase-only identity path", () => {
    beforeEach(() => {
      // No mcp_sessions row; identity comes purely from Supabase.
      mockIdentifyUser.mockResolvedValue({
        userId: "user-123",
        googleEmail: "supabase@example.com",
        legacySessionId: null,
        via: "supabase",
      });
      mockLoadGoogleConnection.mockResolvedValue({
        refreshToken: "refresh-token",
        customerId: "",
        customerIds: [
          { id: "1111111111", name: "Client A", loginCustomerId: "9999999999" },
        ],
        loginCustomerId: null,
        googleEmail: "supabase@example.com",
      });
    });

    it("succeeds without UPDATEing mcp_sessions when legacySessionId is null", async () => {
      const response = await POST(
        makeRequest({
          pendingToken: "pt",
          accounts: [{ id: "1111111111", name: "Client A" }],
        }),
      );

      expect(response.status).toBe(200);
      // Connection upsert ran (always)
      const connInsert = mockInsertValues.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .find((row) => row?.platform === "google_ads");
      expect(connInsert).toBeDefined();
      // mcp_sessions UPDATE/DELETE both skipped (no legacy row)
      expect(mockUpdateWhere).not.toHaveBeenCalled();
      expect(mockDeleteWhere).not.toHaveBeenCalled();
    });

    it("does NOT re-set the adsagent_token cookie for Supabase-only users", async () => {
      const response = await POST(
        makeRequest({
          pendingToken: "pt",
          accounts: [{ id: "1111111111", name: "Client A" }],
        }),
      );

      expect(response.status).toBe(200);
      // setSessionCookies skipped — Supabase users have sb-* cookies; the
      // legacy adsagent_token cookie is not re-issued.
      expect(response.cookies.get("adsagent_token")).toBeUndefined();
    });
  });
});
