import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionAuth,
  mockListConnectableAccounts,
} = vi.hoisted(() => ({
  mockGetSessionAuth: vi.fn(),
  mockListConnectableAccounts: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSessionAuth: mockGetSessionAuth,
}));

vi.mock("@/lib/google-ads", () => ({
  listConnectableAccounts: mockListConnectableAccounts,
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

    mockListConnectableAccounts.mockResolvedValue({
      accounts: [
        { id: "1234567890", name: "Existing Account" },
        { id: "0987654321", name: "New Account" },
      ],
      managers: [],
    });

  });

  it("reuses the current refresh token and redirects straight to account selection", async () => {
    const response = await GET();

    expect(mockGetSessionAuth).toHaveBeenCalled();
    expect(mockListConnectableAccounts).toHaveBeenCalledWith("refresh-token");

    expect(response.status).toBe(307);

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/connect?mode=update");
    expect(location).toContain("accounts=");
    expect(location).toContain("selected=");
    expect(decodeURIComponent(location)).toContain('"1234567890"');
    expect(decodeURIComponent(location)).toContain("New Account");
  });

  it("includes manager-routed clients with loginCustomerId in the redirect", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [
        { id: "1234567890", name: "Direct Account" },
        {
          id: "5555555555",
          name: "Client A",
          loginCustomerId: "9999999999",
          loginCustomerName: "Acme MCC",
        },
      ],
      managers: [{ id: "9999999999", name: "Acme MCC" }],
    });

    const response = await GET();
    const location = response.headers.get("location") ?? "";
    const decoded = decodeURIComponent(location);

    expect(decoded).toContain('"loginCustomerId":"9999999999"');
    expect(decoded).toContain('"loginCustomerName":"Acme MCC"');
  });

  it("returns NO_CLIENT_ACCOUNTS error when only managers exist with no clients", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [],
      managers: [{ id: "9999999999", name: "Empty MCC" }],
    });

    const response = await GET();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("No%20client%20accounts%20found");
  });

  it("returns NO_ACCOUNTS error when no accounts at all", async () => {
    mockListConnectableAccounts.mockResolvedValue({
      accounts: [],
      managers: [],
    });

    const response = await GET();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("doesn%27t%20have%20a%20Google%20Ads%20account");
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
