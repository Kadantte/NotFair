import { describe, it, expect } from "vitest";
import { ADWORDS_SCOPE, evaluateScopeGrant } from "@/lib/oauth-scope-retry";

const baseArgs = {
  origin: "https://www.notfair.co",
  next: "/connect",
  popup: false,
};

describe("evaluateScopeGrant", () => {
  describe("scope granted", () => {
    it("returns granted when adwords scope is present", () => {
      const result = evaluateScopeGrant({
        ...baseArgs,
        grantedScopesParam: `openid email profile ${ADWORDS_SCOPE}`,
        hasScopeRetry: false,
      });
      expect(result).toEqual({ outcome: "granted" });
    });

    it("returns granted when adwords is the only scope", () => {
      const result = evaluateScopeGrant({
        ...baseArgs,
        grantedScopesParam: ADWORDS_SCOPE,
        hasScopeRetry: false,
      });
      expect(result).toEqual({ outcome: "granted" });
    });

    it("treats omitted scope param as granted (RFC 6749 §5.1)", () => {
      // When Google's token endpoint omits `scope`, the spec says the granted
      // set matches the requested set. Ignoring this would cause us to falsely
      // flag perfectly-valid logins as scope denials.
      const result = evaluateScopeGrant({
        ...baseArgs,
        grantedScopesParam: undefined,
        hasScopeRetry: false,
      });
      expect(result).toEqual({ outcome: "granted" });
    });

    it("treats omitted scope param as granted even on the retry round-trip", () => {
      const result = evaluateScopeGrant({
        ...baseArgs,
        grantedScopesParam: undefined,
        hasScopeRetry: true,
      });
      expect(result).toEqual({ outcome: "granted" });
    });
  });

  describe("first denial — auto-retry", () => {
    it("returns retry with a /api/auth/signin URL carrying scope_retry=1", () => {
      const result = evaluateScopeGrant({
        ...baseArgs,
        grantedScopesParam: "openid email profile",
        hasScopeRetry: false,
      });
      expect(result.outcome).toBe("retry");
      if (result.outcome !== "retry") throw new Error("unreachable");

      const url = new URL(result.retryUrl);
      expect(url.origin).toBe("https://www.notfair.co");
      expect(url.pathname).toBe("/api/auth/signin");
      expect(url.searchParams.get("scope_retry")).toBe("1");
      expect(url.searchParams.get("next")).toBe("/connect");
      expect(url.searchParams.get("popup")).toBeNull();
    });

    it("preserves the original `next` so the user lands where they intended", () => {
      const result = evaluateScopeGrant({
        ...baseArgs,
        next: "/audit?ref=email",
        grantedScopesParam: "openid email profile",
        hasScopeRetry: false,
      });
      if (result.outcome !== "retry") throw new Error("expected retry");
      const url = new URL(result.retryUrl);
      expect(url.searchParams.get("next")).toBe("/audit?ref=email");
    });

    it("forwards popup=1 when the original flow was a popup", () => {
      const result = evaluateScopeGrant({
        ...baseArgs,
        popup: true,
        grantedScopesParam: "openid email profile",
        hasScopeRetry: false,
      });
      if (result.outcome !== "retry") throw new Error("expected retry");
      const url = new URL(result.retryUrl);
      expect(url.searchParams.get("popup")).toBe("1");
    });
  });

  describe("second denial — fail without looping", () => {
    it("returns fail when scope is missing AND we already retried", () => {
      // This is the load-bearing case: if this returned "retry" instead, the
      // user would bounce between Google's consent screen and our callback
      // forever. The whole point of `scope_retry` in OAuth state is to
      // remember that we already tried once.
      const result = evaluateScopeGrant({
        ...baseArgs,
        grantedScopesParam: "openid email profile",
        hasScopeRetry: true,
      });
      expect(result).toEqual({ outcome: "fail" });
    });

    it("returns fail regardless of popup flag on second denial", () => {
      const popupResult = evaluateScopeGrant({
        ...baseArgs,
        popup: true,
        grantedScopesParam: "openid email profile",
        hasScopeRetry: true,
      });
      const noPopupResult = evaluateScopeGrant({
        ...baseArgs,
        popup: false,
        grantedScopesParam: "openid email profile",
        hasScopeRetry: true,
      });
      expect(popupResult).toEqual({ outcome: "fail" });
      expect(noPopupResult).toEqual({ outcome: "fail" });
    });
  });
});
