import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────
const {
  mockEnforceRateLimit,
  mockRecordOperation,
  mockLogChange,
  mockLogRead,
  mockInvalidateCache,
  mockTrackServerEvent,
} = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn(),
  mockRecordOperation: vi.fn(),
  mockLogChange: vi.fn(),
  mockLogRead: vi.fn(),
  mockInvalidateCache: vi.fn(),
  mockTrackServerEvent: vi.fn(),
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
}));

vi.mock("@/lib/google-ads", () => ({
  invalidateCache: mockInvalidateCache,
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: mockTrackServerEvent,
}));

import { execWrite, execRead } from "@/lib/tools/execute";
import type { ToolAuth } from "@/lib/tools/execute";
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

    // Rate limit checked first
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1");

    // fn was called
    expect(fn).toHaveBeenCalled();

    // Cache invalidated for the account
    expect(mockInvalidateCache).toHaveBeenCalledWith("acct-1");

    // Change logged
    expect(mockLogChange).toHaveBeenCalledWith(
      "acct-1", "user-1", "camp-1", writeResult, "test reason", "test-client",
    );

    // Operation recorded for rate limiter
    expect(mockRecordOperation).toHaveBeenCalledWith("user-1");

    // Analytics tracked
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "user-1", "ai_change_executed",
      expect.objectContaining({ tool_name: "pause_campaign", account_id: "acct-1" }),
    );

    // Returns result with changeId
    expect(result.success).toBe(true);
    expect(result.changeId).toBe(42);
  });

  it("failure path (fn returns success:false): no cache invalidation, no logging, changeId is null", async () => {
    const failResult: WriteResult = {
      success: false,
      action: "pause_campaign",
      entityId: "camp-1",
      beforeValue: "ENABLED",
      afterValue: "ENABLED",
      error: "Something went wrong",
    };
    const fn = vi.fn().mockResolvedValue(failResult);

    const result = await execWrite(auth, "acct-1", "camp-1", fn);

    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1");
    expect(fn).toHaveBeenCalled();

    // Should NOT invalidate cache or log change
    expect(mockInvalidateCache).not.toHaveBeenCalled();
    expect(mockLogChange).not.toHaveBeenCalled();
    expect(mockRecordOperation).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();

    expect(result.success).toBe(false);
    expect(result.changeId).toBeNull();
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

    // Read logged (fire-and-forget, but still called)
    expect(mockLogRead).toHaveBeenCalledWith("acct-1", "user-1", "list_campaigns", "camp-1", "test-client");

    // Operation recorded
    expect(mockRecordOperation).toHaveBeenCalledWith("user-1");

    // Analytics tracked
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "user-1", "ai_read_executed",
      expect.objectContaining({ tool_name: "list_campaigns", account_id: "acct-1" }),
    );

    // Returns raw result
    expect(result).toEqual(data);
  });

  it("rate limit exceeded: throws before calling fn", async () => {
    mockEnforceRateLimit.mockRejectedValue(new RateLimitError(300, 300));
    const fn = vi.fn();

    await expect(execRead(auth, "acct-1", "list_campaigns", fn)).rejects.toThrow(RateLimitError);

    expect(fn).not.toHaveBeenCalled();
    expect(mockLogRead).not.toHaveBeenCalled();
  });

  it("works without campaignId", async () => {
    const fn = vi.fn().mockResolvedValue({ info: "test" });

    const result = await execRead(auth, "acct-1", "get_account_info", fn);

    expect(result).toEqual({ info: "test" });
    expect(mockLogRead).toHaveBeenCalledWith("acct-1", "user-1", "get_account_info", undefined, "test-client");
  });
});
