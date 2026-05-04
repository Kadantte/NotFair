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
vi.mock("@/lib/x-capi", () => ({
  sendXConversion: sendMock,
}));

import {
  _resetXFirstWriteCacheForTests,
  maybeFireXFirstWrite,
} from "../x-first-write";

describe("maybeFireXFirstWrite", () => {
  beforeEach(() => {
    selectLimitMock.mockReset();
    sendMock.mockReset();
    _resetXFirstWriteCacheForTests();
  });

  it("skips when user has prior successful writes", async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 42 }]);

    await maybeFireXFirstWrite({ userId: "user-1", justInsertedId: 100 });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("fires the first-write conversion with stable conversionId", async () => {
    selectLimitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ googleEmail: "a@b.com" }]);

    await maybeFireXFirstWrite({ userId: "user-1", justInsertedId: 100 });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      conversionId: "first-write-user-1",
      email: "a@b.com",
      valueDecimal: 1.0,
      currency: "USD",
    });
  });

  it("delegates even when session email is unavailable", async () => {
    selectLimitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await maybeFireXFirstWrite({ userId: "user-2", justInsertedId: 50 });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversionId: "first-write-user-2",
        email: null,
      }),
    );
  });

  it("short-circuits subsequent calls for the same user", async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 42 }])
      .mockResolvedValueOnce([]);

    await maybeFireXFirstWrite({ userId: "user-cache", justInsertedId: 1 });
    expect(selectLimitMock).toHaveBeenCalledTimes(2);

    await maybeFireXFirstWrite({ userId: "user-cache", justInsertedId: 2 });
    await maybeFireXFirstWrite({ userId: "user-cache", justInsertedId: 3 });
    expect(selectLimitMock).toHaveBeenCalledTimes(2);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("swallows db errors without throwing", async () => {
    selectLimitMock.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      maybeFireXFirstWrite({ userId: "u", justInsertedId: 1 }),
    ).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
