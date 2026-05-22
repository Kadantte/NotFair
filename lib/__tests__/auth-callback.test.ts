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
  mockMaybeFireGoogleAdsSignup,
  mockLoadGoogleConnection,
} = vi.hoisted(() => ({
  mockSignInWithIdToken: vi.fn(),
  mockInsertValues: vi.fn(),
  mockListConnectableAccounts: vi.fn(),
  mockSelectRows: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockCookieGet: vi.fn(),
  mockCookieGetAll: vi.fn(),
  mockVerifyOAuthNonce: vi.fn(),
  mockMaybeFireGoogleAdsSignup: vi.fn(async () => {}),
  mockLoadGoogleConnection: vi.fn<() => Promise<unknown>>(async () => null),
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
      updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
  createRouteHandlerClient: vi.fn(async () => ({
    client: {
      auth: {
        signInWithIdToken: mockSignInWithIdToken,
        updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    },
    applyPendingCookies: vi.fn(),
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

vi.mock("@/lib/connections/google-read", () => ({
  loadGoogleConnection: mockLoadGoogleConnection,
}));

vi.mock("@/lib/google-ads-signup", () => ({
  maybeFireGoogleAdsSignup: mockMaybeFireGoogleAdsSignup,
}));

vi.mock("@/lib/x-signup", () => ({
  X_SIGNUP_ID_COOKIE: "x_signup_id",
  buildXSignupConversionId: vi.fn((userId: string) => `signup-${userId}`),
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
        // Capture for assertion (mcp_sessions writes use this directly).
        mockInsertValues(...args);
        // Return a thenable that is ALSO chainable into onConflictDoUpdate.
        // The connection upsert uses `.values(x).onConflictDoUpdate(y)`;
        // mcp_sessions writes await `.values(x)` directly. Both work.
        const thenable = Promise.resolve(undefined) as Promise<undefined> & {
          onConflictDoUpdate: (set: unknown) => Promise<undefined>;
        };
        thenable.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
        return thenable;
      },
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: (...args: unknown[]) => mockUpdateWhere(...args),
      })),
    })),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj),
  };
  return {
    db: () => dbObj,
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
      adPlatformConnections: {
        userId: "user_id",
        platform: "platform",
      },
    },
  };
});

import { GET } from "@/app/auth/callback/route";

// Helper: encode a valid state param with a nonce + payload
const NONCE = "test-nonce-abc123";
function encodeState(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({ nonce: NONCE, next: "/campaigns", popup: false, ...overrides })).toString("base64url");
}

function makeRequest(url: string): Request {
  return new Request(url);
}

function findSessionInsert() {
  return mockInsertValues.mock.calls
    .map((call) => call[0] as Record<string, unknown>)
    .find((row) => Object.prototype.hasOwnProperty.call(row, "accessToken"));
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

  it("fires maybeFireGoogleAdsSignup with userId + email + gclid on new signup", async () => {
    // mockSelectRows returns [] by default → both isFirstSignup checks empty
    // → isFirstSignup = true → outer handler fires server-side conversion.
    const state = encodeState({
      attribution: {
        version: 1,
        gclid: "EAIaIQ-test-gclid",
        twclid: "twclid-test",
        attribution_captured_at: "2026-05-11T00:00:00Z",
      },
    });
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(mockMaybeFireGoogleAdsSignup).toHaveBeenCalledTimes(1);
    expect(mockMaybeFireGoogleAdsSignup).toHaveBeenCalledWith({
      userId: "user-123",
      email: "user@example.com",
      gclid: "EAIaIQ-test-gclid",
    });
    // 600s TTL on the cookies that carry the signup signal (read from raw
    // Set-Cookie since the test framework's cookies.get only exposes value).
    const cookies = response.headers.getSetCookie();
    const newSignupCookie = cookies.find((c) =>
      c.startsWith("gads_new_signup="),
    );
    expect(newSignupCookie).toMatch(/Max-Age=600/);
    expect(response.cookies.get("gads_signup_email")?.value).toBe(
      "user@example.com",
    );
    expect(response.cookies.get("x_signup_id")?.value).toBe("signup-user-123");
  });

  it("does NOT fire maybeFireGoogleAdsSignup on a returning user", async () => {
    // Returning user: mcp_sessions has a row.
    mockSelectRows.mockResolvedValue([{ id: 1 }]);

    const state = encodeState();
    await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(mockMaybeFireGoogleAdsSignup).not.toHaveBeenCalled();
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
    // New users with multiple Google Ads accounts land on /manage-ads-accounts
    // first so they can pick a platform; the pending token + candidate
    // accounts are stored in the mcp_sessions row + cookie, and the page
    // forwards to /manage-ads-accounts/google-ads/select when the user clicks the
    // Google card.
    expect(response.headers.get("location")).toContain("/manage-ads-accounts");
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
    const location = new URL(response.headers.get("location") ?? "");
    // No-accounts states route to /manage-ads-accounts (the platform picker),
    // not back to /connect (which is reserved for connection-flow errors).
    expect(location.pathname).toBe("/manage-ads-accounts");
    expect(response.cookies.get("gads_new_signup")?.value).toBe("1");
    expect(response.cookies.get("gads_signup_email")?.value).toBe("user@example.com");
    expect(mockMaybeFireGoogleAdsSignup).toHaveBeenCalledWith({
      userId: "user-123",
      email: "user@example.com",
      gclid: null,
    });
  });

  // ─── Phase-1 dual-write: ad_platform_connections ───────────────────
  //
  // Every Google `mcp_sessions` write should be mirrored by a connection-row
  // upsert keyed on (userId, "google_ads"). These assertions pin the field
  // mapping so phase-2 readers can rely on it.

  function findConnectionUpsert() {
    return mockInsertValues.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((row) => row?.platform === "google_ads");
  }

  it("[dual-write] mints an ad_platform_connections row for the ads-less path", async () => {
    // signInWithIdToken returns user; listConnectableAccounts returns no
    // usable accounts (manager-only) → mintAdsLessSession runs.
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [],
      managers: [{ id: "9999999999", name: "Acme MCC" }],
    });

    const state = encodeState();
    await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    const conn = findConnectionUpsert();
    expect(conn).toBeDefined();
    expect(conn).toMatchObject({
      userId: "user-123",
      platform: "google_ads",
      refreshToken: "google-refresh-token",
      activeAccountId: null,
      accountIds: [],
    });
  });

  it("[dual-write] mints an ad_platform_connections row for the single-account path", async () => {
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

    const conn = findConnectionUpsert();
    expect(conn).toBeDefined();
    expect(conn).toMatchObject({
      userId: "user-123",
      platform: "google_ads",
      activeAccountId: "5555555555",
      accountIds: [
        { id: "5555555555", name: "Client A", loginCustomerId: "9999999999" },
      ],
    });
  });

  it("[dual-write] mints an ad_platform_connections row for the multi-account-pending path", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [
        { id: "1111111111", name: "Direct Account" },
        { id: "2222222222", name: "Client B", loginCustomerId: "9999999999" },
      ],
      managers: [{ id: "9999999999", name: "Acme MCC" }],
    });

    const state = encodeState();
    await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    const conn = findConnectionUpsert();
    expect(conn).toBeDefined();
    // Pending — no chosen account yet. accountIds carries the candidate set.
    expect(conn).toMatchObject({
      userId: "user-123",
      platform: "google_ads",
      activeAccountId: null,
      accountIds: [
        { id: "1111111111", name: "Direct Account", loginCustomerId: null },
        { id: "2222222222", name: "Client B", loginCustomerId: "9999999999" },
      ],
    });
  });

  it("reuses an existing Google connection without re-listing accounts", async () => {
    // Returning user has a connection row already populated from a prior signin.
    mockSelectRows.mockResolvedValue([]);
    mockLoadGoogleConnection.mockResolvedValue({
      refreshToken: "rotated-rt",
      customerId: "1234567890",
      customerIds: [{ id: "1234567890", name: "Existing Account", loginCustomerId: null }],
      loginCustomerId: null,
      googleEmail: "user@example.com",
    });

    const state = encodeState({ next: "/tools" });
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/tools");
    expect(mockListConnectableAccounts).not.toHaveBeenCalled();
    expect(findSessionInsert()).toBeUndefined();
    expect(response.cookies.get("adsagent_token")?.value).toBeUndefined();
  });

  it("redirects with an error when Supabase signin returns no userId (pathological)", async () => {
    // signInWithIdToken normally produces a userId. The rare no-user path
    // can't anchor identity to anything — bail out instead of silently
    // half-completing.
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [{ id: "5555555555", name: "Client A" }],
      managers: [],
    });

    const state = encodeState();
    const response = await GET(
      makeRequest(`http://localhost:3000/auth/callback?code=valid-code&state=${state}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connect");
    expect(findSessionInsert()).toBeUndefined();
    expect(response.cookies.get("adsagent_token")?.value).toBeUndefined();
  });
});
