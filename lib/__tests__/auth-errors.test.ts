import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR_MESSAGES,
  classifyAccountLoadError,
  isNoAdsAccountError,
  isScopeError,
} from "@/lib/auth-errors";

describe("classifyAccountLoadError", () => {
  it("maps the real Google Ads API 'not associated with any Ads accounts' message to NO_ACCOUNTS", () => {
    // Captured live 2026-05-01 from listAccessibleCustomers when the user's
    // Google identity has never been linked to any Google Ads customer.
    const raw =
      "The Google account (@gmail.com user) that generated the OAuth access tokens is not associated with any Ads accounts. Create a new account, or add the Google account to an existing Ads account.";
    expect(classifyAccountLoadError(raw)).toBe(AUTH_ERROR_MESSAGES.NO_ACCOUNTS);
  });

  it("maps PERMISSION_DENIED-style messages to NO_ACCOUNTS", () => {
    expect(
      classifyAccountLoadError("USER_PERMISSION_DENIED: missing access"),
    ).toBe(AUTH_ERROR_MESSAGES.NO_ACCOUNTS);
    expect(
      classifyAccountLoadError("The caller does not have permission"),
    ).toBe(AUTH_ERROR_MESSAGES.NO_ACCOUNTS);
  });

  it("maps insufficient-scopes to SCOPE_INSUFFICIENT, not NO_ACCOUNTS", () => {
    expect(
      classifyAccountLoadError(
        "Request had insufficient authentication scopes",
      ),
    ).toBe(AUTH_ERROR_MESSAGES.SCOPE_INSUFFICIENT);
  });

  it("falls back to LOAD_ACCOUNTS_GENERIC for unrecognized errors", () => {
    expect(classifyAccountLoadError("Server unavailable")).toBe(
      AUTH_ERROR_MESSAGES.LOAD_ACCOUNTS_GENERIC,
    );
  });
});

describe("isNoAdsAccountError", () => {
  it("matches case-insensitively", () => {
    expect(
      isNoAdsAccountError(
        "is NOT ASSOCIATED with any Ads accounts. Create a new account",
      ),
    ).toBe(true);
  });
});

describe("isScopeError", () => {
  it("returns true for the canonical Google scope-error phrase", () => {
    expect(isScopeError("insufficient authentication scopes")).toBe(true);
  });
  it("returns false for other errors", () => {
    expect(isScopeError("not associated with any ads accounts")).toBe(false);
  });
});
