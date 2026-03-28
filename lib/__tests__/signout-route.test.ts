import { describe, it, expect, vi, beforeEach } from "vitest";
import { COOKIE_NAMES } from "@/lib/auth-cookies";

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
    expect(setCookie).toContain(`${COOKIE_NAMES.customer}=;`);
  });
});
