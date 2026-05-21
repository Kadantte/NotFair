import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
}));

vi.mock("@/lib/google-ads/campaign-ops", () => ({
  uploadClickConversions: uploadMock,
}));

const ORIGINAL_ENV = { ...process.env };

import {
  _resetGoogleAdsSignupCacheForTests,
  maybeFireGoogleAdsSignup,
} from "../google-ads-signup";

describe("maybeFireGoogleAdsSignup", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({
      success: true,
      action: "upload_click_conversions",
      totalUploaded: 1,
      successCount: 1,
      failureCount: 0,
      partialErrors: [],
    });
    _resetGoogleAdsSignupCacheForTests();

    process.env.KEYWORD_API_REFRESH_TOKEN = "system-refresh-token";
    process.env.NOTFAIR_SIGNUP_CONVERSION_ACTION_ID = "test-conv-action-id";
    // No NOTFAIR_OWN_GADS_CUSTOMER_ID — verifies the hardcoded default fires.
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uploads a conversion with gclid + hashedEmail when both present", async () => {
    await maybeFireGoogleAdsSignup({
      userId: "user-1",
      email: "Alice@Example.com",
      gclid: "EAIaIQobChMI-test",
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [auth, actionId, conversions] = uploadMock.mock.calls[0];
    expect(auth.customerId).toBe("3251706605");
    expect(auth.refreshToken).toBe("system-refresh-token");
    expect(actionId).toBe("test-conv-action-id");
    expect(conversions).toHaveLength(1);
    expect(conversions[0]).toMatchObject({
      gclid: "EAIaIQobChMI-test",
      orderId: "signup-user-1",
      conversionValue: 1.0,
      currencyCode: "USD",
    });
    // SHA-256("alice@example.com") — normalized to lowercase + trimmed.
    expect(conversions[0].hashedEmail).toBe(
      "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976",
    );
  });

  it("uploads with only hashedEmail when gclid is missing (organic signup)", async () => {
    await maybeFireGoogleAdsSignup({
      userId: "user-2",
      email: "bob@example.com",
      gclid: null,
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [, , conversions] = uploadMock.mock.calls[0];
    expect(conversions[0].gclid).toBeUndefined();
    expect(conversions[0].hashedEmail).toBeTruthy();
    expect(conversions[0].orderId).toBe("signup-user-2");
  });

  it("uploads with only gclid when email is missing", async () => {
    await maybeFireGoogleAdsSignup({
      userId: "user-3",
      email: null,
      gclid: "EAIaIQobChMI-other",
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [, , conversions] = uploadMock.mock.calls[0];
    expect(conversions[0].gclid).toBe("EAIaIQobChMI-other");
    expect(conversions[0].hashedEmail).toBeUndefined();
  });

  it("skips upload when both gclid and email are missing", async () => {
    await maybeFireGoogleAdsSignup({
      userId: "user-4",
      email: null,
      gclid: null,
    });

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("skips upload when gclid is whitespace-only and email is null", async () => {
    await maybeFireGoogleAdsSignup({
      userId: "user-4b",
      email: null,
      gclid: "   ",
    });

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("no-ops silently when KEYWORD_API_REFRESH_TOKEN is unset (dev/CI)", async () => {
    delete process.env.KEYWORD_API_REFRESH_TOKEN;

    await maybeFireGoogleAdsSignup({
      userId: "user-5",
      email: "alice@example.com",
      gclid: "EAIaIQobChMI-test",
    });

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("dedupes via process cache on repeated calls for same userId", async () => {
    await maybeFireGoogleAdsSignup({
      userId: "user-6",
      email: "alice@example.com",
      gclid: "EAIaIQobChMI-test",
    });
    await maybeFireGoogleAdsSignup({
      userId: "user-6",
      email: "alice@example.com",
      gclid: "EAIaIQobChMI-test",
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("logs but does not throw when upload fails", async () => {
    uploadMock.mockResolvedValueOnce({
      success: false,
      action: "upload_click_conversions",
      totalUploaded: 0,
      successCount: 0,
      failureCount: 1,
      partialErrors: [],
      error: "boom",
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      maybeFireGoogleAdsSignup({
        userId: "user-fail",
        email: "alice@example.com",
        gclid: null,
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[gads-signup] Upload failed:",
      "boom",
    );
    consoleSpy.mockRestore();
  });

  it("swallows thrown errors from uploadClickConversions", async () => {
    uploadMock.mockRejectedValueOnce(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      maybeFireGoogleAdsSignup({
        userId: "user-throw",
        email: "alice@example.com",
        gclid: null,
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[gads-signup] Failed to fire signup event:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
