import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectLimitMock } = vi.hoisted(() => ({
  selectLimitMock: vi.fn(),
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
    _resetFirstWriteCacheForTests();
  });

  it("skips when user has prior successful writes", async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 42 }]); // prior write exists

    await maybeFireRedditFirstWrite({ userId: "user-1", justInsertedId: 100 });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("fires Lead with stable conversionId on first write", async () => {
    selectLimitMock
      .mockResolvedValueOnce([]) // no prior writes
      .mockResolvedValueOnce([{ googleEmail: "a@b.com" }]); // session lookup

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

  it("fires even when session email is unavailable", async () => {
    selectLimitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // no matching session

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
    selectLimitMock
      .mockResolvedValueOnce([{ id: 42 }]) // first call: prior write exists
      .mockResolvedValueOnce([]); // session (same Promise.all batch)

    await maybeFireRedditFirstWrite({ userId: "user-cache", justInsertedId: 1 });
    expect(selectLimitMock).toHaveBeenCalledTimes(2);

    await maybeFireRedditFirstWrite({ userId: "user-cache", justInsertedId: 2 });
    await maybeFireRedditFirstWrite({ userId: "user-cache", justInsertedId: 3 });
    expect(selectLimitMock).toHaveBeenCalledTimes(2); // still 2 — cache hit
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
