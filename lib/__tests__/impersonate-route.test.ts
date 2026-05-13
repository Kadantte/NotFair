import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockSelectLimit, mockRequireDevEmail } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
  mockRequireDevEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mockSelectLimit()),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => mockSelectLimit()),
          })),
        })),
      })),
    })),
  }),
  schema: {
    mcpSessions: {
      id: "id",
      accessToken: "access_token",
      expiresAt: "expires_at",
      customerId: "customer_id",
      customerIds: "customer_ids",
      googleEmail: "google_email",
      createdAt: "created_at",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  gte: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("@/lib/dev-access", () => ({
  requireDevEmail: mockRequireDevEmail,
}));

vi.mock("@/lib/auth-cookies", () => ({
  setImpersonateCookie: vi.fn(),
  clearImpersonateCookie: vi.fn(),
}));

import { POST, DELETE } from "@/app/api/dev/impersonate/route";
import { setImpersonateCookie, clearImpersonateCookie } from "@/lib/auth-cookies";

function makePostRequest(body: object): Request {
  return new Request("http://localhost:3000/api/dev/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/dev/impersonate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: caller is authorized
    mockRequireDevEmail.mockResolvedValue(null);
  });

  it("returns denied response when requireDevEmail rejects (not dev)", async () => {
    mockRequireDevEmail.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));

    const res = await POST(makePostRequest({ accountId: "123" }));
    expect(res.status).toBe(403);
  });

  it("returns denied response when requireDevEmail rejects (unauthenticated)", async () => {
    mockRequireDevEmail.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));

    const res = await POST(makePostRequest({ accountId: "123" }));
    expect(res.status).toBe(403);
  });

  it("returns 500 when requireDevEmail encounters an internal error", async () => {
    mockRequireDevEmail.mockResolvedValue(Response.json({ error: "Internal server error" }, { status: 500 }));

    const res = await POST(makePostRequest({ accountId: "123" }));
    expect(res.status).toBe(500);
  });

  it("returns 400 for missing accountId", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid request body", async () => {
    const req = new Request("http://localhost:3000/api/dev/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when no valid session found for accountId", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    const res = await POST(makePostRequest({ accountId: "999" }));
    expect(res.status).toBe(404);
  });

  it("sets impersonate cookie and returns ok on success", async () => {
    mockSelectLimit.mockResolvedValueOnce([{
      id: 42,
      customerId: "222-222-2222",
      googleEmail: "user@example.com",
    }]);

    const res = await POST(makePostRequest({ accountId: "222-222-2222" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.customerId).toBe("222-222-2222");
    expect(setImpersonateCookie).toHaveBeenCalledWith(expect.anything(), "42");
  });
});

describe("DELETE /api/dev/impersonate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireDevEmail.mockResolvedValue(null);
  });

  it("clears the impersonate cookie", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(clearImpersonateCookie).toHaveBeenCalled();
  });

  it("returns denied response when not a dev", async () => {
    mockRequireDevEmail.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));

    const res = await DELETE();
    expect(res.status).toBe(403);
    expect(clearImpersonateCookie).not.toHaveBeenCalled();
  });
});
