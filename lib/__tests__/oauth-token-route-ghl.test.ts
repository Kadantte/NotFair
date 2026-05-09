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
    authorizationCodes: { code: "code", used: "used", expiresAt: "expires_at" },
    mcpSessions: { id: "id", expiresAt: "expires_at", userId: "user_id" },
    oauthAccessTokens: {
      token: "token",
      clientId: "client_id",
      sessionId: "session_id",
      connectionId: "connection_id",
      gohighlevelConnectionId: "gohighlevel_connection_id",
      resourceUrl: "resource_url",
    },
    adPlatformConnections: {
      id: "id",
      userId: "user_id",
      platform: "platform",
      accessTokenExpiresAt: "access_token_expires_at",
    },
    goHighLevelConnections: {
      id: "id",
      uninstalledAt: "uninstalled_at",
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

describe("OAuth token route — GoHighLevel binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("issues an oat_gohighlevel_* token and stamps gohighlevelConnectionId on the row", async () => {
    // 1) oauth_clients
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    // 2) authorization_codes — bound to gohighlevelConnectionId
    mockSelectRows.mockResolvedValueOnce([{
      code: "code-abc",
      clientId: "test-client",
      sessionId: null,
      connectionId: null,
      gohighlevelConnectionId: 7,
      redirectUri: "http://localhost:3000/cb",
      codeChallenge: null,
      codeChallengeMethod: null,
      resourceUrl: "/api/mcp/gohighlevel",
    }]);
    // 3) gohighlevel_connections lookup — present, not uninstalled
    mockSelectRows.mockResolvedValueOnce([{ id: 7, uninstalledAt: null }]);

    const res = await POST(makeRequest({
      grant_type: "authorization_code",
      code: "code-abc",
      client_id: "test-client",
      client_secret: VALID_SECRET,
      redirect_uri: "http://localhost:3000/cb",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toMatch(/^oat_gohighlevel_[a-f0-9]{64}$/);
    expect(json.token_type).toBe("Bearer");
    expect(json.expires_in).toBeGreaterThan(0);

    // The token row must carry gohighlevelConnectionId, NOT sessionId or connectionId.
    const inserted = mockInsertValues.mock.calls.find((args) => {
      const v = args[0] as Record<string, unknown>;
      return typeof v?.token === "string" && String(v.token).startsWith("oat_gohighlevel_");
    });
    expect(inserted).toBeDefined();
    const row = inserted![0] as Record<string, unknown>;
    expect(row.gohighlevelConnectionId).toBe(7);
    expect(row.sessionId).toBeNull();
    expect(row.connectionId).toBeNull();
    expect(row.resourceUrl).toBe("/api/mcp/gohighlevel");
  });

  it("rejects (invalid_grant) when the bound HighLevel connection is uninstalled", async () => {
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([{
      code: "code-uninst",
      clientId: "test-client",
      sessionId: null,
      connectionId: null,
      gohighlevelConnectionId: 7,
      redirectUri: "http://localhost:3000/cb",
      codeChallenge: null,
      codeChallengeMethod: null,
      resourceUrl: "/api/mcp/gohighlevel",
    }]);
    mockSelectRows.mockResolvedValueOnce([{ id: 7, uninstalledAt: new Date() }]);

    const res = await POST(makeRequest({
      grant_type: "authorization_code",
      code: "code-uninst",
      client_id: "test-client",
      client_secret: VALID_SECRET,
      redirect_uri: "http://localhost:3000/cb",
    }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_grant");
    // Confirm we did NOT mint a token row.
    const oatInsert = mockInsertValues.mock.calls.find((args) => {
      const v = args[0] as Record<string, unknown>;
      return typeof v?.token === "string" && String(v.token).startsWith("oat_");
    });
    expect(oatInsert).toBeUndefined();
  });

  it("rejects (invalid_grant) when the bound HighLevel connection is missing", async () => {
    mockSelectRows.mockResolvedValueOnce([{ clientSecretHash: VALID_SECRET_HASH }]);
    mockSelectRows.mockResolvedValueOnce([{
      code: "code-gone",
      clientId: "test-client",
      sessionId: null,
      connectionId: null,
      gohighlevelConnectionId: 99,
      redirectUri: "http://localhost:3000/cb",
      codeChallenge: null,
      codeChallengeMethod: null,
      resourceUrl: "/api/mcp/gohighlevel",
    }]);
    mockSelectRows.mockResolvedValueOnce([]); // connection deleted

    const res = await POST(makeRequest({
      grant_type: "authorization_code",
      code: "code-gone",
      client_id: "test-client",
      client_secret: VALID_SECRET,
      redirect_uri: "http://localhost:3000/cb",
    }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_grant");
  });
});
