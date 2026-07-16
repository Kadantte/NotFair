import { beforeAll, describe, expect, it, vi } from "vitest";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-tick-"));
});

const mocks = vi.hoisted(() => ({
  measureGoalMetric: vi.fn(),
  syncGoalPrs: vi.fn(async () => {}),
}));

vi.mock("@/server/goals/metric", () => ({
  measureGoalMetric: mocks.measureGoalMetric,
}));
vi.mock("./pr-sync", () => ({
  syncGoalPrs: mocks.syncGoalPrs,
}));
vi.mock("@/server/adapters/registry", () => ({
  requireAdapter: () => ({
    // Minimal harness: one final message, no session handshake.
    execute: async function* () {
      yield { kind: "final", text: "did one thing" };
    },
  }),
}));

import { runGoalTick } from "./tick";
import { getDb } from "@/server/db/db";
import {
  createGoal,
  getGoal,
  listGoalTicks,
  setGoalStatus,
  type Goal,
} from "@/server/db/goals";

const SLUG = "proj";
let goal: Goal;

beforeAll(() => {
  getDb()
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES ('p1', ?, 'Proj', ?, 'claude-code-local')",
    )
    .run(SLUG, new Date().toISOString());
  const created = createGoal({
    project_slug: SLUG,
    agent_id: "agent-1",
    statement: "Grow organic clicks",
  });
  goal = setGoalStatus(created.id, "active", "test")!;
});

describe("runGoalTick claim-first lifecycle", () => {
  it("records the check row synchronously, before measurement resolves", async () => {
    // Measurement that stays pending until we let it finish — the window
    // where the diary row used to not exist yet.
    let finishMeasurement!: (v: unknown) => void;
    mocks.measureGoalMetric.mockReturnValueOnce(
      new Promise((r) => (finishMeasurement = r)),
    );

    const turn = runGoalTick(goal, "manual"); // deliberately not awaited yet

    // The fire-and-forget caller (runTickNowAction) returns here: the row
    // must already be in the diary, running, tagged manual, metric pending.
    const claimed = listGoalTicks(goal.id, 10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!).toMatchObject({
      status: "running",
      trigger_kind: "manual",
      metric_value: null,
    });

    finishMeasurement({ ok: true, value: 42 });
    await turn;

    const done = listGoalTicks(goal.id, 10)[0]!;
    expect(done.status).toBe("done");
    expect(done.metric_value).toBe(42); // backfilled by setGoalTickMetric
    expect(done.summary).toBe("did one thing");
  });

  it("marks the claimed row failed instead of stranding it running", async () => {
    mocks.measureGoalMetric.mockResolvedValueOnce({ ok: true, value: 43 });
    mocks.syncGoalPrs.mockRejectedValueOnce(new Error("gh exploded"));

    await runGoalTick(getGoal(goal.id)!, "manual");

    const latest = listGoalTicks(goal.id, 10)[0]!;
    expect(latest.status).toBe("failed");
    expect(latest.summary).toContain("gh exploded");
  });
});
