import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  createApproval,
  listPendingApprovals,
  pendingApprovalCount,
  resolveApproval,
} from "./approvals";

function applyMigrations(db: Database.Database): void {
  for (const migration of MIGRATIONS) {
    db.exec(migration.sql);
  }
}

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

function seedProject(slug = "acme"): void {
  testDb
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("p-" + slug, slug, slug, "2026-01-01T00:00:00.000Z");
}

beforeEach(() => {
  testDb = createDb();
});

afterEach(() => {
  testDb.close();
});

describe("createApproval", () => {
  it("persists a pending approval with a generated id and serialized payload", () => {
    seedProject();
    const payload = { campaign_id: "123", new_bid: 2.5 };
    const approval = createApproval({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_summary: "raise bid on shoes",
      action_type: "bid_change",
      cost_estimate_usd: 10,
      reasoning: "below target ROAS",
      payload,
    });

    expect(approval.id).toMatch(/[0-9a-f-]{36}/);
    expect(approval.status).toBe("pending");
    expect(approval.resolved_at).toBeNull();
    expect(approval.payload_json).toBe(JSON.stringify(payload));
    expect(approval.reasoning).toBe("below target ROAS");
    expect(approval.cost_estimate_usd).toBe(10);
    expect(approval.action_type).toBe("bid_change");

    // Round-trip via DB
    const row = testDb
      .prepare("SELECT * FROM approvals WHERE id = ?")
      .get(approval.id) as Record<string, unknown>;
    expect(row.status).toBe("pending");
    expect(row.resolved_at).toBeNull();
  });

  it("defaults reasoning to null when omitted", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(a.reasoning).toBeNull();
  });

  it("serializes an undefined payload as {}", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: undefined,
    });
    expect(a.payload_json).toBe("{}");
  });

  it("serializes a null payload as {} (?? operator coerces null too)", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: null,
    });
    // Behaviorally: `?? {}` replaces null with {}, then JSON.stringify({}) === "{}".
    expect(a.payload_json).toBe("{}");
  });

  it("throws on invalid action_type (CHECK constraint)", () => {
    seedProject();
    expect(() =>
      createApproval({
        project_slug: "acme",
        agent_id: "x",
        action_summary: "y",
        // @ts-expect-error invalid on purpose
        action_type: "invalid_type",
        cost_estimate_usd: 0,
        payload: {},
      }),
    ).toThrow(/CHECK/i);
  });

  it("throws on missing project FK", () => {
    expect(() =>
      createApproval({
        project_slug: "no-such-project",
        agent_id: "x",
        action_summary: "y",
        action_type: "other",
        cost_estimate_usd: 0,
        payload: {},
      }),
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe("listPendingApprovals", () => {
  it("returns only pending approvals for the given project", () => {
    seedProject("acme");
    seedProject("other");
    const a1 = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "pending1",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "pending2",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    // Resolve one so it's filtered out.
    resolveApproval(a1.id, "approved");
    createApproval({
      project_slug: "other",
      agent_id: "x",
      action_summary: "from other project",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });

    const rows = listPendingApprovals("acme");
    expect(rows.map((r) => r.action_summary)).toEqual(["pending2"]);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("orders by created_at DESC", () => {
    seedProject();
    testDb
      .prepare(
        `INSERT INTO approvals
           (id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run("a1", "acme", "x", "old", "other", 0, "{}", "2026-01-01T00:00:00.000Z");
    testDb
      .prepare(
        `INSERT INTO approvals
           (id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run("a2", "acme", "x", "newer", "other", 0, "{}", "2026-01-02T00:00:00.000Z");
    expect(listPendingApprovals("acme").map((r) => r.action_summary)).toEqual([
      "newer",
      "old",
    ]);
  });

  it("returns empty array when project has no pending approvals", () => {
    seedProject();
    expect(listPendingApprovals("acme")).toEqual([]);
  });
});

describe("pendingApprovalCount", () => {
  it("returns 0 when there are no approvals", () => {
    seedProject();
    expect(pendingApprovalCount("acme")).toBe(0);
  });

  it("counts only pending approvals", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p1",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p2",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p3",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(pendingApprovalCount("acme")).toBe(3);
    resolveApproval(a.id, "approved");
    expect(pendingApprovalCount("acme")).toBe(2);
  });

  it("isolates count by project", () => {
    seedProject("a");
    seedProject("b");
    createApproval({
      project_slug: "a",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(pendingApprovalCount("a")).toBe(1);
    expect(pendingApprovalCount("b")).toBe(0);
  });
});

describe("resolveApproval", () => {
  it("flips pending → approved and stamps resolved_at", async () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = resolveApproval(a.id, "approved");
    expect(out).not.toBeNull();
    expect(out!.status).toBe("approved");
    expect(out!.resolved_at).not.toBeNull();
    expect(Date.parse(out!.resolved_at!)).toBeGreaterThan(0);
  });

  it("flips pending → rejected", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = resolveApproval(a.id, "rejected");
    expect(out!.status).toBe("rejected");
  });

  it("flips pending → expired", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = resolveApproval(a.id, "expired");
    expect(out!.status).toBe("expired");
  });

  it("is a no-op when the approval is not pending (returns current row)", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const first = resolveApproval(a.id, "approved")!;
    const second = resolveApproval(a.id, "rejected")!;
    // Still approved — the WHERE status='pending' clause prevents re-resolution.
    expect(second.status).toBe("approved");
    expect(second.resolved_at).toBe(first.resolved_at);
  });

  it("returns null when the approval id doesn't exist", () => {
    expect(resolveApproval("missing-id", "approved")).toBeNull();
  });
});
