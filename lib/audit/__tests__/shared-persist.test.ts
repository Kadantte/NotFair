import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditResult } from "../scoring";

// ─── Stubs ───────────────────────────────────────────────────────────
//
// We stub `@/lib/db` before importing the module under test so the
// top-level `import "server-only"` and drizzle builder calls don't hit a
// real connection. Each test configures the stub's behavior.

type DedupResponse = Array<{ id: string }>;
type InsertBehavior = "ok" | "slug-conflict-once" | "throw";
type InsertedRow = {
  id: string;
  slug: string;
  ownerUserId: string;
  source: string;
  visibility: string;
  accountFingerprint: string;
  payload: {
    keyNumbers: {
      topCampaign: string | null;
      totalSpend: { band: string; exact?: number } | null;
    };
    [k: string]: unknown;
  };
  showCampaignNames: boolean;
  showSpend: boolean;
  showExactSpend: boolean;
};

const state = {
  dedupResponse: [] as DedupResponse,
  insertBehavior: "ok" as InsertBehavior,
  insertedValues: [] as InsertedRow[],
  insertCalls: 0,
  selectCalls: 0,
};

function resetState() {
  state.dedupResponse = [];
  state.insertBehavior = "ok";
  state.insertedValues = [];
  state.insertCalls = 0;
  state.selectCalls = 0;
}

vi.mock("@/lib/db", () => {
  const selectBuilder = {
    from: () => selectBuilder,
    where: () => selectBuilder,
    orderBy: () => selectBuilder,
    limit: async () => {
      state.selectCalls += 1;
      return state.dedupResponse;
    },
  };
  const insertBuilder = {
    values: async (vals: InsertedRow) => {
      state.insertCalls += 1;
      if (state.insertBehavior === "throw") {
        throw new Error("boom");
      }
      if (
        state.insertBehavior === "slug-conflict-once" &&
        state.insertCalls === 1
      ) {
        throw new Error(
          'duplicate key value violates unique constraint "shared_audits_slug_unique"',
        );
      }
      state.insertedValues.push(vals);
    },
  };
  return {
    db: () => ({
      select: () => selectBuilder,
      insert: () => insertBuilder,
    }),
    schema: {
      sharedAudits: {
        id: "id",
        slug: "slug",
        ownerUserId: "owner_user_id",
        accountFingerprint: "account_fingerprint",
        createdAt: "created_at",
      },
    },
  };
});

// Drizzle's `eq/and/gte/desc` helpers are called but we don't care about
// their return values — the mocked query builder ignores them.
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  gte: () => ({}),
  desc: () => ({}),
}));

// `server-only` is stubbed by vitest config alias already.

import { saveAuditToHistory } from "../shared-persist";

// ─── Fixtures ────────────────────────────────────────────────────────

function mkResult(): AuditResult {
  return {
    overallScore: 50,
    category: "OK",
    dimensions: [],
    wastedSpend: {
      total: 500,
      pct: 0.05,
      annualized: 6000,
      categories: [],
      qualityIssues: { total: 0, pct: 0, categories: [] },
    },
    impressionShareDiagnosis: {
      avgIS: null,
      budgetLost: null,
      rankLost: null,
      diagnosis: "",
      campaignBreakdown: [],
    },
    topActions: [],
    keyNumbers: {
      totalSpend: 10_000,
      conversions: 20,
      cpa: 500,
      topCampaign: "Main",
      wastedSpend: 500,
    },
    wastedSearchTerms: [],
    zeroCvCampaigns: [],
    pulseMetrics: { wasteRate: 5, demandCaptured: 60, cpa: 500 },
    passes: { stopWasting: [], captureMore: [], fixFundamentals: [] },
    verdict: "",
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("saveAuditToHistory", () => {
  beforeEach(() => {
    resetState();
    process.env.AUDIT_SHARE_SALT = "test-salt-value";
  });

  it("skips silently when userId is null (Phase 1 requires auth)", async () => {
    const out = await saveAuditToHistory({
      userId: null,
      accountId: "cust-1",
      result: mkResult(),
    });
    expect(out).toBeNull();
    expect(state.insertCalls).toBe(0);
    expect(state.selectCalls).toBe(0);
  });

  it("inserts an anonymized row on the happy path", async () => {
    const out = await saveAuditToHistory({
      userId: "user-1",
      accountId: "cust-1",
      result: mkResult(),
    });
    expect(out).toMatch(/^[A-Za-z0-9_-]{10}$/); // slug
    expect(state.insertCalls).toBe(1);
    expect(state.insertedValues).toHaveLength(1);
    const row = state.insertedValues[0];
    expect(row.ownerUserId).toBe("user-1");
    expect(row.source).toBe("web");
    expect(row.visibility).toBe("private");
    expect(row.accountFingerprint).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    // Anonymization must have run — no raw campaign name in payload.
    expect(JSON.stringify(row.payload)).not.toContain("Main");
    expect(row.payload.keyNumbers.topCampaign).toBe("Campaign A");
    expect(row.payload.keyNumbers.totalSpend?.band).toBe("$10k–$25k/mo");
  });

  it("skips insert when a recent save exists for the same user+account (dedup)", async () => {
    state.dedupResponse = [{ id: "existing-row" }];
    const out = await saveAuditToHistory({
      userId: "user-1",
      accountId: "cust-1",
      result: mkResult(),
    });
    expect(out).toBeNull();
    expect(state.insertCalls).toBe(0);
  });

  it("produces a different fingerprint for different accountIds", async () => {
    await saveAuditToHistory({
      userId: "user-1",
      accountId: "cust-1",
      result: mkResult(),
    });
    await saveAuditToHistory({
      userId: "user-1",
      accountId: "cust-2",
      result: mkResult(),
    });
    const [a, b] = state.insertedValues;
    expect(a.accountFingerprint).not.toBe(b.accountFingerprint);
  });

  it("retries once on a slug collision and succeeds", async () => {
    state.insertBehavior = "slug-conflict-once";
    const out = await saveAuditToHistory({
      userId: "user-1",
      accountId: "cust-1",
      result: mkResult(),
    });
    expect(out).not.toBeNull();
    expect(state.insertCalls).toBe(2);
    expect(state.insertedValues).toHaveLength(1);
  });

  it("propagates non-dedup errors so the caller's .catch can log them", async () => {
    state.insertBehavior = "throw";
    await expect(
      saveAuditToHistory({
        userId: "user-1",
        accountId: "cust-1",
        result: mkResult(),
      }),
    ).rejects.toThrow("boom");
  });
});
