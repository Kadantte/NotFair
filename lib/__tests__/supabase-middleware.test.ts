import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// refreshSupabaseSession needs Supabase env vars to build a client; stub it
// out so the middleware tests stay env-independent (they only care about the
// route-protection branching).
vi.mock("@/lib/supabase/refresh-session", () => ({
  refreshSupabaseSession: vi.fn(async (request: NextRequest) =>
    NextResponse.next({ request }),
  ),
}));

import { updateSession } from "@/lib/supabase/middleware";

type CookieKV = { name: string; value: string };

function makeRequest(pathname: string, cookies: CookieKV[] = []): NextRequest {
  const headers = new Headers();
  if (cookies.length > 0) {
    headers.set("cookie", cookies.map((c) => `${c.name}=${c.value}`).join("; "));
  }
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    headers,
  });
}

function withSupabaseSession(): CookieKV[] {
  // The exact name format Supabase uses is `sb-<project-ref>-auth-token`;
  // the middleware only checks the `sb-` prefix.
  return [{ name: "sb-project-auth-token", value: "abc" }];
}

describe("Supabase middleware — updateSession", () => {
  beforeEach(() => {
    // Reserved for future middleware mocks.
  });

  describe("route protection", () => {
    it("redirects unauthenticated user from /campaigns to /login", async () => {
      const response = await updateSession(makeRequest("/campaigns"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
    });

    it("redirects unauthenticated user from /tools to /login", async () => {
      const response = await updateSession(makeRequest("/tools"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
    });

    it("redirects unauthenticated user from /chat to /login", async () => {
      const response = await updateSession(makeRequest("/chat"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
    });

    it("redirects unauthenticated user from /campaigns/123 to /login", async () => {
      const response = await updateSession(makeRequest("/campaigns/123"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
    });

    it("allows Supabase-authenticated (sb-* cookie) user through to /campaigns", async () => {
      const response = await updateSession(makeRequest("/campaigns", withSupabaseSession()));

      expect(response.status).toBe(200);
    });

    it("allows Supabase-authenticated user through to /operations", async () => {
      const response = await updateSession(makeRequest("/operations", withSupabaseSession()));

      expect(response.status).toBe(200);
    });

    it("allows Supabase-authenticated user through to /chat", async () => {
      const response = await updateSession(makeRequest("/chat", withSupabaseSession()));

      expect(response.status).toBe(200);
    });
  });

  describe("public routes", () => {
    it("allows unauthenticated user on /", async () => {
      const response = await updateSession(makeRequest("/"));

      expect(response.status).toBe(200);
    });

    it("allows unauthenticated user on /connect", async () => {
      const response = await updateSession(makeRequest("/connect"));

      expect(response.status).toBe(200);
    });

    it("allows unauthenticated user on /login", async () => {
      const response = await updateSession(makeRequest("/login"));

      expect(response.status).toBe(200);
    });
  });

  describe("redirect behavior", () => {
    it("does not redirect authenticated users away from /login", async () => {
      const response = await updateSession(makeRequest("/login", withSupabaseSession()));

      expect(response.status).toBe(200);
    });

    it("redirects protected routes to /login without a next param", async () => {
      const response = await updateSession(makeRequest("/campaigns/456/edit"));

      const location = response.headers.get("location") ?? "";
      expect(location).toContain("/login");
      expect(location).not.toContain("next=");
    });
  });
});
