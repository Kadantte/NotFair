import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock @supabase/ssr
const mockGetUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Set env vars before importing
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import { updateSession } from "@/lib/supabase/middleware";

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`));
}

describe("Supabase middleware — updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("route protection", () => {
    it("redirects unauthenticated user from /campaigns to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/campaigns"));

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("next=%2Fcampaigns");
    });

    it("redirects unauthenticated user from /tools to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/tools"));

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("next=%2Ftools");
    });

    it("redirects unauthenticated user from /chat to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/chat"));

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("next=%2Fchat");
    });

    it("redirects unauthenticated user from /campaigns/123 to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/campaigns/123"));

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("next=%2Fcampaigns%2F123");
    });

    it("allows authenticated user through to /campaigns", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-1", email: "test@example.com" } },
      });

      const response = await updateSession(makeRequest("/campaigns"));

      expect(response.status).toBe(200);
    });

    it("allows authenticated user through to /chat", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-1", email: "test@example.com" } },
      });

      const response = await updateSession(makeRequest("/chat"));

      expect(response.status).toBe(200);
    });
  });

  describe("public routes", () => {
    it("allows unauthenticated user on /", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/"));

      expect(response.status).toBe(200);
    });

    it("allows unauthenticated user on /connect", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/connect"));

      expect(response.status).toBe(200);
    });

    it("allows unauthenticated user on /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/login"));

      expect(response.status).toBe(200);
    });
  });

  describe("/login redirect for authenticated users", () => {
    it("redirects authenticated user from /login to /campaigns", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-1", email: "test@example.com" } },
      });

      const response = await updateSession(makeRequest("/login"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/campaigns");
    });
  });

  describe("next param preservation", () => {
    it("includes the original path in the next param", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const response = await updateSession(makeRequest("/campaigns/456/edit"));

      const location = response.headers.get("location") ?? "";
      expect(location).toContain("next=%2Fcampaigns%2F456%2Fedit");
    });
  });
});
