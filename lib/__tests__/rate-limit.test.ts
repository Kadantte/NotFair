import { beforeEach, describe, expect, it, vi } from "vitest";

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
    operations: { userId: "userId", createdAt: "createdAt", errorClass: "errorClass" },
  },
}));

// Default to "free_post_trial with anchor in the recent past" so the gate
// reaches the op-counting branch — that's what this test file is about.
// The gate-decision branches (paid/trial bypass, fail-open) live in
// rate-limit-subscription.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/subscription", () => ({
  checkAccess: vi.fn().mockResolvedValue({
    kind: "free_post_trial",
    quotaAnchor: new Date(Date.now() - 10 * 86_400_000),
  }),
}));

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

  describe("enforceRateLimit (op-counting path)", () => {
    it("under cap → passes", async () => {
      mockWhere.mockReturnValue([{ count: 50 }]);
      await expect(enforceRateLimit("user-1")).resolves.toBeUndefined();
    });

    it("at cap (300) → throws RateLimitError", async () => {
      mockWhere.mockReturnValue([{ count: 300 }]);
      await expect(enforceRateLimit("user-at-limit")).rejects.toThrow(RateLimitError);
    });

    it("over cap → throws RateLimitError", async () => {
      mockWhere.mockReturnValue([{ count: 500 }]);
      await expect(enforceRateLimit("user-over-limit")).rejects.toThrow(RateLimitError);
    });

    it("bypasses gate for null userId (no DB hit)", async () => {
      await expect(enforceRateLimit(null)).resolves.toBeUndefined();
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it("excludes THROWN and RATE_LIMIT rows from the count (the SQL filter must NOT include them)", async () => {
      mockWhere.mockReturnValue([{ count: 10 }]);
      await enforceRateLimit("user-filter-probe");

      expect(mockWhere).toHaveBeenCalled();
      const whereArg = mockWhere.mock.calls[0][0] as [string, ...unknown[]];
      expect(whereArg[0]).toBe("and");
      const sqlFilter = whereArg[3] as { strings: readonly string[] };
      const raw = sqlFilter.strings.join("");
      expect(raw).toMatch(/IS NULL/);
      expect(raw).toMatch(/WRITE_REJECTED/);
      // Self-compounding-overage guard: rate-limited retries must NOT count.
      expect(raw).not.toMatch(/THROWN/);
      expect(raw).not.toMatch(/RATE_LIMIT/);
    });
  });

  describe("RateLimitError shape", () => {
    it("carries used, limit, resetsAt; message references the cap", () => {
      const resetsAt = new Date("2026-06-01T00:00:00Z");
      const err = new RateLimitError(300, 300, resetsAt);
      expect(err.used).toBe(300);
      expect(err.limit).toBe(300);
      expect(err.resetsAt).toBe(resetsAt);
      expect(err.name).toBe("RateLimitError");
      expect(err.message).toMatch(/300\/300/);
      expect(err.message).toMatch(/upgrade/i);
    });
  });

  describe("recordOperation", () => {
    it("does nothing for null userId", () => {
      expect(() => recordOperation(null)).not.toThrow();
    });

    it("noop when no cache entry exists", () => {
      expect(() => recordOperation("user-cold-cache")).not.toThrow();
    });
  });

  describe("getUsageInfo", () => {
    it("free post-trial → returns 300 cap with computed remaining", async () => {
      mockWhere.mockReturnValue([{ count: 100 }]);
      const info = await getUsageInfo("user-info-remaining");
      expect(info.used).toBe(100);
      expect(info.limit).toBe(300);
      expect(info.remaining).toBe(200);
      expect(info.tier).toBe("free_post_trial");
    });

    it("null userId → free defaults without hitting the DB", async () => {
      const info = await getUsageInfo(null);
      expect(info.used).toBe(0);
      expect(info.limit).toBe(300);
      expect(info.remaining).toBe(300);
      expect(mockWhere).not.toHaveBeenCalled();
    });
  });
});
