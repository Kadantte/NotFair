import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verifies the quota/op-counting contract for the runScript host bindings:
 *  - ads.gaql(query)             -> exactly 1 execRead("run_script_gaql")
 *  - ads.gaqlParallel([N])       -> exactly N execRead("run_script_gaql_parallel")
 *  - validation failures         -> 0 execRead calls (no phantom charges)
 *  - per-task errors             -> other tasks still dispatched (N calls total)
 *  - sync helpers/queries/consts -> 0 execRead calls (free)
 *
 * We don't go through the sandbox here; we invoke the host object
 * buildAdsHost() returns and spy on execRead directly. That isolates the
 * op-counting logic from the QuickJS plumbing (covered by sandbox.test.ts)
 * and the bootstrap surface (covered by ads-client.test.ts).
 */

const { mockExecRead, mockRunSafeGaqlReport } = vi.hoisted(() => ({
  mockExecRead: vi.fn(),
  mockRunSafeGaqlReport: vi.fn(),
}));

vi.mock("@/lib/google-ads", () => ({
  runSafeGaqlReport: mockRunSafeGaqlReport,
}));

vi.mock("@/lib/tools/execute", () => ({
  execRead: mockExecRead,
}));

// The ads-client now guards gaqlParallel with a top-level enforceRateLimit
// pre-check. Stub it with a no-op by default; individual tests override to
// simulate a user at the cap.
const { mockEnforceRateLimit } = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/mcp/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp/rate-limit")>(
    "@/lib/mcp/rate-limit",
  );
  return {
    ...actual,
    enforceRateLimit: mockEnforceRateLimit,
  };
});

import { buildAdsHost } from "./ads-client";
import type { AuthContext } from "@/lib/google-ads";

const STUB_AUTH = {
  refreshToken: "rt",
  customerId: "9999999999", // The "login" / default MCC customer.
  customerIds: [{ id: "9999999999", name: "MCC" }],
  loginCustomerId: null,
  userId: "user-1",
  clientName: "test",
  clientVersion: null,
  authMethod: "direct",
  userAgent: null,
  sessionToken: "st",
  sessionId: 1,
} as unknown as AuthContext;

// Deliberately different from STUB_AUTH.customerId — when runScript is invoked
// for a linked child account, execRead must receive the TARGET customer id,
// not the default from auth. Proves the host binding doesn't silently fall
// back to auth.customerId.
const TARGET_ID = "1234567890";

// Convenience: make execRead behave like the real one on the success path —
// it invokes fn() and returns the result. Errors from fn propagate.
function executesFn() {
  mockExecRead.mockImplementation(
    async (_auth: unknown, _targetId: unknown, _toolName: unknown, fn: () => Promise<unknown>) =>
      fn(),
  );
}

describe("runScript op counting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executesFn();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockRunSafeGaqlReport.mockResolvedValue({ rows: [] });
  });

  // ─── ads.gaql ────────────────────────────────────────────────────

  describe("ads.gaql", () => {
    it("charges exactly 1 op with toolName=run_script_gaql", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaql("SELECT campaign.id FROM campaign");

      expect(mockExecRead).toHaveBeenCalledTimes(1);
      expect(mockExecRead).toHaveBeenCalledWith(
        STUB_AUTH,
        TARGET_ID,
        "run_script_gaql",
        expect.any(Function),
      );
    });

    it("passes the user-provided limit through to runSafeGaqlReport", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaql("SELECT campaign.id FROM campaign", 50);

      expect(mockRunSafeGaqlReport).toHaveBeenCalledWith(
        STUB_AUTH,
        "SELECT campaign.id FROM campaign",
        50,
        {},
      );
    });

    it("accepts 2-arg (query, options) form and defaults limit to 200", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaql("SELECT campaign.id FROM campaign", {
        excludeRemovedParents: false,
      });

      expect(mockExecRead).toHaveBeenCalledTimes(1);
      expect(mockRunSafeGaqlReport).toHaveBeenCalledWith(
        STUB_AUTH,
        "SELECT campaign.id FROM campaign",
        200,
        { excludeRemovedParents: false },
      );
    });

    it("throws BEFORE calling execRead when query is not a string", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(host.ads.gaql(undefined as unknown as string)).rejects.toThrow(
        /`query` must be a string/,
      );
      expect(mockExecRead).not.toHaveBeenCalled();
    });

    it("propagates errors from the underlying runSafeGaqlReport (still 1 execRead call)", async () => {
      mockRunSafeGaqlReport.mockRejectedValueOnce(new Error("bad query"));
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(host.ads.gaql("SELECT bogus FROM nothing")).rejects.toThrow("bad query");
      expect(mockExecRead).toHaveBeenCalledTimes(1);
    });
  });

  // ─── ads.gaqlParallel ────────────────────────────────────────────

  describe("ads.gaqlParallel", () => {
    function makeQueries(n: number) {
      return Array.from({ length: n }, (_, i) => ({
        name: `q${i}`,
        query: `SELECT campaign.id FROM campaign WHERE campaign.id = ${i + 1}`,
      }));
    }

    it("charges exactly N ops for N queries, all with toolName=run_script_gaql_parallel", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaqlParallel(makeQueries(5));

      expect(mockExecRead).toHaveBeenCalledTimes(5);
      for (let i = 0; i < 5; i++) {
        expect(mockExecRead).toHaveBeenNthCalledWith(
          i + 1,
          STUB_AUTH,
          TARGET_ID,
          "run_script_gaql_parallel",
          expect.any(Function),
        );
      }
    });

    it("allows exactly 20 queries (the documented cap)", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaqlParallel(makeQueries(20));

      expect(mockExecRead).toHaveBeenCalledTimes(20);
    });

    it("rejects >20 queries BEFORE dispatching any execRead", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(host.ads.gaqlParallel(makeQueries(21))).rejects.toThrow(/max 20/);
      expect(mockExecRead).not.toHaveBeenCalled();
    });

    it("charges 0 ops for an empty array", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      const out = await host.ads.gaqlParallel([]);

      expect(out).toEqual({});
      expect(mockExecRead).not.toHaveBeenCalled();
    });

    it("rejects non-array input BEFORE dispatching any execRead", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(
        host.ads.gaqlParallel({ name: "q", query: "SELECT 1" } as unknown as unknown[]),
      ).rejects.toThrow(/expected an array/);
      expect(mockExecRead).not.toHaveBeenCalled();
    });

    it("treats names with different case as distinct (case-sensitive)", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaqlParallel([
        { name: "Campaigns", query: "SELECT campaign.id FROM campaign" },
        { name: "campaigns", query: "SELECT campaign.id FROM campaign" },
      ]);

      expect(mockExecRead).toHaveBeenCalledTimes(2);
    });

    it("rejects duplicate names BEFORE dispatching any execRead", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(
        host.ads.gaqlParallel([
          { name: "same", query: "SELECT campaign.id FROM campaign" },
          { name: "same", query: "SELECT ad_group.id FROM ad_group" },
        ]),
      ).rejects.toThrow(/duplicate query name/);
      expect(mockExecRead).not.toHaveBeenCalled();
    });

    it("rejects a task with missing name BEFORE dispatching any execRead", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(
        host.ads.gaqlParallel([
          { name: "ok", query: "SELECT campaign.id FROM campaign" },
          { query: "SELECT ad_group.id FROM ad_group" } as unknown as {
            name: string;
            query: string;
          },
        ]),
      ).rejects.toThrow(/`name` must be a string/);
      expect(mockExecRead).not.toHaveBeenCalled();
    });

    it("per-task errors do NOT short-circuit: remaining tasks still run, total op count unchanged", async () => {
      // Task 2 (index 1) will fail at the RPC layer; others succeed.
      let call = 0;
      mockExecRead.mockImplementation(
        async (_a: unknown, _t: unknown, _n: unknown, fn: () => Promise<unknown>) => {
          call += 1;
          if (call === 2) throw new Error("RPC boom");
          return fn();
        },
      );
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      const out = (await host.ads.gaqlParallel(makeQueries(5))) as Record<string, unknown>;

      expect(mockExecRead).toHaveBeenCalledTimes(5);
      expect(out.q1).toEqual({ error: "RPC boom" });
      expect(out.q0).toEqual({ rows: [] });
      expect(out.q4).toEqual({ rows: [] });
    });

    it("pre-check fails fast when user is already at the cap: 0 execRead calls, throws RateLimitError", async () => {
      // Import the real RateLimitError class — gaqlParallel checks instanceof,
      // so we must throw the same class the production code references.
      const { RateLimitError } = await vi.importActual<
        typeof import("@/lib/mcp/rate-limit")
      >("@/lib/mcp/rate-limit");
      mockEnforceRateLimit.mockRejectedValueOnce(new RateLimitError(300, 300));
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(host.ads.gaqlParallel(makeQueries(5))).rejects.toBeInstanceOf(
        RateLimitError,
      );
      expect(mockExecRead).not.toHaveBeenCalled();
    });

    it("mid-fan-out race: if a task throws RateLimitError, gaqlParallel re-throws it (doesn't swallow)", async () => {
      const { RateLimitError } = await vi.importActual<
        typeof import("@/lib/mcp/rate-limit")
      >("@/lib/mcp/rate-limit");
      // Pre-check passes (user just under the cap). One task's execRead then
      // rejects with RateLimitError — simulating another node tipping them over
      // mid-flight.
      mockEnforceRateLimit.mockResolvedValue(undefined);
      let call = 0;
      mockExecRead.mockImplementation(
        async (_a: unknown, _t: unknown, _n: unknown, fn: () => Promise<unknown>) => {
          call += 1;
          if (call === 2) throw new RateLimitError(300, 300);
          return fn();
        },
      );
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await expect(host.ads.gaqlParallel(makeQueries(5))).rejects.toBeInstanceOf(
        RateLimitError,
      );
      // Siblings still fired before we could short-circuit; that's expected.
      expect(mockExecRead).toHaveBeenCalledTimes(5);
    });

    it("non-RateLimit per-task errors stay soft (script gets { error } for those, others still succeed)", async () => {
      mockEnforceRateLimit.mockResolvedValue(undefined);
      let call = 0;
      mockExecRead.mockImplementation(
        async (_a: unknown, _t: unknown, _n: unknown, fn: () => Promise<unknown>) => {
          call += 1;
          if (call === 3) throw new Error("bad GAQL syntax");
          return fn();
        },
      );
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      const out = (await host.ads.gaqlParallel(makeQueries(5))) as Record<
        string,
        unknown
      >;

      expect(mockExecRead).toHaveBeenCalledTimes(5);
      expect(out.q2).toEqual({ error: "bad GAQL syntax" });
      expect(out.q0).toEqual({ rows: [] });
    });

    it("passes options through unchanged to each task's runSafeGaqlReport", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaqlParallel(
        [
          { name: "a", query: "SELECT campaign.id FROM campaign", limit: 10 },
          { name: "b", query: "SELECT ad_group.id FROM ad_group" },
        ],
        { excludeRemovedParents: false },
      );

      expect(mockRunSafeGaqlReport).toHaveBeenCalledTimes(2);
      expect(mockRunSafeGaqlReport).toHaveBeenNthCalledWith(
        1,
        STUB_AUTH,
        "SELECT campaign.id FROM campaign",
        10,
        { excludeRemovedParents: false },
      );
      expect(mockRunSafeGaqlReport).toHaveBeenNthCalledWith(
        2,
        STUB_AUTH,
        "SELECT ad_group.id FROM ad_group",
        200, // default
        { excludeRemovedParents: false },
      );
    });
  });

  // ─── combined usage ──────────────────────────────────────────────

  describe("combined usage patterns", () => {
    it("1 gaql + 1 gaqlParallel(5) == 6 execRead calls total", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaql("SELECT campaign.id FROM campaign");
      await host.ads.gaqlParallel([
        { name: "a", query: "SELECT campaign.id FROM campaign" },
        { name: "b", query: "SELECT campaign.id FROM campaign" },
        { name: "c", query: "SELECT campaign.id FROM campaign" },
        { name: "d", query: "SELECT campaign.id FROM campaign" },
        { name: "e", query: "SELECT campaign.id FROM campaign" },
      ]);

      expect(mockExecRead).toHaveBeenCalledTimes(6);
      // Mix of toolNames on the right counts — gaql first, then 5 parallel.
      const toolNames = mockExecRead.mock.calls.map((c) => c[2]);
      expect(toolNames).toEqual([
        "run_script_gaql",
        "run_script_gaql_parallel",
        "run_script_gaql_parallel",
        "run_script_gaql_parallel",
        "run_script_gaql_parallel",
        "run_script_gaql_parallel",
      ]);
    });

    it("N sequential gaql calls == N execRead calls (loop anti-pattern)", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      for (let i = 0; i < 7; i++) {
        await host.ads.gaql(`SELECT campaign.id FROM campaign WHERE campaign.id = ${i}`);
      }

      expect(mockExecRead).toHaveBeenCalledTimes(7);
    });

    it("passes the SAME auth object (identity) to every execRead call in a batch", async () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      await host.ads.gaqlParallel([
        { name: "a", query: "SELECT campaign.id FROM campaign" },
        { name: "b", query: "SELECT campaign.id FROM campaign" },
        { name: "c", query: "SELECT campaign.id FROM campaign" },
      ]);

      // Object identity, not structural equality — catches bugs that shallow-
      // clone auth per task and drop OIDC/session fields.
      for (const call of mockExecRead.mock.calls) {
        expect(call[0]).toBe(STUB_AUTH);
        expect(call[1]).toBe(TARGET_ID);
      }
    });
  });

  // ─── bootstrap surface is free of charge ───────────────────────────

  describe("bootstrap surface (synchronous helpers)", () => {
    it("ads.queries / ads.helpers / ads.constants do not exist on the host object", () => {
      const { host } = buildAdsHost(STUB_AUTH, TARGET_ID);

      // The host object shipped to QuickJS exposes ONLY the RPC methods.
      // Everything else ships as bootstrap JS that runs inside the sandbox
      // with zero round-trips. So from the host's perspective, the only
      // surface is `ads.gaql` and `ads.gaqlParallel`.
      expect(Object.keys(host.ads).sort()).toEqual(["gaql", "gaqlParallel"]);
    });

    it("bootstrap source does not reference execRead (no hidden host calls)", () => {
      const { bootstrap } = buildAdsHost(STUB_AUTH, TARGET_ID);

      expect(bootstrap).not.toContain("execRead");
      expect(bootstrap).not.toContain("run_script_gaql");
      // Sanity: it should contain the pre-built query surfaces.
      expect(bootstrap).toContain("accountInfo");
      expect(bootstrap).toContain("ads.helpers");
    });
  });
});
