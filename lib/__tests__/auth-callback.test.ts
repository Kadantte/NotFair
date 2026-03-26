import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase server client
const mockExchangeCodeForSession = vi.fn();
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getUser: mockGetUser,
    },
  })),
}));

// Mock database
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
vi.mock("@/lib/db", () => ({
  db: () => ({
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: (...fArgs: unknown[]) => {
        mockFrom(...fArgs);
        return { where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          return { limit: (...lArgs: unknown[]) => {
            mockLimit(...lArgs);
            return mockLimit.getMockImplementation?.()?.(...lArgs) ?? [];
          }};
        }};
      }};
    },
  }),
  schema: {
    mcpSessions: {
      id: "id",
      userId: "user_id",
    },
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ _type: "eq", val })),
}));

import { GET } from "@/app/auth/callback/route";

function makeRequest(url: string): Request {
  return new Request(url);
}

describe("Auth callback route — GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockImplementation(() => []);
  });

  it("redirects to /login?error=auth_failed when no code param", async () => {
    const response = await GET(makeRequest("http://localhost:3000/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=auth_failed");
  });

  it("redirects to /login?error=auth_failed on session exchange error", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=invalid"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=auth_failed");
  });

  it("redirects to /connect when user has no MCP session", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockLimit.mockImplementation(() => []);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connect");
  });

  it("redirects to /campaigns when user has an MCP session", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockLimit.mockImplementation(() => [{ id: 1 }]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/campaigns");
  });

  it("respects the ?next param when user has MCP session", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockLimit.mockImplementation(() => [{ id: 1 }]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code&next=/tools"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/tools");
  });

  it("redirects to /campaigns (default) when no next param", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockLimit.mockImplementation(() => [{ id: 1 }]);

    const response = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    const location = response.headers.get("location") ?? "";
    expect(location).toMatch(/\/campaigns$/);
  });
});
