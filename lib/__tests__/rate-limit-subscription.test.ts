/**
 * Tests that the access gate correctly admits paid users + in-trial users
 * and rejects free users whose 7-day trial has ended.
 *
 * This file is separate from rate-limit.test.ts because it stubs the
 * subscription helper, while the legacy file mocks only the operations DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force the rate limiter out of dev short-circuit so the gate actually
// consults the subscription helper. vitest sets NODE_ENV=test by default,
// which already misses the "development" branch — pin "production" to be
// sure no other test accidentally flipped it.
const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
});
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
});

const mockOpsCount = vi.fn();
const mockCheckAccess = vi.fn();

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
  checkAccess: (...args: unknown[]) => mockCheckAccess(...args),
}));

// Import after mocks so the module captures them.
import { enforceRateLimit, getUsageInfo, RateLimitError } from "@/lib/mcp/rate-limit";

describe("rate-limit (trial gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpsCount.mockReturnValue([{ count: 0 }]);
  });

  it("free user with active trial is allowed", async () => {
    mockCheckAccess.mockResolvedValue({ ok: true, reason: "trial" });
    await expect(enforceRateLimit("free-in-trial")).resolves.toBeUndefined();
  });

  it("free user with expired trial is blocked with RateLimitError", async () => {
    const trialEndsAt = new Date(Date.now() - 86_400_000);
    mockCheckAccess.mockResolvedValue({ ok: false, reason: "trial_expired", trialEndsAt });
    await expect(enforceRateLimit("free-trial-expired")).rejects.toThrow(RateLimitError);
  });

  it("paid user is allowed regardless of trial state", async () => {
    mockCheckAccess.mockResolvedValue({ ok: true, reason: "paid" });
    await expect(enforceRateLimit("growth-user")).resolves.toBeUndefined();
  });

  it("paid users do NOT get blocked by an expired app-side trial", async () => {
    // checkAccess is the contract surface — anyone it admits as "paid" must
    // get through the gate. Covers the Stripe-trialing / past_due / active
    // branches collectively (resolver tests cover each individually).
    mockCheckAccess.mockResolvedValue({ ok: true, reason: "paid" });
    await expect(enforceRateLimit("growth-user-with-stale-trial")).resolves.toBeUndefined();
  });

  it("does NOT query the operations DB on the gate path", async () => {
    mockCheckAccess.mockResolvedValue({ ok: true, reason: "paid" });
    await enforceRateLimit("growth-user");
    expect(mockOpsCount).not.toHaveBeenCalled();
  });

  it("fails open if checkAccess throws (parity with old gate's fallback)", async () => {
    mockCheckAccess.mockRejectedValue(new Error("db down"));
    await expect(enforceRateLimit("user-fallback")).resolves.toBeUndefined();
  });

  it("getUsageInfo always reports unlimited:true (no monthly cap)", async () => {
    mockOpsCount.mockReturnValue([{ count: 50 }]);

    const info = await getUsageInfo("any-user");
    expect(info.unlimited).toBe(true);
    expect(info.limit).toBeNull();
    expect(info.remaining).toBeNull();
    expect(info.used).toBe(50);
  });
});
