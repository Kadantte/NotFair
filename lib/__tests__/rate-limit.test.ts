import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── DB mock ────────────────────────────────────────────────────────
// mockWhere is the terminal call in the chain. Its RETURN VALUE is the DB result.
const mockWhere = vi.fn().mockReturnValue([{ count: 0 }]);

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => mockWhere(...args),
      }),
    }),
  }),
  schema: {
    operations: { userId: "userId", createdAt: "createdAt" },
  },
}));

// rate-limit.ts now consults checkAccess. Default to "in-trial → allowed"
// so this file can stay focused on op-counting math (used by getUsageInfo)
// and the trial-gate path is covered in rate-limit-subscription.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/subscription", () => ({
  checkAccess: vi.fn().mockResolvedValue({ ok: true, reason: "trial" }),
}));

// drizzle-orm operators are used inside rate-limit.ts but we just need them not to throw
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ["eq", ...args]),
  gte: vi.fn((...args: unknown[]) => ["gte", ...args]),
  and: vi.fn((...args: unknown[]) => ["and", ...args]),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s },
  ),
}));

import {
  enforceRateLimit,
  recordOperation,
  getUsageInfo,
  RateLimitError,
} from "@/lib/mcp/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue([{ count: 0 }]);
  });

  // ─── enforceRateLimit ─────────────────────────────────────────────

  describe("enforceRateLimit", () => {
    it("passes for an in-trial user", async () => {
      await expect(enforceRateLimit("user-1")).resolves.toBeUndefined();
    });

    it("bypasses for null userId", async () => {
      await expect(enforceRateLimit(null)).resolves.toBeUndefined();
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it("bypasses for undefined userId", async () => {
      await expect(enforceRateLimit(undefined)).resolves.toBeUndefined();
      expect(mockWhere).not.toHaveBeenCalled();
    });
  });

  // ─── RateLimitError ────────────────────────────────────────────────

  describe("RateLimitError", () => {
    it("carries the trial end timestamp it was constructed with", () => {
      const trialEndsAt = new Date("2026-05-01T00:00:00Z");
      const err = new RateLimitError(trialEndsAt);
      expect(err.trialEndsAt).toBe(trialEndsAt);
      expect(err.name).toBe("RateLimitError");
      expect(err.message).toMatch(/trial ended/i);
    });

    it("accepts a null trialEndsAt", () => {
      const err = new RateLimitError(null);
      expect(err.trialEndsAt).toBeNull();
    });
  });

  // ─── recordOperation ──────────────────────────────────────────────

  describe("recordOperation", () => {
    it("does nothing for null userId", () => {
      expect(() => recordOperation(null)).not.toThrow();
    });
  });

  // ─── getUsageInfo ─────────────────────────────────────────────────

  describe("getUsageInfo", () => {
    it("returns the raw monthly op count with unlimited flagged", async () => {
      mockWhere.mockReturnValue([{ count: 100 }]);
      const info = await getUsageInfo("user-info-remaining");
      expect(info.used).toBe(100);
      expect(info.limit).toBeNull();
      expect(info.remaining).toBeNull();
      expect(info.unlimited).toBe(true);
      expect(info.resetsAt).toBeDefined();
    });

    it("returns zero for null userId without hitting the DB", async () => {
      const info = await getUsageInfo(null);
      expect(info.used).toBe(0);
      expect(info.unlimited).toBe(true);
      expect(mockWhere).not.toHaveBeenCalled();
    });
  });
});
