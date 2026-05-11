import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { opsLimitMock, attribLimitMock, getUserEmailMock, uploadMock } =
  vi.hoisted(() => ({
    opsLimitMock: vi.fn(),
    attribLimitMock: vi.fn(),
    getUserEmailMock: vi.fn(),
    uploadMock: vi.fn(),
  }));

vi.mock("@/lib/auth/get-user-email", () => ({
  getUserEmail: getUserEmailMock,
}));

vi.mock("@/lib/google-ads/campaign-ops", () => ({
  uploadClickConversions: uploadMock,
}));

vi.mock("@/lib/db", () => {
  const opsChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn((...args: unknown[]) => opsLimitMock(...args)),
  };
  const attribChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn((...args: unknown[]) => attribLimitMock(...args)),
  };
  let callCount = 0;
  const db = () => ({
    select: vi.fn(() => {
      callCount += 1;
      return callCount % 2 === 1 ? opsChain : attribChain;
    }),
  });
  return {
    db,
    schema: {
      operations: {
        id: "ops.id",
        userId: "ops.userId",
        opType: "ops.opType",
        success: "ops.success",
      },
      userAttribution: {
        userId: "attrib.userId",
        gclid: "attrib.gclid",
      },
    },
  };
});

const ORIGINAL_ENV = { ...process.env };

import {
  _resetGoogleAdsFirstWriteCacheForTests,
  maybeFireGoogleAdsFirstWrite,
} from "../google-ads-first-write";

describe("maybeFireGoogleAdsFirstWrite", () => {
  beforeEach(() => {
    opsLimitMock.mockReset();
    attribLimitMock.mockReset();
    getUserEmailMock.mockReset();
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({
      success: true,
      action: "upload_click_conversions",
      totalUploaded: 1,
      successCount: 1,
      failureCount: 0,
      partialErrors: [],
    });
    _resetGoogleAdsFirstWriteCacheForTests();

    process.env.KEYWORD_API_REFRESH_TOKEN = "system-refresh-token";
    process.env.NOTFAIR_FIRST_WRITE_CONVERSION_ACTION_ID = "7556563874";
    // No NOTFAIR_OWN_GADS_CUSTOMER_ID — verifies the hardcoded default fires.
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uploads a conversion with gclid + hashedEmail on first write", async () => {
    opsLimitMock.mockResolvedValueOnce([]); // no prior writes
    attribLimitMock.mockResolvedValueOnce([{ gclid: "EAIaIQobChMI-test" }]);
    getUserEmailMock.mockResolvedValueOnce("Alice@Example.com");

    await maybeFireGoogleAdsFirstWrite({
      userId: "user-1",
      justInsertedId: 100,
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [auth, actionId, conversions] = uploadMock.mock.calls[0];
    expect(auth.customerId).toBe("3251706605");
    expect(auth.refreshToken).toBe("system-refresh-token");
    expect(actionId).toBe("7556563874");
    expect(conversions).toHaveLength(1);
    expect(conversions[0]).toMatchObject({
      gclid: "EAIaIQobChMI-test",
      orderId: "first-write-user-1",
      conversionValue: 1.0,
      currencyCode: "USD",
    });
    // SHA-256("alice@example.com") — lowercased + trimmed
    expect(conversions[0].hashedEmail).toBe(
      "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976",
    );
    expect(conversions[0].conversionDateTime).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("uploads with hashedEmail only when no gclid is stored (organic signup)", async () => {
    opsLimitMock.mockResolvedValueOnce([]);
    attribLimitMock.mockResolvedValueOnce([{ gclid: null }]);
    getUserEmailMock.mockResolvedValueOnce("bob@example.com");

    await maybeFireGoogleAdsFirstWrite({
      userId: "user-organic",
      justInsertedId: 200,
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [, , conversions] = uploadMock.mock.calls[0];
    expect(conversions[0].gclid).toBeUndefined();
    expect(conversions[0].hashedEmail).toBeDefined();
    expect(conversions[0].orderId).toBe("first-write-user-organic");
  });

  it("skips when user has prior successful writes", async () => {
    opsLimitMock.mockResolvedValueOnce([{ id: 42 }]); // prior write exists
    attribLimitMock.mockResolvedValueOnce([{ gclid: "g" }]);
    getUserEmailMock.mockResolvedValue("a@b.com");

    await maybeFireGoogleAdsFirstWrite({
      userId: "user-2",
      justInsertedId: 100,
    });

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("skips when there's no gclid and no email — nothing to attribute on", async () => {
    opsLimitMock.mockResolvedValueOnce([]);
    attribLimitMock.mockResolvedValueOnce([{ gclid: null }]);
    getUserEmailMock.mockResolvedValueOnce(null);

    await maybeFireGoogleAdsFirstWrite({
      userId: "user-no-attrib",
      justInsertedId: 300,
    });

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("no-ops silently when system credentials aren't configured", async () => {
    delete process.env.KEYWORD_API_REFRESH_TOKEN;

    await maybeFireGoogleAdsFirstWrite({
      userId: "user-no-env",
      justInsertedId: 400,
    });

    expect(opsLimitMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("short-circuits repeated calls for the same user (process cache)", async () => {
    opsLimitMock.mockResolvedValueOnce([{ id: 42 }]);
    attribLimitMock.mockResolvedValueOnce([{ gclid: "g" }]);
    getUserEmailMock.mockResolvedValue("a@b.com");

    await maybeFireGoogleAdsFirstWrite({
      userId: "user-cache",
      justInsertedId: 1,
    });
    expect(opsLimitMock).toHaveBeenCalledTimes(1);

    await maybeFireGoogleAdsFirstWrite({
      userId: "user-cache",
      justInsertedId: 2,
    });
    await maybeFireGoogleAdsFirstWrite({
      userId: "user-cache",
      justInsertedId: 3,
    });
    expect(opsLimitMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("swallows db errors without throwing", async () => {
    opsLimitMock.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      maybeFireGoogleAdsFirstWrite({ userId: "u", justInsertedId: 1 }),
    ).resolves.toBeUndefined();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("logs (but doesn't throw) when upload returns a failure", async () => {
    opsLimitMock.mockResolvedValueOnce([]);
    attribLimitMock.mockResolvedValueOnce([{ gclid: "g" }]);
    getUserEmailMock.mockResolvedValueOnce("a@b.com");
    uploadMock.mockResolvedValueOnce({
      success: false,
      action: "upload_click_conversions",
      totalUploaded: 1,
      successCount: 0,
      failureCount: 1,
      partialErrors: [{ index: 0, message: "Invalid gclid" }],
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      maybeFireGoogleAdsFirstWrite({ userId: "u-fail", justInsertedId: 9 }),
    ).resolves.toBeUndefined();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
