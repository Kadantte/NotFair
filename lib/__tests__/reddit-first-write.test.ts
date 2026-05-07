import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectLimitMock, getUserEmailMock } = vi.hoisted(() => ({
  selectLimitMock: vi.fn(),
  getUserEmailMock: vi.fn(),
}));

vi.mock("@/lib/auth/get-user-email", () => ({
  getUserEmail: getUserEmailMock,
}));

vi.mock("@/lib/db", () => {
  const limitFn = vi.fn((...args: unknown[]) => selectLimitMock(...args));
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: limitFn,
    select: vi.fn().mockReturnThis(),
  };
  const db = () => ({
    select: vi.fn(() => chain),
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
      mcpSessions: {
        googleEmail: "sess.googleEmail",
        userId: "sess.userId",
        createdAt: "sess.createdAt",
      },
    },
  };
});

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@/lib/reddit-capi", () => ({
  sendRedditConversion: sendMock,
}));

import {
  _resetFirstWriteCacheForTests,
  maybeFireRedditFirstWrite,
} from "../reddit-first-write";

describe("maybeFireRedditFirstWrite", () => {
  beforeEach(() => {
    selectLimitMock.mockReset();
    sendMock.mockReset();
    getUserEmailMock.mockReset();
    _resetFirstWriteCacheForTests();
  });

  it("skips when user has prior successful writes", async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 42 }]); // prior write exists
    getUserEmailMock.mockResolvedValue("a@b.com");

    await maybeFireRedditFirstWrite({ userId: "user-1", justInsertedId: 100 });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("fires Lead with stable conversionId on first write", async () => {
    selectLimitMock.mockResolvedValueOnce([]); // no prior writes
    getUserEmailMock.mockResolvedValueOnce("a@b.com");

    await maybeFireRedditFirstWrite({ userId: "user-1", justInsertedId: 100 });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      trackingType: "Lead",
      conversionId: "first-write-user-1",
      email: "a@b.com",
      externalId: "user-1",
      valueDecimal: 1.0,
      currency: "USD",
    });
  });

  it("fires even when email is unavailable", async () => {
    selectLimitMock.mockResolvedValueOnce([]);
    getUserEmailMock.mockResolvedValueOnce(null);

    await maybeFireRedditFirstWrite({ userId: "user-2", justInsertedId: 50 });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingType: "Lead",
        conversionId: "first-write-user-2",
        email: null,
        externalId: "user-2",
      }),
    );
  });

  it("short-circuits subsequent calls for the same user (no DB queries)", async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 42 }]); // first call: prior write exists
    getUserEmailMock.mockResolvedValue("a@b.com");

    await maybeFireRedditFirstWrite({ userId: "user-cache", justInsertedId: 1 });
    expect(selectLimitMock).toHaveBeenCalledTimes(1);

    await maybeFireRedditFirstWrite({ userId: "user-cache", justInsertedId: 2 });
    await maybeFireRedditFirstWrite({ userId: "user-cache", justInsertedId: 3 });
    expect(selectLimitMock).toHaveBeenCalledTimes(1); // still 1 — cache hit
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("swallows db errors without throwing", async () => {
    selectLimitMock.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      maybeFireRedditFirstWrite({ userId: "u", justInsertedId: 1 }),
    ).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
