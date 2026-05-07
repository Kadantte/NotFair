import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAMES } from "@/lib/auth-cookies";

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockSelectLimit } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
}));

const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
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
  DEV_EMAILS: ["dev@example.com"],
}));

vi.mock("@/lib/auth-cookies", () => ({
  COOKIE_NAMES: {
    token: "adsagent_token",
    impersonate: "adsagent_impersonate",
  },
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
  });

  it("returns 401 when no token cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const res = await POST(makePostRequest({ accountId: "123" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not a dev", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    mockSelectLimit.mockResolvedValueOnce([{ googleEmail: "notdev@example.com" }]);

    const res = await POST(makePostRequest({ accountId: "123" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when no valid session for accountId", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    // Caller session
    mockSelectLimit.mockResolvedValueOnce([{ googleEmail: "dev@example.com" }]);
    // Target session not found
    mockSelectLimit.mockResolvedValueOnce([]);

    const res = await POST(makePostRequest({ accountId: "999" }));
    expect(res.status).toBe(404);
  });

  it("sets impersonate cookie on success", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    // Caller session
    mockSelectLimit.mockResolvedValueOnce([{ googleEmail: "dev@example.com" }]);
    // Target session found
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

  it("returns 400 for missing accountId", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/dev/impersonate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the impersonate cookie", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(clearImpersonateCookie).toHaveBeenCalled();
  });
});
