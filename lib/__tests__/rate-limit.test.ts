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

// rate-limit.ts now consults the subscription helper. Keep the legacy
// test file focused on op-counting math by stubbing the helper to free.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/subscription", () => ({
  getUserPlanLimits: vi.fn().mockResolvedValue({ monthlyOpLimit: 300 }),
  PLANS: {
    free: { limits: { monthlyOpLimit: 300 } },
    growth: { limits: { monthlyOpLimit: null } },
  },
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
    it("passes when usage is under the limit", async () => {
      mockWhere.mockReturnValue([{ count: 50 }]);
      await expect(enforceRateLimit("user-1")).resolves.toBeUndefined();
    });

    it("throws RateLimitError when at the limit (300)", async () => {
      mockWhere.mockReturnValue([{ count: 300 }]);
      await expect(enforceRateLimit("user-at-limit")).rejects.toThrow(RateLimitError);
    });

    it("throws RateLimitError when over the limit", async () => {
      mockWhere.mockReturnValue([{ count: 500 }]);
      await expect(enforceRateLimit("user-over-limit")).rejects.toThrow(RateLimitError);
    });

    it("bypasses rate limit for null userId", async () => {
      await expect(enforceRateLimit(null)).resolves.toBeUndefined();
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it("bypasses rate limit for undefined userId", async () => {
      await expect(enforceRateLimit(undefined)).resolves.toBeUndefined();
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it("getUsageCount excludes THROWN and RATE_LIMIT rows from the monthly count", async () => {
      // Force a DB hit (no cached entry exists for this user).
      mockWhere.mockReturnValue([{ count: 10 }]);
      await enforceRateLimit("user-filter-probe");

      expect(mockWhere).toHaveBeenCalled();
      // and(eq(userId), gte(createdAt), sql`(errorClass IS NULL OR ...)`)
      // With the drizzle-orm mocks above, and() returns ["and", ...args].
      const whereArg = mockWhere.mock.calls[0][0] as [string, ...unknown[]];
      expect(whereArg[0]).toBe("and");
      const sqlFilter = whereArg[3] as { strings: readonly string[] };
      // The sql template mock stores the raw strings array — assert the
      // filter's literal shape so the error-class list stays locked down.
      const raw = sqlFilter.strings.join("");
      expect(raw).toMatch(/IS NULL/);
      expect(raw).toMatch(/WRITE_REJECTED/);
      // THROWN and RATE_LIMIT must NOT appear as allowed classes — if someone
      // adds them to the filter we want this test to loudly fail so they
      // re-review the self-compounding-overage scenario.
      expect(raw).not.toMatch(/THROWN/);
      expect(raw).not.toMatch(/RATE_LIMIT/);
    });
  });

  // ─── RateLimitError ────────────────────────────────────────────────

  describe("RateLimitError", () => {
    it("includes reset time in message", () => {
      const error = new RateLimitError(300, 300);
      expect(error.message).toContain("300/300");
      expect(error.message).toMatch(/resets in/);
      expect(error.message).toContain("first of next month");
      expect(error.name).toBe("RateLimitError");
    });

    it("stores used and limit properties", () => {
      const error = new RateLimitError(250, 300);
      expect(error.used).toBe(250);
      expect(error.limit).toBe(300);
    });
  });

  // ─── recordOperation ──────────────────────────────────────────────

  describe("recordOperation", () => {
    it("increments cached count after enforce populates cache", async () => {
      // First call populates the cache with count=50
      mockWhere.mockReturnValue([{ count: 50 }]);
      await enforceRateLimit("user-inc");

      // Record an operation
      recordOperation("user-inc");

      // Next enforceRateLimit should use cached value (51) without hitting DB.
      // Since 51 < 300, it should pass. No new DB call needed (cache TTL).
      await expect(enforceRateLimit("user-inc")).resolves.toBeUndefined();
    });

    it("does nothing for null userId", () => {
      // Should not throw
      expect(() => recordOperation(null)).not.toThrow();
    });
  });

  // ─── getUsageInfo ─────────────────────────────────────────────────

  describe("getUsageInfo", () => {
    it("returns correct remaining count", async () => {
      mockWhere.mockReturnValue([{ count: 100 }]);
      const info = await getUsageInfo("user-info-remaining");
      expect(info.used).toBe(100);
      expect(info.limit).toBe(300);
      expect(info.remaining).toBe(200);
      expect(info.resetsAt).toBeDefined();
    });

    it("clamps remaining to 0 when over limit", async () => {
      mockWhere.mockReturnValue([{ count: 999 }]);
      const info = await getUsageInfo("user-info-over");
      expect(info.remaining).toBe(0);
    });

    it("returns full allowance for null userId", async () => {
      const info = await getUsageInfo(null);
      expect(info.used).toBe(0);
      expect(info.remaining).toBe(300);
      expect(mockWhere).not.toHaveBeenCalled();
    });
  });
});
