import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionAuth,
  mockListAccessibleCustomers,
} = vi.hoisted(() => ({
  mockGetSessionAuth: vi.fn(),
  mockListAccessibleCustomers: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSessionAuth: mockGetSessionAuth,
}));

vi.mock("@/lib/google-ads", () => ({
  listAccessibleCustomers: mockListAccessibleCustomers,
  parseCustomerIds: vi.fn((raw: string | null | undefined) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(
            (item: unknown): item is { id: string; name?: string } =>
              typeof item === "object" && item !== null && "id" in item,
          )
        : [];
    } catch {
      return [];
    }
  }),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({}),
  schema: {
    mcpSessions: {},
  },
}));

import { GET } from "@/app/api/auth/add-account/route";

describe("Add account route — GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    mockGetSessionAuth.mockResolvedValue({
      refreshToken: "refresh-token",
      customerId: "1234567890",
      customerIds: JSON.stringify([
        { id: "1234567890", name: "Existing Account" },
      ]),
      userId: "user-123",
      googleEmail: "user@example.com",
    });

    mockListAccessibleCustomers.mockResolvedValue([
      { id: "1234567890", name: "Existing Account", isManager: false },
      { id: "0987654321", name: "New Account", isManager: false },
    ]);

  });

  it("reuses the current refresh token and redirects straight to account selection", async () => {
    const response = await GET();

    expect(mockGetSessionAuth).toHaveBeenCalled();
    expect(mockListAccessibleCustomers).toHaveBeenCalledWith("refresh-token");

    expect(response.status).toBe(307);

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/connect?mode=update");
    expect(location).toContain("accounts=");
    expect(location).toContain("selected=");
    expect(decodeURIComponent(location)).toContain('"1234567890"');
    expect(decodeURIComponent(location)).toContain("New Account");
  });

  it("redirects back to connect with an error when session auth is unavailable", async () => {
    mockGetSessionAuth.mockRejectedValue(new Error("Not authenticated"));

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "/connect?error=Failed%20to%20prepare%20account%20selection%3A%20Not%20authenticated",
    );
  });
});
