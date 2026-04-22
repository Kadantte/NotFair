import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectLimit } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectLimit()),
        })),
      })),
    })),
  }),
  schema: {
    mcpSessions: {
      accessToken: "access_token",
      expiresAt: "expires_at",
      refreshToken: "refresh_token",
      customerId: "customer_id",
      customerIds: "customer_ids",
      userId: "user_id",
    },
  },
}));

vi.mock("@/lib/google-ads", () => ({
  parseCustomerIds: vi.fn((raw: string | null | undefined) => {
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }),
}));

vi.mock("mcp-handler", () => ({
  createMcpHandler: vi.fn((setupFn: (server: unknown) => void) => {
    // Call setup with a stub server so registerTool etc. don't fail
    setupFn({ registerTool: vi.fn(), registerResource: vi.fn() });
    // Return a handler that returns an empty 200 (never reached in auth-error tests)
    return vi.fn(async () => new Response("ok"));
  }),
}));

vi.mock("@/lib/mcp", () => ({
  registerReadTools: vi.fn(),
  registerWriteTools: vi.fn(),
}));

vi.mock("@/lib/mcp/types", () => ({
  typedResult: vi.fn(),
}));

// Import the handler which exposes resolveAuth indirectly
import { GET } from "@/app/api/[transport]/route";

function makeRequest(token?: string, body?: object): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? { method: "tools/call", params: { name: "listCampaigns" } }),
  });
}

describe("MCP resolveAuth — no env var fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure env vars are set — they should NOT be used as fallback
    process.env.GOOGLE_ADS_REFRESH_TOKEN = "founder-refresh-token";
    process.env.GOOGLE_ADS_CUSTOMER_ID = "founder-customer-id";
  });

  it("returns 401 when no Bearer token is provided", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("No valid authentication");
  });

  it("returns 401 when bearer token does not match any session", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const response = await GET(makeRequest("bad-token"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Session not found or expired");
  });

  it("does NOT fall back to env var credentials when DB lookup finds no session", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const response = await GET(makeRequest("bad-token"));

    // Should be 401, not a successful response using founder's credentials
    expect(response.status).toBe(401);
  });

  it("does NOT fall back to env var credentials when DB throws an error", async () => {
    mockSelectLimit.mockRejectedValue(new Error("DB connection failed"));

    const response = await GET(makeRequest("some-token"));

    // Should propagate as 401, not silently use founder's account
    expect(response.status).toBe(401);
  });

  it("returns 401 when session has no customerId (pending account selection)", async () => {
    mockSelectLimit.mockResolvedValue([
      {
        refreshToken: "rt",
        customerId: "",
        customerIds: "[]",
        userId: "user-1",
      },
    ]);

    const response = await GET(makeRequest("pending-token"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Account selection pending");
  });
});
