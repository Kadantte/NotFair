import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolAuth } from "@/lib/tools/execute";

// ─── Hoisted mocks ─────────────────────────────────────────────────
const {
  mockEnforceRateLimit,
  mockRecordOperation,
  mockLogChange,
  mockLogRead,
  mockInvalidateCache,
  mockTrackServerEvent,
  mockSyncAccountSnapshot,
} = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn(),
  mockRecordOperation: vi.fn(),
  mockLogChange: vi.fn(),
  mockLogRead: vi.fn(),
  mockInvalidateCache: vi.fn(),
  mockTrackServerEvent: vi.fn(),
  mockSyncAccountSnapshot: vi.fn(),
}));

vi.mock("@/lib/mcp/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp/rate-limit")>("@/lib/mcp/rate-limit");
  return {
    ...actual,
    enforceRateLimit: mockEnforceRateLimit,
    recordOperation: mockRecordOperation,
  };
});

vi.mock("@/lib/db/tracking", () => ({
  logChange: mockLogChange,
  logRead: mockLogRead,
  ERROR_CLASS: {
    THROWN: "THROWN",
    RATE_LIMIT: "RATE_LIMIT",
    WRITE_REJECTED: "WRITE_REJECTED",
    LOGGING: "LOGGING",
  },
}));

vi.mock("@/lib/google-ads", () => ({
  authForAccount: (auth: ToolAuth, accountId?: string) => ({ ...auth, customerId: accountId ?? auth.customerId }),
  invalidateCache: mockInvalidateCache,
  extractErrorMessage: (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try { return JSON.stringify(error); } catch { return "Unknown error"; }
  },
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock("@/lib/google-ads/sync-account", () => ({
  syncAccountSnapshot: mockSyncAccountSnapshot,
}));

import { execWrite, execRead } from "@/lib/tools/execute";
import type { WriteResult } from "@/lib/google-ads";
import { RateLimitError } from "@/lib/mcp/rate-limit";

const auth: ToolAuth = {
  refreshToken: "test-token",
  customerId: "cust-1",
  userId: "user-1",
  clientName: "test-client",
};

describe("execWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockLogChange.mockResolvedValue({ id: 42 });
    mockSyncAccountSnapshot.mockResolvedValue(undefined);
  });

  it("success path: rate limit → fn → invalidate → log → return changeId", async () => {
    const writeResult: WriteResult = {
      success: true,
      action: "pause_campaign",
      entityId: "camp-1",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    };
    const fn = vi.fn().mockResolvedValue(writeResult);

    const result = await execWrite(auth, "acct-1", "camp-1", fn, "test reason");

    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1");
    expect(fn).toHaveBeenCalled();
    expect(mockInvalidateCache).toHaveBeenCalledWith("acct-1");
    expect(mockLogChange).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "acct-1",
      userId: "user-1",
      campaignId: "camp-1",
      writeResult,
      reasoning: "test reason",
      clientSource: "test-client",
      telemetry: expect.objectContaining({
        errorClass: null,
        latencyMs: expect.any(Number),
        bytesOut: expect.any(Number),
      }),
    }));
    expect(mockRecordOperation).toHaveBeenCalledWith("user-1");
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "user-1", "ai_change_executed",
      expect.objectContaining({ tool_name: "pause_campaign", account_id: "acct-1" }),
    );
    expect(mockSyncAccountSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      refreshToken: "test-token",
      customerId: "acct-1",
    }));
    expect(result.success).toBe(true);
    expect(result.changeId).toBe(42);
  });

  it("does not refresh account snapshot for non-budget/campaign writes", async () => {
    const writeResult: WriteResult = {
      success: true,
      action: "pause_keyword",
      entityId: "kw-1",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    };
    const fn = vi.fn().mockResolvedValue(writeResult);

    await execWrite(auth, "acct-1", "camp-1", fn);

    expect(mockSyncAccountSnapshot).not.toHaveBeenCalled();
  });

  it("failure path (success:false): logs + records op (overcount policy), does NOT invalidate cache", async () => {
    const failResult: WriteResult = {
      success: false,
      action: "pause_keyword",
      entityId: "kw-1",
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      error: "Google rejected: invalid criterion",
    };
    const fn = vi.fn().mockResolvedValue(failResult);

    const result = await execWrite(auth, "acct-1", "camp-1", fn);

    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1");
    expect(fn).toHaveBeenCalled();
    // Cache NOT invalidated — nothing actually changed.
    expect(mockInvalidateCache).not.toHaveBeenCalled();
    // But operation IS logged and counted — err on the side of overcount vs Google's quota.
    expect(mockLogChange).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "acct-1",
      writeResult: failResult,
      clientSource: "test-client",
      telemetry: expect.objectContaining({ errorClass: "WRITE_REJECTED" }),
    }));
    expect(mockRecordOperation).toHaveBeenCalledWith("user-1");
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "user-1", "ai_change_failed",
      expect.objectContaining({
        tool_name: "pause_keyword",
        error: "Google rejected: invalid criterion",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.changeId).toBe(42);
  });

  it("options.overrideLatencyMs wins over measured fn() latency (bulk fan-out path)", async () => {
    // Bulk write handlers measure the real upstream API call themselves and
    // pass the latency to every fan-out execWrite invocation, since the
    // `fn = async () => r` stub itself resolves in microseconds.
    const writeResult: WriteResult = {
      success: true,
      action: "pause_keyword",
      entityId: "kw-1",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    };
    const fn = vi.fn().mockResolvedValue(writeResult);

    await execWrite(auth, "acct-1", "camp-1", fn, undefined, { overrideLatencyMs: 742 });

    expect(mockLogChange).toHaveBeenCalledWith(expect.objectContaining({
      telemetry: expect.objectContaining({ latencyMs: 742 }),
    }));
  });

  it("options.overrideLatencyMs is honored on the failure path too", async () => {
    const failResult: WriteResult = {
      success: false,
      action: "update_bid",
      entityId: "kw-1",
      beforeValue: "N/A",
      afterValue: "3500000",
      error: "Bid changes not supported for 3 strategy",
    };
    const fn = vi.fn().mockResolvedValue(failResult);

    await execWrite(auth, "acct-1", "camp-1", fn, undefined, { overrideLatencyMs: 501 });

    expect(mockLogChange).toHaveBeenCalledWith(expect.objectContaining({
      telemetry: expect.objectContaining({
        errorClass: "WRITE_REJECTED",
        latencyMs: 501,
      }),
    }));
  });

  it("throws from fn() propagate without counting; THROWN telemetry only when wrapped by a telemetry context", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network dropped"));

    await expect(execWrite(auth, "acct-1", "camp-1", fn)).rejects.toThrow("network dropped");

    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1");
    expect(mockInvalidateCache).not.toHaveBeenCalled();
    expect(mockLogChange).not.toHaveBeenCalled();
    expect(mockRecordOperation).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it("rate limit exceeded: throws before calling fn", async () => {
    mockEnforceRateLimit.mockRejectedValue(new RateLimitError(300, 300));
    const fn = vi.fn();

    await expect(execWrite(auth, "acct-1", "camp-1", fn)).rejects.toThrow(RateLimitError);

    expect(fn).not.toHaveBeenCalled();
    expect(mockInvalidateCache).not.toHaveBeenCalled();
    expect(mockLogChange).not.toHaveBeenCalled();
  });

  it("returns changeId null when logChange returns undefined", async () => {
    mockLogChange.mockResolvedValue(undefined);
    const writeResult: WriteResult = {
      success: true,
      action: "enable_keyword",
      entityId: "kw-1",
      beforeValue: "PAUSED",
      afterValue: "ENABLED",
    };
    const fn = vi.fn().mockResolvedValue(writeResult);

    const result = await execWrite(auth, "acct-1", null, fn);
    expect(result.changeId).toBeNull();
  });
});

describe("execRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockLogRead.mockResolvedValue(undefined);
  });

  it("success path: rate limit → fn → log read (fire-and-forget)", async () => {
    const data = [{ id: "camp-1", name: "Test Campaign" }];
    const fn = vi.fn().mockResolvedValue(data);

    const result = await execRead(auth, "acct-1", "list_campaigns", fn, "camp-1");

    // Rate limit checked
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1");

    // fn was called
    expect(fn).toHaveBeenCalled();

    expect(result).toEqual(data);
    // Logging + analytics are deferred to a microtask; flush before asserting.
    await new Promise<void>((r) => queueMicrotask(() => r()));

    expect(mockLogRead).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "acct-1",
      userId: "user-1",
      toolName: "list_campaigns",
      campaignId: "camp-1",
      clientSource: "test-client",
      telemetry: expect.objectContaining({ errorClass: null, latencyMs: expect.any(Number) }),
    }));
    expect(mockRecordOperation).toHaveBeenCalledWith("user-1");
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "user-1", "ai_read_executed",
      expect.objectContaining({ tool_name: "list_campaigns", account_id: "acct-1" }),
    );
  });

  it("rate limit exceeded: throws before calling fn", async () => {
    mockEnforceRateLimit.mockRejectedValue(new RateLimitError(300, 300));
    const fn = vi.fn();

    await expect(execRead(auth, "acct-1", "list_campaigns", fn)).rejects.toThrow(RateLimitError);

    expect(fn).not.toHaveBeenCalled();
    // Rate-limit rejections log a RATE_LIMIT telemetry row so the admin
    // dashboard can surface "users hitting the cap" as a signal.
    expect(mockLogRead).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "list_campaigns",
      clientSource: "test-client",
      telemetry: expect.objectContaining({ errorClass: "RATE_LIMIT" }),
    }));
  });

  it("works without campaignId", async () => {
    const fn = vi.fn().mockResolvedValue({ info: "test" });

    const result = await execRead(auth, "acct-1", "get_account_info", fn);

    expect(result).toEqual({ info: "test" });
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(mockLogRead).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "get_account_info",
      campaignId: undefined,
      telemetry: expect.objectContaining({ errorClass: null }),
    }));
  });
});
