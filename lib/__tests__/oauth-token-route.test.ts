import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

const {
  mockSelectRows,
  mockInsertValues,
  mockUpdateWhere,
} = vi.hoisted(() => ({
  mockSelectRows: vi.fn(),
  mockInsertValues: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectRows()),
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
    oauthClients: { clientId: "client_id", clientSecretHash: "client_secret_hash", sessionId: "session_id" },
    authorizationCodes: {
      code: "code",
      used: "used",
      expiresAt: "expires_at",
    },
    mcpSessions: { id: "id", expiresAt: "expires_at", userId: "user_id" },
    oauthAccessTokens: {
      token: "token",
      clientId: "client_id",
      sessionId: "session_id",
      connectionId: "connection_id",
      resourceUrl: "resource_url",
    },
    adPlatformConnections: {
      id: "id",
      userId: "user_id",
      platform: "platform",
      activeAccountId: "active_account_id",
      accessTokenExpiresAt: "access_token_expires_at",
    },
  },
}));

import { POST } from "@/app/api/oauth/token/route";

const VALID_SECRET = "test-secret";
const VALID_SECRET_HASH = createHash("sha256").update(VALID_SECRET).digest("hex");

function makeRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams(body);
  return new Request("http://localhost/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

describe("OAuth token route — POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("returns invalid_grant (not 500) when the bound mcp_session has expired", async () => {
    // 1) oauth_clients lookup → valid client
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    // 2) authorization_codes lookup → unused, unexpired code
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
      },
    ]);
    // 3) mcp_sessions lookup with expiry filter → empty (session is past expiry)
    mockSelectRows.mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toMatch(/expired/i);
    // Critical: no token row was inserted for an expired session
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("issues a token by inserting into oauth_access_tokens (not by rotating oauth_clients column)", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
      },
    ]);
    mockSelectRows.mockResolvedValueOnce([{ expiresAt: futureExpiry }]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.access_token).toMatch(/^oat_[a-f0-9]{64}$/);
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBeGreaterThan(0);

    // Insert went to oauth_access_tokens with the issued token + bound session
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertArg = mockInsertValues.mock.calls[0][0];
    expect(insertArg.token).toBe(body.access_token);
    expect(insertArg.clientId).toBe("test-client");
    expect(insertArg.sessionId).toBe(42);
  });

  it("does NOT rotate oauth_clients.oauth_access_token (concurrent exchanges stay independent)", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
      },
    ]);
    mockSelectRows.mockResolvedValueOnce([{ expiresAt: futureExpiry }]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(200);
    // The only update on oauth_clients should be the session-id binding
    // (used by /authorize for DCR clients). Critically, no oauthAccessToken
    // field — that would re-introduce the rotation hazard.
    expect(mockUpdateWhere).toHaveBeenCalledTimes(2); // 1: mark code used, 2: bind session_id
  });

  it("rejects expired authorization codes with invalid_grant", async () => {
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    // authorization_codes lookup filters expired/used at the SQL layer; mock returns empty
    mockSelectRows.mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_grant");
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  // ─── sessionId → connectionId translation at exchange time ──

  it("translates a sessionId-bound auth code into a connectionId-bound token", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        connectionId: null,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
      },
    ]);
    // mcp_sessions lookup → returns expiry + userId for translation lookup
    mockSelectRows.mockResolvedValueOnce([{ expiresAt: futureExpiry, userId: "user-1" }]);
    // ad_platform_connections lookup by (userId, google_ads) → returns connection
    mockSelectRows.mockResolvedValueOnce([{ id: 7 }]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertArg = mockInsertValues.mock.calls[0][0];
    expect(insertArg.sessionId).toBeNull();
    expect(insertArg.connectionId).toBe(7);

    // oauth_clients.session_id is mcp_sessions-only — must NOT be updated
    // when we translated to a connection binding, so only "mark code used"
    // ran (1 update, not 2).
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it("falls back to sessionId binding when no connection row exists for the user", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        connectionId: null,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
      },
    ]);
    mockSelectRows.mockResolvedValueOnce([{ expiresAt: futureExpiry, userId: "user-1" }]);
    // ad_platform_connections lookup → empty (no row for this user)
    mockSelectRows.mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    // Token still issues — missing connection row should not block exchange.
    expect(response.status).toBe(200);
    const insertArg = mockInsertValues.mock.calls[0][0];
    expect(insertArg.sessionId).toBe(42);
    expect(insertArg.connectionId).toBeNull();
  });

  // ─── Public clients (token_endpoint_auth_method=none, PKCE-only) ──

  it("accepts PKCE-only exchange from a public client (no client_secret)", async () => {
    // S256 challenge derived from this verifier.
    const codeVerifier = "test-code-verifier-1234567890abcdefghij";
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // 1) oauth_clients lookup → existing client row (secret stored but client
    //    registered with token_endpoint_auth_method=none, so won't send it).
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    // 2) authorization_codes lookup → unused, unexpired, PKCE-bound code.
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        connectionId: null,
        redirectUri: "http://localhost:53682/callback",
        codeChallenge,
        codeChallengeMethod: "S256",
      },
    ]);
    // 3) mcp_sessions lookup → unexpired session.
    mockSelectRows.mockResolvedValueOnce([{ expiresAt: futureExpiry, userId: null }]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        // NO client_secret — public client per RFC 7591 token_endpoint_auth_method=none.
        redirect_uri: "http://localhost:53682/callback",
        code_verifier: codeVerifier,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.access_token).toMatch(/^oat_[a-f0-9]{64}$/);
  });

  it("rejects a public client with no PKCE on the auth code (still requires some authenticator)", async () => {
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    // Auth code without code_challenge — no PKCE binding to authenticate against.
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        connectionId: null,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
      },
    ]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        // NO client_secret AND the auth code has no code_challenge — reject.
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("invalid_client");
    expect(body.error_description).toMatch(/client_secret/i);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("rejects PKCE-only exchange with a bad code_verifier", async () => {
    const goodVerifier = "test-code-verifier-1234567890abcdefghij";
    const codeChallenge = createHash("sha256").update(goodVerifier).digest("base64url");

    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        connectionId: null,
        redirectUri: "http://localhost:53682/callback",
        codeChallenge,
        codeChallengeMethod: "S256",
      },
    ]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        redirect_uri: "http://localhost:53682/callback",
        code_verifier: "wrong-verifier",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_grant");
  });

  // ─── connectionId-bound auth codes (Phase-2 Google DCR + Meta DCR) ──

  it("issues a token for a connectionId-bound code when the connection has an activeAccountId", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: null,
        connectionId: 7,
        gohighlevelConnectionId: null,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
        resourceUrl: "/api/mcp/google_ads",
      },
    ]);
    // ad_platform_connections lookup → row with an active account selected
    mockSelectRows.mockResolvedValueOnce([
      { activeAccountId: "1234567890", expiresAt: futureExpiry },
    ]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.access_token).toMatch(/^oat_google_ads_[a-f0-9]{64}$/);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertArg = mockInsertValues.mock.calls[0][0];
    expect(insertArg.connectionId).toBe(7);
    expect(insertArg.sessionId).toBeNull();
  });

  it("rejects token issuance when the bound connection has no activeAccountId (closes the silent 'Connected → reconnect on first tool call' loop)", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: null,
        connectionId: 7,
        gohighlevelConnectionId: null,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
        resourceUrl: "/api/mcp/google_ads",
      },
    ]);
    // ad_platform_connections lookup → row exists but activeAccountId was
    // cleared between /authorize and this exchange.
    mockSelectRows.mockResolvedValueOnce([
      { activeAccountId: null, expiresAt: futureExpiry },
    ]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toMatch(/active ad account/i);
    // Critical: no dud token row inserted
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("does NOT translate when the session row has no userId (legacy ads-less rows)", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([
      {
        code: "abc",
        clientId: "test-client",
        sessionId: 42,
        connectionId: null,
        redirectUri: "http://localhost:3000/cb",
        codeChallenge: null,
        codeChallengeMethod: null,
      },
    ]);
    mockSelectRows.mockResolvedValueOnce([{ expiresAt: futureExpiry, userId: null }]);

    const response = await POST(
      makeRequest({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "test-client",
        client_secret: VALID_SECRET,
        redirect_uri: "http://localhost:3000/cb",
      }),
    );

    expect(response.status).toBe(200);
    const insertArg = mockInsertValues.mock.calls[0][0];
    expect(insertArg.sessionId).toBe(42);
    expect(insertArg.connectionId).toBeNull();
  });
});
