/**
 * Unit tests for the Meta Ads exec wrappers. Asserts the telemetry-parity
 * fixes from the bug audit:
 *
 *   - rate-limited writes log via logChange (op_type=write) with RATE_LIMIT
 *   - thrown writes log via logChange with THROWN
 *   - successful writes still log via logChange (regression guard)
 *   - successful reads still log via logRead (regression guard)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnforceRateLimit,
  mockRecordOperation,
  mockLogChange,
  mockLogRead,
  mockTrackServerEvent,
} = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn(),
  mockRecordOperation: vi.fn(),
  mockLogChange: vi.fn(),
  mockLogRead: vi.fn(),
  mockTrackServerEvent: vi.fn(),
}));

vi.mock("@/lib/mcp/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp/rate-limit")>(
    "@/lib/mcp/rate-limit",
  );
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

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock("@/lib/mcp/telemetry", () => ({
  getTelemetry: () => ({
    requestId: "req-1",
    toolName: "pauseCampaign",
    args: { campaignId: "c1" },
  }),
}));

import { execMetaRead, execMetaWrite, type MetaWriteEnvelope } from "./exec";
import { RateLimitError } from "@/lib/mcp/rate-limit";

const auth = {
  refreshToken: "tok",
  customerId: "act_1",
  userId: "user-1",
  clientName: "test",
};

describe("execMetaWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockLogChange.mockResolvedValue(undefined);
    mockLogRead.mockResolvedValue(undefined);
  });

  it("logs successful writes via logChange (regression guard)", async () => {
    const envelope: MetaWriteEnvelope = {
      success: true,
      action: "pauseCampaign",
      entityType: "campaign",
      entityId: "c1",
      accountId: "act_1",
      before: { status: "ACTIVE" },
      after: { status: "PAUSED" },
    };

    await execMetaWrite(auth, async () => envelope);

    expect(mockLogChange).toHaveBeenCalledTimes(1);
    expect(mockLogRead).not.toHaveBeenCalled();
    const call = mockLogChange.mock.calls[0][0];
    expect(call.platform).toBe("meta_ads");
    expect(call.writeResult.success).toBe(true);
    expect(call.writeResult.action).toBe("pauseCampaign");
  });

  it("logs rate-limited writes via logChange with RATE_LIMIT (was: silently dropped)", async () => {
    mockEnforceRateLimit.mockRejectedValueOnce(new RateLimitError(300, 300, new Date()));
    const fn = vi.fn();

    await expect(execMetaWrite(auth, fn)).rejects.toThrow(/Free monthly cap/);

    expect(fn).not.toHaveBeenCalled(); // pre-call gate
    expect(mockLogChange).toHaveBeenCalledTimes(1);
    expect(mockLogRead).not.toHaveBeenCalled();
    const call = mockLogChange.mock.calls[0][0];
    expect(call.platform).toBe("meta_ads");
    expect(call.writeResult.success).toBe(false);
    expect(call.writeResult.action).toBe("pauseCampaign");
    expect(call.telemetry.errorClass).toBe("RATE_LIMIT");
  });

  it("logs thrown writes via logChange with THROWN (was: logged as op_type=read)", async () => {
    const err = new Error("Meta API blew up");

    await expect(
      execMetaWrite(auth, async () => {
        throw err;
      }),
    ).rejects.toThrow(/blew up/);

    expect(mockLogChange).toHaveBeenCalledTimes(1);
    expect(mockLogRead).not.toHaveBeenCalled();
    const call = mockLogChange.mock.calls[0][0];
    expect(call.platform).toBe("meta_ads");
    expect(call.writeResult.success).toBe(false);
    expect(call.writeResult.action).toBe("pauseCampaign");
    expect(call.telemetry.errorClass).toBe("THROWN");
    expect(call.telemetry.errorMessage).toMatch(/blew up/);
  });

  it("does NOT swallow non-RateLimitError thrown by enforceRateLimit", async () => {
    mockEnforceRateLimit.mockRejectedValueOnce(new Error("network down"));
    await expect(execMetaWrite(auth, async () => {
      throw new Error("unreachable");
    })).rejects.toThrow(/network down/);

    // Non-rate-limit pre-call errors don't log (matches Google parity).
    expect(mockLogChange).not.toHaveBeenCalled();
    expect(mockLogRead).not.toHaveBeenCalled();
  });
});

describe("execMetaRead (regression guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockLogChange.mockResolvedValue(undefined);
    mockLogRead.mockResolvedValue(undefined);
  });

  it("logs successful reads via logRead (deferred)", async () => {
    await execMetaRead(auth, "act_1", "listCampaigns", async () => ({ rows: [] }));

    // logRead is deferred via queueMicrotask — yield once.
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(mockLogRead).toHaveBeenCalledTimes(1);
    expect(mockLogChange).not.toHaveBeenCalled();
    const call = mockLogRead.mock.calls[0][0];
    expect(call.platform).toBe("meta_ads");
    expect(call.toolName).toBe("listCampaigns");
  });

  it("logs rate-limited reads via logRead with RATE_LIMIT", async () => {
    mockEnforceRateLimit.mockRejectedValueOnce(new RateLimitError(300, 300, new Date()));
    await expect(
      execMetaRead(auth, "act_1", "listCampaigns", async () => ({})),
    ).rejects.toThrow(/Free monthly cap/);

    expect(mockLogRead).toHaveBeenCalledTimes(1);
    expect(mockLogChange).not.toHaveBeenCalled();
    const call = mockLogRead.mock.calls[0][0];
    expect(call.telemetry.errorClass).toBe("RATE_LIMIT");
  });
});
