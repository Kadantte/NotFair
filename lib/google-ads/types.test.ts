import { describe, expect, it } from "vitest";
import { authForAccount, type AuthContext } from "./types";

// Mixed-source session: direct account marked with explicit loginCustomerId: null,
// two manager-routed accounts with different MCC ids. This is the shape new code
// writes — every entry carries an explicit loginCustomerId field.
const mixedAuth: AuthContext = {
  refreshToken: "rt",
  customerId: "1111",
  loginCustomerId: "9999",
  customerIds: [
    { id: "1111", name: "Direct A", loginCustomerId: null },
    { id: "2222", name: "Manager-routed B", loginCustomerId: "9999" },
    { id: "3333", name: "Other-manager C", loginCustomerId: "8888" },
  ],
};

describe("authForAccount", () => {
  it("uses the account's own loginCustomerId when targeting a manager-routed account", () => {
    const result = authForAccount(mixedAuth, "3333");
    expect(result.customerId).toBe("3333");
    expect(result.loginCustomerId).toBe("8888");
  });

  it("clears session loginCustomerId when target entry has explicit null (direct access)", () => {
    // Without this, a direct account in a mixed session would inherit the
    // primary account's manager and Google Ads would reject the call.
    const result = authForAccount(mixedAuth, "1111");
    expect(result.customerId).toBe("1111");
    expect(result.loginCustomerId).toBeNull();
  });

  it("falls back to session-level loginCustomerId when target entry has no loginCustomerId key (legacy data)", () => {
    // Old code wrote customerIds entries without the loginCustomerId field.
    // For those sessions the session-level value is the only source of truth
    // and must be honored, otherwise legacy single-account-with-manager
    // sessions would silently break on every API call.
    const legacyEntries: AuthContext = {
      ...mixedAuth,
      customerIds: [{ id: "1111", name: "Legacy A" }],
    };
    const result = authForAccount(legacyEntries, "1111");
    expect(result.loginCustomerId).toBe("9999");
  });

  it("falls back to session-level loginCustomerId when customerIds is undefined entirely", () => {
    const noList: AuthContext = { ...mixedAuth, customerIds: undefined };
    const result = authForAccount(noList);
    expect(result.customerId).toBe("1111");
    expect(result.loginCustomerId).toBe("9999");
  });

  it("falls back to default customerId when accountId is omitted", () => {
    const result = authForAccount(mixedAuth);
    expect(result.customerId).toBe("1111");
    // Default customerId is "1111" (direct, explicit null) so cleared.
    expect(result.loginCustomerId).toBeNull();
  });

  it("throws when accountId isn't in the connected set", () => {
    expect(() => authForAccount(mixedAuth, "9999")).toThrow(/not connected/);
  });
});
