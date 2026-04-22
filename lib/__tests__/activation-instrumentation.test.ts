import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock db() — the helper does a single SELECT.limit() chain; return what we
// configure per-test via `priorRowsMock`.
const { priorRowsMock, trackMock } = vi.hoisted(() => ({
  priorRowsMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const limitFn = vi.fn(async (...args: unknown[]) => priorRowsMock(...args));
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
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
      },
    },
  };
});

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: (...args: unknown[]) => trackMock(...args),
  flushServerEvents: vi.fn(),
}));

import { maybeFireFirstToolCallEvent } from "@/lib/db/tracking";

describe("maybeFireFirstToolCallEvent", () => {
  beforeEach(() => {
    priorRowsMock.mockReset();
    trackMock.mockReset();
  });

  it("fires first_tool_call_attempted with correct props on a user's first op", async () => {
    priorRowsMock.mockResolvedValueOnce([]); // no prior rows → this IS the first

    await maybeFireFirstToolCallEvent({
      userId: "user-1",
      toolName: "list_campaigns",
      success: 1,
      errorClass: null,
      clientSource: "claude-code",
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("user-1", "first_tool_call_attempted", {
      tool_name: "list_campaigns",
      client_source: "claude-code",
      success: true,
      error_class: null,
    });
  });

  it("also fires first_tool_call_error when the first op failed", async () => {
    priorRowsMock.mockResolvedValueOnce([]);

    await maybeFireFirstToolCallEvent({
      userId: "user-2",
      toolName: "pause_campaign",
      success: 0,
      errorClass: "WRITE_REJECTED",
      clientSource: "connector",
    });

    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock).toHaveBeenNthCalledWith(1, "user-2", "first_tool_call_attempted", {
      tool_name: "pause_campaign",
      client_source: "connector",
      success: false,
      error_class: "WRITE_REJECTED",
    });
    expect(trackMock).toHaveBeenNthCalledWith(2, "user-2", "first_tool_call_error", {
      tool_name: "pause_campaign",
      client_source: "connector",
      error_class: "WRITE_REJECTED",
    });
  });

  it("does NOT fire when the user already has prior operations", async () => {
    priorRowsMock.mockResolvedValueOnce([{ id: 42 }]); // a prior row exists

    await maybeFireFirstToolCallEvent({
      userId: "user-3",
      toolName: "list_campaigns",
      success: 1,
      errorClass: null,
      clientSource: null,
    });

    expect(trackMock).not.toHaveBeenCalled();
  });

  it("does NOT fire first_tool_call_error when the first op succeeded", async () => {
    priorRowsMock.mockResolvedValueOnce([]);

    await maybeFireFirstToolCallEvent({
      userId: "user-happy",
      toolName: "get_account_info",
      success: 1,
      errorClass: null,
      clientSource: null,
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      "user-happy",
      "first_tool_call_attempted",
      expect.any(Object),
    );
  });

  it.each([null, undefined, ""] as const)(
    "no-ops and does not crash on falsy userId (%p)",
    async (userId) => {
      await expect(
        maybeFireFirstToolCallEvent({
          userId,
          toolName: "list_campaigns",
          success: 1,
          errorClass: null,
          clientSource: null,
        }),
      ).resolves.toBeUndefined();

      expect(priorRowsMock).not.toHaveBeenCalled();
      expect(trackMock).not.toHaveBeenCalled();
    },
  );

  it("swallows DB errors without throwing", async () => {
    priorRowsMock.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      maybeFireFirstToolCallEvent({
        userId: "user-db-err",
        toolName: "list_campaigns",
        success: 1,
        errorClass: null,
        clientSource: null,
      }),
    ).resolves.toBeUndefined();

    expect(trackMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
