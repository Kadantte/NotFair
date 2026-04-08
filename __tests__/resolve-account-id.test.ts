import { describe, it, expect } from "vitest";
import { resolveAccountId, authForAccount, type AuthContext } from "@/lib/google-ads";

const baseAuth: AuthContext = {
  refreshToken: "test-token",
  customerId: "111-111-1111",
  customerIds: [
    { id: "111-111-1111", name: "Pet Hotel" },
    { id: "222-222-2222", name: "Pet Travel" },
    { id: "333-333-3333", name: "Pet Grooming" },
  ],
};

describe("resolveAccountId", () => {
  it("returns default customerId when no accountId provided", () => {
    expect(resolveAccountId(baseAuth)).toBe("111-111-1111");
  });

  it("returns default customerId when accountId is undefined", () => {
    expect(resolveAccountId(baseAuth, undefined)).toBe("111-111-1111");
  });

  it("returns the provided accountId when it exists in customerIds", () => {
    expect(resolveAccountId(baseAuth, "222-222-2222")).toBe("222-222-2222");
    expect(resolveAccountId(baseAuth, "333-333-3333")).toBe("333-333-3333");
  });

  it("throws when accountId is not in customerIds", () => {
    expect(() => resolveAccountId(baseAuth, "999-999-9999")).toThrow("Account 999-999-9999 is not connected");
  });

  it("throws when customerIds is undefined", () => {
    const auth: AuthContext = { refreshToken: "t", customerId: "111" };
    expect(() => resolveAccountId(auth, "222")).toThrow("Account 222 is not connected");
  });

  it("throws when customerIds is empty", () => {
    const auth: AuthContext = { refreshToken: "t", customerId: "111", customerIds: [] };
    expect(() => resolveAccountId(auth, "222")).toThrow("Account 222 is not connected");
  });
});

describe("authForAccount", () => {
  it("returns auth with overridden customerId for valid accountId", () => {
    const result = authForAccount(baseAuth, "222-222-2222");
    expect(result.customerId).toBe("222-222-2222");
    expect(result.refreshToken).toBe("test-token");
    expect(result.customerIds).toBe(baseAuth.customerIds);
  });

  it("throws when accountId not valid", () => {
    expect(() => authForAccount(baseAuth, "999-999-9999")).toThrow("Account 999-999-9999 is not connected");
  });

  it("returns auth unchanged when no accountId provided", () => {
    const result = authForAccount(baseAuth);
    expect(result.customerId).toBe("111-111-1111");
  });

  it("does not mutate the original auth object", () => {
    authForAccount(baseAuth, "222-222-2222");
    expect(baseAuth.customerId).toBe("111-111-1111");
  });
});
