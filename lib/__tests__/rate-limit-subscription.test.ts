/**
 * Tests that the plan-aware rate limiter correctly bypasses Free's 300/day cap
 * for users on the Growth plan.
 *
 * This file is separate from rate-limit.test.ts because it stubs the
 * subscription helper, while the legacy file mocks only the operations DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force the rate limiter out of dev short-circuit so resolveDailyLimit
// actually consults the subscription helper. vitest sets NODE_ENV=test by
// default, which already misses the "development" branch — that's enough.
// We just need to be sure no other test accidentally flipped it.
const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
});
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
});

const mockOpsCount = vi.fn();
const mockGetPlanLimits = vi.fn();

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: () => ({
      from: () => ({
        where: () => mockOpsCount(),
      }),
    }),
  }),
  schema: {
    operations: { userId: "userId", createdAt: "createdAt" },
  },
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

vi.mock("@/lib/subscription", () => ({
  getUserPlanLimits: (...args: unknown[]) => mockGetPlanLimits(...args),
  PLANS: {
    free: { limits: { dailyOpLimit: 300 } },
    growth: { limits: { dailyOpLimit: null } },
  },
}));

// Import after mocks so the module captures them.
import { enforceRateLimit, getUsageInfo, RateLimitError } from "@/lib/mcp/rate-limit";

describe("rate-limit (plan-aware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpsCount.mockReturnValue([{ count: 0 }]);
  });

  it("free user blocked at 300 ops/day", async () => {
    mockGetPlanLimits.mockResolvedValue({ dailyOpLimit: 300 });
    mockOpsCount.mockReturnValue([{ count: 300 }]);

    await expect(enforceRateLimit("free-user-1")).rejects.toThrow(RateLimitError);
  });

  it("free user under cap is allowed", async () => {
    mockGetPlanLimits.mockResolvedValue({ dailyOpLimit: 300 });
    mockOpsCount.mockReturnValue([{ count: 299 }]);

    await expect(enforceRateLimit("free-user-2")).resolves.toBeUndefined();
  });

  it("growth user with 999 ops is allowed (unlimited)", async () => {
    mockGetPlanLimits.mockResolvedValue({ dailyOpLimit: null });
    mockOpsCount.mockReturnValue([{ count: 999_999 }]);

    await expect(enforceRateLimit("growth-user-1")).resolves.toBeUndefined();
    // The rate limiter should NOT have queried the operations table at all.
    expect(mockOpsCount).not.toHaveBeenCalled();
  });

  it("growth user skips DB query on every call (perf)", async () => {
    mockGetPlanLimits.mockResolvedValue({ dailyOpLimit: null });

    await enforceRateLimit("growth-user-2");
    await enforceRateLimit("growth-user-2");
    await enforceRateLimit("growth-user-2");

    expect(mockOpsCount).not.toHaveBeenCalled();
  });

  it("falls back to free limit if subscription lookup throws", async () => {
    mockGetPlanLimits.mockRejectedValue(new Error("db down"));
    mockOpsCount.mockReturnValue([{ count: 500 }]);

    await expect(enforceRateLimit("user-fallback")).rejects.toThrow(RateLimitError);
  });

  it("getUsageInfo reports unlimited:true for growth users", async () => {
    mockGetPlanLimits.mockResolvedValue({ dailyOpLimit: null });
    mockOpsCount.mockReturnValue([{ count: 5000 }]);

    const info = await getUsageInfo("growth-info");
    expect(info.unlimited).toBe(true);
    expect(info.limit).toBeNull();
    expect(info.remaining).toBeNull();
    expect(info.used).toBe(5000);
  });

  it("getUsageInfo reports normal limits for free users", async () => {
    mockGetPlanLimits.mockResolvedValue({ dailyOpLimit: 300 });
    mockOpsCount.mockReturnValue([{ count: 100 }]);

    const info = await getUsageInfo("free-info");
    expect(info.unlimited).toBe(false);
    expect(info.limit).toBe(300);
    expect(info.remaining).toBe(200);
    expect(info.used).toBe(100);
  });
});
