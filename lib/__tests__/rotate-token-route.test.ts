import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCookieGet, mockUpdateReturning } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockUpdateReturning: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
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
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => mockUpdateReturning()),
        })),
      })),
    })),
  }),
  schema: {
    mcpSessions: {
      accessToken: "access_token",
      expiresAt: "expires_at",
      customerIds: "customer_ids",
    },
  },
}));

import { POST } from "@/app/api/auth/rotate-token/route";

describe("Rotate token route — POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieGet.mockReturnValue({ value: "old-token" });
    mockUpdateReturning.mockResolvedValue([
      { customerIds: '[{"id":"111","name":"Test Account"}]' },
    ]);
  });

  it("returns 401 when no cookie is present", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const response = await POST();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 404 when the atomic update matches no rows (expired or already rotated)", async () => {
    mockUpdateReturning.mockResolvedValue([]);

    const response = await POST();

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Session not found or expired");
  });

  it("atomically rotates the token and returns the new one", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBe(64); // 32 bytes hex
    expect(response.cookies.get("adsagent_token")?.value).toBe(body.token);
  });
});
