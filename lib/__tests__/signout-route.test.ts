import { describe, it, expect, vi, beforeEach } from "vitest";
import { COOKIE_NAMES } from "@/lib/auth-cookies";

const mockGetAll = vi.fn(() => []);
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: mockGetAll,
  })),
}));

const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: mockSignOut,
    },
  })),
}));

import { POST } from "@/app/api/auth/signout/route";

describe("Sign-out route — POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("clears the app session cookies", async () => {
    const response = await POST();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(mockSignOut).toHaveBeenCalled();
    expect(setCookie).toContain(`${COOKIE_NAMES.token}=;`);
    // Legacy adsagent_customer cookie still actively cleared on sign-out so
    // browsers carrying it from older sessions shed it.
    expect(setCookie).toContain("adsagent_customer=;");
  });

  it("also clears the impersonate cookie on sign-out", async () => {
    const response = await POST();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(setCookie).toContain(`${COOKIE_NAMES.impersonate}=;`);
  });
});
