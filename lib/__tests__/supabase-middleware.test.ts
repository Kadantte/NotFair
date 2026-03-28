import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { updateSession } from "@/lib/supabase/middleware";

function makeRequest(pathname: string, token?: string): NextRequest {
  const headers = new Headers();

  if (token) {
    headers.set("cookie", `${COOKIE_NAMES.token}=${token}`);
  }

  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    headers,
  });
}

describe("Supabase middleware — updateSession", () => {
  beforeEach(() => {
    // Reserved for future middleware mocks.
  });

  describe("route protection", () => {
    it("redirects unauthenticated user from /campaigns to /connect", async () => {
      const response = await updateSession(makeRequest("/campaigns"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/connect");
    });

    it("redirects unauthenticated user from /tools to /connect", async () => {
      const response = await updateSession(makeRequest("/tools"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/connect");
    });

    it("redirects unauthenticated user from /chat to /connect", async () => {
      const response = await updateSession(makeRequest("/chat"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/connect");
    });

    it("redirects unauthenticated user from /campaigns/123 to /connect", async () => {
      const response = await updateSession(makeRequest("/campaigns/123"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/connect");
    });

    it("allows authenticated user through to /campaigns", async () => {
      const response = await updateSession(makeRequest("/campaigns", "test-token"));

      expect(response.status).toBe(200);
    });

    it("allows authenticated user through to /chat", async () => {
      const response = await updateSession(makeRequest("/chat", "test-token"));

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
      const response = await updateSession(makeRequest("/login", "test-token"));

      expect(response.status).toBe(200);
    });

    it("redirects protected routes to the connect screen without a next param", async () => {
      const response = await updateSession(makeRequest("/campaigns/456/edit"));

      const location = response.headers.get("location") ?? "";
      expect(location).toContain("/connect");
      expect(location).not.toContain("next=");
    });
  });
});
