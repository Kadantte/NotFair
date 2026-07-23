import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-handlers-"));
});

const mocks = vi.hoisted(() => ({
  runMetricSource: vi.fn(),
  runHistorySource: vi.fn(),
  syncGoalIdentity: vi.fn(async () => {}),
  syncProjectAgents: vi.fn(async () => 3),
  runGoalTick: vi.fn(async () => {}),
  syncGoalPrs: vi.fn(async () => {}),
}));

// Boundary mocks: metric execution (subprocess / MCP), identity re-render
// (adapter runtime), the first tick (adapter runtime), and PR sync (gh).
vi.mock("./metric", () => ({
  LOCAL_SOURCE_KEY: "local",
  runMetricSource: mocks.runMetricSource,
  runHistorySource: mocks.runHistorySource,
}));
vi.mock("./provision", () => ({
  syncGoalIdentity: mocks.syncGoalIdentity,
  syncProjectAgents: mocks.syncProjectAgents,
}));
vi.mock("./tick", () => ({ runGoalTick: mocks.runGoalTick }));
vi.mock("./pr-sync", () => ({
  syncGoalPrs: mocks.syncGoalPrs,
  maybeSyncGoalPrs: vi.fn(),
}));

import {
  handleAddSupportMetric,
  handleAmendGoal,
  handleBackfillHistory,
  handleDefineGoal,
  handleGetGoal,
  handleGetProject,
  handleLogGoalAction,
  handleLogLearning,
  handleProposeGoalMetric,
  handleProposeTarget,
  handleReviewGoalAction,
  handleSearchLearnings,
  handleSetProjectBrief,
  handleUpdateGoalStatus,
} from "./handlers";
import { getDb } from "@/server/db/db";
import {
  addGoalLearning,
  createGoal,
  createGoalAction,
  getGoal,
  listGoalLearnings,
  listMetricSnapshots,
  proposeTarget,
  recordMetricSnapshot,
  setGoalMetric,
  setGoalStatus,
  type Goal,
} from "@/server/db/goals";
import { listSupportMetrics } from "@/server/db/goal-support-metrics";
import { readProjectBrief } from "@/server/onboarding/project-brief";
import { PROJECT_BRIEF_MAX_BYTES } from "@/server/onboarding/project-brief";

const SLUG = "proj";
const ctxFor = (agent_id: string) => ({ project_slug: SLUG, agent_id });

const LOCAL_SPEC = {
  metric_source_key: "local",
  metric_source_tool: "shell",
  metric_source_args_json: JSON.stringify({ command: "echo 1" }),
};

function makeIntakeGoal(agent: string, statement = "Grow organic clicks"): Goal {
  return createGoal({ project_slug: SLUG, agent_id: agent, statement });
}

function makeProposedGoal(agent: string): Goal {
  const goal = makeIntakeGoal(agent);
  return setGoalMetric(goal.id, {
    metric_name: "clicks",
    ...LOCAL_SPEC,
    metric_direction: "increase",
    baseline_value: 10,
  })!;
}

function makeActiveGoal(agent: string): Goal {
  const goal = makeProposedGoal(agent);
  return proposeTarget(goal.id, { target_value: 100 })!;
}

beforeAll(() => {
  const ts = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES ('p1', ?, 'Proj', ?, 'claude-code-local')",
    )
    .run(SLUG, ts);
  getDb()
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES ('p2', 'other', 'Other', ?, 'claude-code-local')",
    )
    .run(ts);
});

beforeEach(() => {
  mocks.runMetricSource.mockReset();
  mocks.runHistorySource.mockReset();
  mocks.runGoalTick.mockClear();
  mocks.syncProjectAgents.mockClear();
});

describe("goal resolution / authorization", () => {
  it("rejects an unknown goal id", async () => {
    const r = await handleGetGoal({ goal_id: "nope" }, ctxFor("a"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Unknown goal_id");
  });

  it("rejects cross-project access", async () => {
    const foreign = createGoal({ project_slug: "other", agent_id: "x-1", statement: "s" });
    const r = await handleGetGoal({ goal_id: foreign.id }, ctxFor("x-1"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Cross-project");
  });

  it("rejects owner-required calls from another agent", () => {
    const goal = makeIntakeGoal("own-1");
    const r = handleDefineGoal(
      { goal_id: goal.id, statement: "s", short_label: "l" },
      ctxFor("someone-else"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("owned by 'own-1'");
  });
});

describe("handleGetGoal", () => {
  it("assembles the full state view", async () => {
    const goal = makeActiveGoal("view-1");
    recordMetricSnapshot(goal.id, 42, "tick");
    addGoalLearning(goal.id, "Tuesday spikes are noise", "high");
    createGoalAction({
      goal_id: goal.id,
      kind: "mutation",
      description: "raised bids",
      expected_effect: "more clicks",
      review_after: new Date(Date.now() + 3600_000).toISOString(),
      spend_usd: 12.5,
    });
    // Another agent's gated action in the same project is surfaced too.
    const other = makeActiveGoal("view-2");
    createGoalAction({
      goal_id: other.id,
      kind: "mutation",
      description: "their experiment",
      resources_touched: ["campaign:9"],
      expected_effect: "n/a",
      review_after: new Date(Date.now() + 3600_000).toISOString(),
    });

    const r = await handleGetGoal({ goal_id: goal.id }, ctxFor("view-1"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.goal.id).toBe(goal.id);
    expect(r.data.target_met).toBe(false); // 42 < 100
    expect(r.data.actions_gated).toHaveLength(1);
    expect(r.data.actions_due_for_review).toHaveLength(0);
    expect(r.data.recent_learnings[0]!.body).toContain("Tuesday");
    expect(r.data.metric_history.map((s) => s.value)).toContain(42);
    expect(r.data.logged_spend_usd).toBe(12.5);
    expect(r.data.gated_by_other_agents).toEqual([
      expect.objectContaining({ agent_id: "view-2", resources: ["campaign:9"] }),
    ]);
  });
});

describe("handleDefineGoal", () => {
  it("records the trimmed statement and clamps the label to 48 chars", () => {
    const goal = makeIntakeGoal("def-1", "");
    const r = handleDefineGoal(
      {
        goal_id: goal.id,
        statement: "  Grow signups  ",
        short_label: `  ${"x".repeat(60)}  `,
      },
      ctxFor("def-1"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.statement).toBe("Grow signups");
    expect(getGoal(goal.id)!.short_label).toHaveLength(48);
  });

  it("refuses once the goal has left intake", () => {
    const goal = makeProposedGoal("def-2");
    const r = handleDefineGoal(
      { goal_id: goal.id, statement: "s", short_label: "l" },
      ctxFor("def-2"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("'proposed', not 'intake'");
  });
});

describe("handleProposeGoalMetric", () => {
  const input = (goal_id: string, key = "local") => ({
    goal_id,
    metric_name: "clicks",
    metric_source_key: key,
    metric_source_tool: "shell",
    metric_source_args_json: JSON.stringify({ command: "echo 42" }),
    metric_direction: "increase" as const,
  });

  it("refuses outside intake", async () => {
    const goal = makeProposedGoal("pm-1");
    const r = await handleProposeGoalMetric(input(goal.id), ctxFor("pm-1"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not 'intake'");
  });

  it("requires a defined statement first", async () => {
    const goal = makeIntakeGoal("pm-2", "");
    const r = await handleProposeGoalMetric(input(goal.id), ctxFor("pm-2"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("define_goal");
  });

  it("rejects a non-local source without a connected MCP token", async () => {
    const goal = makeIntakeGoal("pm-3");
    const r = await handleProposeGoalMetric(
      input(goal.id, "notfair-googleads"),
      ctxFor("pm-3"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No connected MCP 'notfair-googleads'");
    expect(mocks.runMetricSource).not.toHaveBeenCalled();
  });

  it("bounces a metric the platform cannot reproduce", async () => {
    const goal = makeIntakeGoal("pm-4");
    mocks.runMetricSource.mockResolvedValueOnce({ ok: false, error: "shell exploded" });
    const r = await handleProposeGoalMetric(input(goal.id), ctxFor("pm-4"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("shell exploded");
    expect(getGoal(goal.id)!.status).toBe("intake");
  });

  it("verifies server-side, moves to proposed, and snapshots the baseline", async () => {
    const goal = makeIntakeGoal("pm-5");
    mocks.runMetricSource.mockResolvedValueOnce({ ok: true, value: 42 });
    const r = await handleProposeGoalMetric(input(goal.id), ctxFor("pm-5"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.baseline_value).toBe(42);
      expect(r.data.status).toBe("proposed");
    }
    const fresh = getGoal(goal.id)!;
    expect(fresh.baseline_value).toBe(42);
    expect(fresh.current_value).toBe(42);
    const snaps = listMetricSnapshots(goal.id);
    expect(snaps).toEqual([expect.objectContaining({ value: 42, source: "intake" })]);
  });
});

describe("handleBackfillHistory", () => {
  const input = (goal_id: string, key = "local") => ({
    goal_id,
    source_key: key,
    source_tool: "shell",
    source_args_json: JSON.stringify({ command: "echo history" }),
  });

  it("rejects an unconnected source", async () => {
    const goal = makeProposedGoal("bf-1");
    const r = await handleBackfillHistory(input(goal.id, "nope-mcp"), ctxFor("bf-1"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No connected MCP");
  });

  it("surfaces a failing history query", async () => {
    const goal = makeProposedGoal("bf-2");
    mocks.runHistorySource.mockResolvedValueOnce({ ok: false, error: "bad rows" });
    const r = await handleBackfillHistory(input(goal.id), ctxFor("bf-2"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad rows");
  });

  it("rejects a series with only future-dated points", async () => {
    const goal = makeProposedGoal("bf-3");
    mocks.runHistorySource.mockResolvedValueOnce({
      ok: true,
      points: [{ date: new Date(Date.now() + 86_400_000).toISOString(), value: 1 }],
    });
    const r = await handleBackfillHistory(input(goal.id), ctxFor("bf-3"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no past-dated points");
  });

  it("stores past points and drops future ones", async () => {
    const goal = makeProposedGoal("bf-4");
    mocks.runHistorySource.mockResolvedValueOnce({
      ok: true,
      points: [
        { date: "2026-07-01T00:00:00.000Z", value: 5 },
        { date: "2026-07-02T00:00:00.000Z", value: 6 },
        { date: new Date(Date.now() + 86_400_000).toISOString(), value: 99 },
      ],
    });
    const r = await handleBackfillHistory(input(goal.id), ctxFor("bf-4"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.points).toBe(2);
      expect(r.data.from).toBe("2026-07-01");
      expect(r.data.to).toBe("2026-07-02");
    }
    const snaps = listMetricSnapshots(goal.id);
    expect(snaps.map((s) => s.value)).toEqual([5, 6]);
    expect(snaps.every((s) => s.source === "backfill")).toBe(true);
  });
});

describe("handleAddSupportMetric", () => {
  const input = (goal_id: string, over: Record<string, unknown> = {}) => ({
    goal_id,
    name: "impressions",
    source_key: "local",
    source_tool: "shell",
    source_args_json: JSON.stringify({ command: "echo 7" }),
    ...over,
  });

  it("requires a name", async () => {
    const goal = makeActiveGoal("sm-1");
    const r = await handleAddSupportMetric(input(goal.id, { name: "  " }), ctxFor("sm-1"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("name");
  });

  it("refuses shadowing the primary metric", async () => {
    const goal = makeActiveGoal("sm-2");
    const r = await handleAddSupportMetric(
      input(goal.id, { name: "clicks" }),
      ctxFor("sm-2"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("primary metric");
  });

  it("rejects an unconnected source", async () => {
    const goal = makeActiveGoal("sm-3");
    const r = await handleAddSupportMetric(
      input(goal.id, { source_key: "nope-mcp" }),
      ctxFor("sm-3"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No connected MCP");
  });

  it("bounces an unverifiable metric", async () => {
    const goal = makeActiveGoal("sm-4");
    mocks.runMetricSource.mockResolvedValueOnce({ ok: false, error: "no such column" });
    const r = await handleAddSupportMetric(input(goal.id), ctxFor("sm-4"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no such column");
    expect(listSupportMetrics(goal.id)).toHaveLength(0);
  });

  it("stores the verified metric (no history)", async () => {
    const goal = makeActiveGoal("sm-5");
    mocks.runMetricSource.mockResolvedValueOnce({ ok: true, value: 7 });
    const r = await handleAddSupportMetric(input(goal.id), ctxFor("sm-5"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.metric.name).toBe("impressions");
      expect(r.data.metric.baseline_value).toBe(7);
      expect(r.data.backfilled).toBe(0);
    }
  });

  it("backfills history when provided", async () => {
    const goal = makeActiveGoal("sm-6");
    mocks.runMetricSource.mockResolvedValueOnce({ ok: true, value: 7 });
    mocks.runHistorySource.mockResolvedValueOnce({
      ok: true,
      points: [
        { date: "2026-07-01T00:00:00.000Z", value: 3 },
        { date: new Date(Date.now() + 86_400_000).toISOString(), value: 9 },
      ],
    });
    const r = await handleAddSupportMetric(
      input(goal.id, { history_args_json: JSON.stringify({ command: "echo rows" }) }),
      ctxFor("sm-6"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.backfilled).toBe(1); // future point dropped
  });

  it("keeps the metric but fails the call when history breaks", async () => {
    const goal = makeActiveGoal("sm-7");
    mocks.runMetricSource.mockResolvedValueOnce({ ok: true, value: 7 });
    mocks.runHistorySource.mockResolvedValueOnce({ ok: false, error: "bad shape" });
    const r = await handleAddSupportMetric(
      input(goal.id, { history_args_json: JSON.stringify({ command: "echo rows" }) }),
      ctxFor("sm-7"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Metric stored, but the history query failed");
    expect(listSupportMetrics(goal.id)).toHaveLength(1);
  });
});

describe("handleProposeTarget", () => {
  it("refuses before the metric is verified", () => {
    const goal = makeIntakeGoal("pt-1");
    const r = handleProposeTarget({ goal_id: goal.id, target_value: 5 }, ctxFor("pt-1"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not 'proposed'");
  });

  it("rejects a target on the wrong side of the baseline (achieve)", () => {
    const inc = makeProposedGoal("pt-2"); // increase, baseline 10
    const below = handleProposeTarget({ goal_id: inc.id, target_value: 5 }, ctxFor("pt-2"));
    expect(below.ok).toBe(false);
    if (!below.ok) expect(below.error).toContain("'increase'");

    const decGoal = makeIntakeGoal("pt-3");
    setGoalMetric(decGoal.id, {
      metric_name: "waste",
      ...LOCAL_SPEC,
      metric_direction: "decrease",
      baseline_value: 10,
    });
    const above = handleProposeTarget(
      { goal_id: decGoal.id, target_value: 20 },
      ctxFor("pt-3"),
    );
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.error).toContain("'decrease'");
  });

  it("maintain targets may sit on the already-met side", async () => {
    const goal = makeProposedGoal("pt-4"); // increase, baseline 10
    const r = handleProposeTarget(
      { goal_id: goal.id, target_value: 5, mode: "maintain" },
      ctxFor("pt-4"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("active");
    expect(getGoal(goal.id)!.mode).toBe("maintain");
    // The first tick fires immediately on confirmation.
    await new Promise((r) => setImmediate(r));
    expect(mocks.runGoalTick).toHaveBeenCalledWith(
      expect.objectContaining({ id: goal.id }),
      "manual",
    );
  });

  it("surfaces an invalid cadence cron as an error result", () => {
    const goal = makeProposedGoal("pt-5");
    const r = handleProposeTarget(
      { goal_id: goal.id, target_value: 100, cadence_cron: "not a cron" },
      ctxFor("pt-5"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Invalid cadence cron");
  });
});

describe("handleAmendGoal", () => {
  it("only applies to active/paused goals", () => {
    const goal = makeIntakeGoal("am-1");
    const r = handleAmendGoal({ goal_id: goal.id, target_value: 5 }, ctxFor("am-1"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("amend applies to active/paused");
  });

  it("requires at least one field", () => {
    const goal = makeActiveGoal("am-2");
    const r = handleAmendGoal({ goal_id: goal.id }, ctxFor("am-2"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Nothing to amend");
  });

  it("re-checks target direction on amendment", () => {
    const goal = makeActiveGoal("am-3"); // increase, baseline 10
    const r = handleAmendGoal({ goal_id: goal.id, target_value: 3 }, ctxFor("am-3"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("'increase'");
  });

  it("surfaces an invalid cron as an error result", () => {
    const goal = makeActiveGoal("am-4");
    const r = handleAmendGoal(
      { goal_id: goal.id, cadence_cron: "nope" },
      ctxFor("am-4"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Invalid cadence cron");
  });

  it("amends envelope, deadline, and target on a live goal", () => {
    const goal = makeActiveGoal("am-5");
    const r = handleAmendGoal(
      {
        goal_id: goal.id,
        target_value: 250,
        deadline: "2026-12-31T00:00:00.000Z",
        spend_envelope_usd: 3000,
      },
      ctxFor("am-5"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.target_value).toBe(250);
      expect(r.data.deadline).toBe("2026-12-31T00:00:00.000Z");
      expect(r.data.spend_envelope_usd).toBe(3000);
      expect(r.data.cadence_cron).toBe("0 16 * * *");
    }
  });
});

describe("handleLogGoalAction", () => {
  it("refuses mutations without an observation window", () => {
    const goal = makeActiveGoal("la-1");
    const r = handleLogGoalAction(
      {
        goal_id: goal.id,
        kind: "mutation",
        description: "raise bids",
        expected_effect: "clicks up",
      },
      ctxFor("la-1"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("review_after_hours");
  });

  it("logs a mutation with a derived review_after", () => {
    const goal = makeActiveGoal("la-2");
    const before = Date.now();
    const r = handleLogGoalAction(
      {
        goal_id: goal.id,
        kind: "mutation",
        description: "raise bids",
        resources_touched: ["campaign:1"],
        expected_effect: "clicks up",
        review_after_hours: 48,
        spend_usd: 20,
        action_badge: "Bids raised",
      },
      ctxFor("la-2"),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const reviewAt = Date.parse(r.data.review_after!);
    expect(reviewAt).toBeGreaterThanOrEqual(before + 48 * 3_600_000);
    expect(reviewAt).toBeLessThan(before + 49 * 3_600_000);
  });

  it("research actions need no window", () => {
    const goal = makeActiveGoal("la-3");
    const r = handleLogGoalAction(
      {
        goal_id: goal.id,
        kind: "research",
        description: "read search terms",
        expected_effect: "n/a",
      },
      ctxFor("la-3"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.review_after).toBeNull();
  });
});

describe("handleReviewGoalAction", () => {
  it("rejects an action from another goal", () => {
    const goal = makeActiveGoal("rv-1");
    const other = makeActiveGoal("rv-2");
    const foreign = createGoalAction({
      goal_id: other.id,
      kind: "research",
      description: "d",
      expected_effect: "e",
    });
    const r = handleReviewGoalAction(
      { goal_id: goal.id, action_id: foreign.id, observed_outcome: "o" },
      ctxFor("rv-1"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Unknown action_id");
  });

  it("reviews once, records the learning, and refuses a second pass", () => {
    const goal = makeActiveGoal("rv-3");
    const action = createGoalAction({
      goal_id: goal.id,
      kind: "mutation",
      description: "d",
      expected_effect: "e",
      review_after: new Date().toISOString(),
    });
    const r = handleReviewGoalAction(
      {
        goal_id: goal.id,
        action_id: action.id,
        observed_outcome: "worked",
        learning: "bids move clicks within 2 days",
      },
      ctxFor("rv-3"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe("reviewed");
      expect(r.data.learning_id).not.toBeNull();
    }
    expect(listGoalLearnings(goal.id)[0]!.body).toContain("bids move clicks");

    const again = handleReviewGoalAction(
      { goal_id: goal.id, action_id: action.id, observed_outcome: "o" },
      ctxFor("rv-3"),
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("not open");
  });

  it("abandoning records the abandoned status without a learning", () => {
    const goal = makeActiveGoal("rv-4");
    const action = createGoalAction({
      goal_id: goal.id,
      kind: "mutation",
      description: "d",
      expected_effect: "e",
      review_after: new Date().toISOString(),
    });
    const r = handleReviewGoalAction(
      { goal_id: goal.id, action_id: action.id, observed_outcome: "reverted", abandoned: true },
      ctxFor("rv-4"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe("abandoned");
      expect(r.data.learning_id).toBeNull();
    }
  });
});

describe("learnings tools", () => {
  it("logs with supersession and searches by substring", () => {
    const goal = makeActiveGoal("ln-1");
    const first = handleLogLearning(
      { goal_id: goal.id, body: "old belief", confidence: "low" },
      ctxFor("ln-1"),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = handleLogLearning(
      { goal_id: goal.id, body: "new belief", supersedes_id: first.data.learning_id },
      ctxFor("ln-1"),
    );
    expect(second.ok).toBe(true);

    const all = handleSearchLearnings({ goal_id: goal.id }, ctxFor("ln-1"));
    expect(all.ok).toBe(true);
    if (all.ok) {
      // The superseded learning is filtered out of listings.
      expect(all.data.learnings.map((l) => l.body)).toEqual(["new belief"]);
    }
    const hit = handleSearchLearnings(
      { goal_id: goal.id, query: "new", limit: 999 },
      ctxFor("ln-1"),
    );
    expect(hit.ok).toBe(true);
    if (hit.ok) expect(hit.data.learnings).toHaveLength(1);
    const miss = handleSearchLearnings(
      { goal_id: goal.id, query: "zzz" },
      ctxFor("ln-1"),
    );
    expect(miss.ok).toBe(true);
    if (miss.ok) expect(miss.data.learnings).toHaveLength(0);
  });
});

describe("handleUpdateGoalStatus", () => {
  it("never lets a maintain goal self-complete", () => {
    const goal = makeProposedGoal("st-1");
    proposeTarget(goal.id, { target_value: 5, mode: "maintain" });
    const r = handleUpdateGoalStatus(
      { goal_id: goal.id, status: "achieved", reason: "done" },
      ctxFor("st-1"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("MAINTAIN");
  });

  it("refuses 'achieved' while the number says otherwise", () => {
    const goal = makeActiveGoal("st-2"); // target 100
    recordMetricSnapshot(goal.id, 50, "tick");
    const r = handleUpdateGoalStatus(
      { goal_id: goal.id, status: "achieved", reason: "trust me" },
      ctxFor("st-2"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("has not met the target");
  });

  it("closes achieved when the measured metric agrees", () => {
    const goal = makeActiveGoal("st-3");
    recordMetricSnapshot(goal.id, 150, "tick");
    const r = handleUpdateGoalStatus(
      { goal_id: goal.id, status: "achieved", reason: "target crossed" },
      ctxFor("st-3"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("achieved");
  });

  it("pauses without target checks", () => {
    const goal = makeActiveGoal("st-4");
    const r = handleUpdateGoalStatus(
      { goal_id: goal.id, status: "paused", reason: "token expired" },
      ctxFor("st-4"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("paused");
    expect(getGoal(goal.id)!.next_tick_at).toBeNull();
  });

  it("terminal statuses are final", () => {
    const goal = makeActiveGoal("st-5");
    setGoalStatus(goal.id, "killed", "user closed it");
    const r = handleUpdateGoalStatus(
      { goal_id: goal.id, status: "paused", reason: "r" },
      ctxFor("st-5"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("terminal");
  });
});

describe("project tools", () => {
  it("handleGetProject returns the caller's project or an error", () => {
    const ok = handleGetProject({}, ctxFor("a"));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.slug).toBe(SLUG);
    const bad = handleGetProject({}, { project_slug: "ghost", agent_id: "a" });
    expect(bad.ok).toBe(false);
  });

  it("handleSetProjectBrief validates project, content, and size", async () => {
    const ghost = await handleSetProjectBrief(
      { content: "x" },
      { project_slug: "ghost", agent_id: "a" },
    );
    expect(ghost.ok).toBe(false);

    const empty = await handleSetProjectBrief({ content: "   " }, ctxFor("a"));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain("empty");

    const huge = await handleSetProjectBrief(
      { content: "x".repeat(PROJECT_BRIEF_MAX_BYTES + 1) },
      ctxFor("a"),
    );
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toContain("bytes");
  });

  it("handleSetProjectBrief writes PROJECT.md and re-syncs every agent", async () => {
    const r = await handleSetProjectBrief(
      { content: "  Acme sells anvils.  " },
      ctxFor("a"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.bytes).toBe(Buffer.byteLength("Acme sells anvils."));
      expect(r.data.synced_agents).toBe(3);
    }
    expect(mocks.syncProjectAgents).toHaveBeenCalledWith(SLUG);
    await expect(readProjectBrief(SLUG)).resolves.toBe("Acme sells anvils.");
  });
});
