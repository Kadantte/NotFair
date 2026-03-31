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
});
