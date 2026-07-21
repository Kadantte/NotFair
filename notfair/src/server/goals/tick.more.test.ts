import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-tickmore-"));
});

const mocks = vi.hoisted(() => ({
  measureGoalMetric: vi.fn(),
  runMetricSource: vi.fn(),
  syncGoalPrs: vi.fn(async () => {}),
  /** Events the fake adapter yields on the next turn. */
  events: [] as Array<Record<string, unknown>>,
  /** Messages the adapter received (the composed tick briefs). */
  seenMessages: [] as string[],
}));

vi.mock("@/server/goals/metric", () => ({
  measureGoalMetric: mocks.measureGoalMetric,
  runMetricSource: mocks.runMetricSource,
}));
vi.mock("./pr-sync", () => ({ syncGoalPrs: mocks.syncGoalPrs }));
vi.mock("@/server/adapters/registry", () => ({
  requireAdapter: () => ({
    execute: async function* (input: { message: string }) {
      mocks.seenMessages.push(input.message);
      for (const evt of mocks.events) yield evt;
    },
  }),
}));

import {
  buildTickMessage,
  describePrForBrief,
  runDueGoalTicks,
  runGoalTick,
  streamAgentTurn,
  type TickContext,
} from "./tick";
import { getDb } from "@/server/db/db";
import {
  createGoal,
  createGoalAction,
  getGoal,
  listGoalTicks,
  proposeTarget,
  recordMetricSnapshot,
  setGoalMetric,
  type Goal,
  type GoalAction,
  type GoalTick,
} from "@/server/db/goals";
import type { GoalPr as Pr } from "@/server/db/goal-prs";
import {
  listSupportMetricSnapshots,
  upsertSupportMetric,
} from "@/server/db/goal-support-metrics";

const SLUG = "proj";

function makeActiveGoal(agent: string, target = 100): Goal {
  const goal = createGoal({ project_slug: SLUG, agent_id: agent, statement: "grow" });
  setGoalMetric(goal.id, {
    metric_name: "clicks",
    metric_source_key: "local",
    metric_source_tool: "shell",
    metric_source_args_json: "{}",
    metric_direction: "increase",
    baseline_value: 10,
  });
  return proposeTarget(goal.id, { target_value: target })!;
}

beforeAll(() => {
  getDb()
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES ('p1', ?, 'Proj', ?, 'claude-code-local')",
    )
    .run(SLUG, new Date().toISOString());
});

beforeEach(() => {
  mocks.measureGoalMetric.mockReset();
  mocks.runMetricSource.mockReset();
  mocks.events = [{ kind: "final", text: "did one thing" }];
  mocks.seenMessages = [];
});

describe("runGoalTick guards", () => {
  it("does nothing for a goal that is not active", async () => {
    const goal = createGoal({ project_slug: SLUG, agent_id: "g-intake", statement: "s" });
    await runGoalTick(goal, "manual");
    expect(listGoalTicks(goal.id, 10)).toHaveLength(0);
    expect(mocks.measureGoalMetric).not.toHaveBeenCalled();
  });

  it("accepts a goal id string and ignores unknown ids", async () => {
    await expect(runGoalTick("no-such-goal", "manual")).resolves.toBeUndefined();
  });

  it("skips a second tick while one is already running for the goal", async () => {
    const goal = makeActiveGoal("g-reent");
    let finish!: (v: unknown) => void;
    mocks.measureGoalMetric.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const first = runGoalTick(goal, "manual");
    const second = runGoalTick(goal, "manual"); // overlaps: must no-op
    await second;
    finish({ ok: true, value: 1 });
    await first;
    expect(listGoalTicks(goal.id, 10)).toHaveLength(1);
  });
});

describe("observe-only heartbeats", () => {
  it("records the check + chart point without waking the agent", async () => {
    const goal = makeActiveGoal("g-noop");
    recordMetricSnapshot(goal.id, 20, "tick"); // mid-flight, target not met
    createGoalAction({
      goal_id: goal.id,
      kind: "mutation",
      description: "in-window change",
      expected_effect: "e",
      review_after: new Date(Date.now() + 48 * 3600_000).toISOString(),
    });
    mocks.measureGoalMetric.mockResolvedValueOnce({ ok: true, value: 21 });

    await runGoalTick(getGoal(goal.id)!, "heartbeat");

    const tick = listGoalTicks(goal.id, 10)[0]!;
    expect(tick.status).toBe("done");
    expect(tick.summary).toContain("No-op check");
    expect(tick.metric_value).toBe(21);
    expect(tick.session_id).toBeNull(); // no agent turn, no session
    expect(mocks.seenMessages).toHaveLength(0);
    expect(getGoal(goal.id)!.current_value).toBe(21); // snapshot still landed
  });
});

describe("agent-turn ticks", () => {
  it("measures supporting metrics, snapshots the good ones, and briefs both", async () => {
    const goal = makeActiveGoal("g-support");
    const good = upsertSupportMetric({
      goal_id: goal.id,
      name: "impressions",
      source_key: "local",
      source_tool: "shell",
      source_args_json: "{}",
      direction: "increase",
      measured_value: 5,
    });
    upsertSupportMetric({
      goal_id: goal.id,
      name: "ctr",
      source_key: "local",
      source_tool: "shell",
      source_args_json: "{}",
      direction: null,
      measured_value: 1,
    });
    mocks.measureGoalMetric.mockResolvedValueOnce({ ok: true, value: 30 });
    mocks.runMetricSource
      .mockResolvedValueOnce({ ok: true, value: 9 })
      .mockResolvedValueOnce({ ok: false, error: "column gone" });

    await runGoalTick(getGoal(goal.id)!, "manual");

    expect(listSupportMetricSnapshots(good.id).some((s) => s.value === 9)).toBe(true);
    const brief = mocks.seenMessages[0]!;
    expect(brief).toContain("[supporting] impressions: **9**");
    expect(brief).toContain("healthy = increase");
    expect(brief).toContain("[supporting] ctr: MEASUREMENT FAILED: column gone");
  });

  it("briefs a failed primary measurement and stores the error on the check", async () => {
    const goal = makeActiveGoal("g-mfail");
    mocks.measureGoalMetric.mockResolvedValueOnce({ ok: false, error: "token expired" });

    await runGoalTick(getGoal(goal.id)!, "manual");

    const tick = listGoalTicks(goal.id, 10)[0]!;
    expect(tick.metric_value).toBeNull();
    expect(tick.metric_error).toBe("token expired");
    expect(mocks.seenMessages[0]!).toContain("MEASUREMENT FAILED: token expired");
  });

  it("leads with extraContext (approval wake-ups)", async () => {
    const goal = makeActiveGoal("g-extra");
    mocks.measureGoalMetric.mockResolvedValueOnce({ ok: true, value: 1 });
    await runGoalTick(getGoal(goal.id)!, "heartbeat", {
      extraContext: "The user merged your PR.",
    });
    expect(mocks.seenMessages[0]!).toContain("The user merged your PR.");
  });
});

describe("runDueGoalTicks", () => {
  it("ticks exactly the goals whose heartbeat is due", async () => {
    const due = makeActiveGoal("g-due");
    getDb()
      .prepare("UPDATE goals SET next_tick_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), due.id);
    const notDue = makeActiveGoal("g-notdue"); // next_tick_at in the future
    mocks.measureGoalMetric.mockResolvedValue({ ok: true, value: 1 });

    await runDueGoalTicks();

    expect(listGoalTicks(due.id, 10)).toHaveLength(1);
    expect(listGoalTicks(due.id, 10)[0]!.trigger_kind).toBe("heartbeat");
    expect(listGoalTicks(notDue.id, 10)).toHaveLength(0);
    // The heartbeat advanced past the stale timestamp.
    expect(getGoal(due.id)!.next_tick_at! > new Date().toISOString()).toBe(true);
  });
});

describe("streamAgentTurn", () => {
  const turnInput = (agent: string) => ({
    projectSlug: SLUG,
    harnessAdapter: "claude-code-local" as const,
    agentId: agent,
    sessionLabel: "main",
    message: "hello",
    source: "test",
  });

  it("persists the handshake and returns the final text as summary", async () => {
    mocks.events = [
      { kind: "session", harnessSessionId: "h-123" },
      { kind: "delta", text: "thinking…" },
      { kind: "final", text: "  all done  " },
    ];
    const onSession = vi.fn();
    const r = await streamAgentTurn({ ...turnInput("sa-1"), onSession });
    expect(r.summary).toBe("all done");
    expect(onSession).toHaveBeenCalledWith(r.sessionId);
    const row = getDb()
      .prepare("SELECT harness_session_id FROM sessions WHERE id = ?")
      .get(r.sessionId) as { harness_session_id: string };
    expect(row.harness_session_id).toBe("h-123");
  });

  it("falls back to the accumulated deltas when no final arrives", async () => {
    mocks.events = [
      { kind: "delta", text: "part one " },
      { kind: "delta", text: "part two" },
    ];
    const r = await streamAgentTurn(turnInput("sa-2"));
    expect(r.summary).toBe("part one part two");
  });

  it("returns a null summary for an empty turn", async () => {
    mocks.events = [];
    const r = await streamAgentTurn(turnInput("sa-3"));
    expect(r.summary).toBeNull();
  });

  it("truncates an oversized final to the summary cap", async () => {
    mocks.events = [{ kind: "final", text: "x".repeat(5000) }];
    const r = await streamAgentTurn(turnInput("sa-4"));
    expect(r.summary!.length).toBe(4001); // 4000 chars + ellipsis
    expect(r.summary!.endsWith("…")).toBe(true);
  });

  it("throws the last non-transient error when the turn dies without a final", async () => {
    mocks.events = [
      { kind: "error", message: "harness crashed", transient: false },
      { kind: "error", message: "retrying…", transient: true },
    ];
    await expect(streamAgentTurn(turnInput("sa-5"))).rejects.toThrow("harness crashed");
  });

  it("falls back to the last error when all were transient", async () => {
    mocks.events = [
      { kind: "error", message: "first blip", transient: true },
      { kind: "error", message: "second blip", transient: true },
    ];
    await expect(streamAgentTurn(turnInput("sa-6"))).rejects.toThrow("second blip");
  });
});

// ── pure brief composition ───────────────────────────────────────────────

function pr(over: Partial<Pr>): Pr {
  return {
    id: "pr-1",
    goal_id: "g",
    action_id: null,
    tick_number: null,
    url: "https://github.com/acme/site/pull/7",
    title: "Fix pricing meta",
    branch: null,
    state: "open",
    review_decision: null,
    comment_count: 0,
    is_draft: false,
    merged_at: null,
    last_synced_at: null,
    sync_error: null,
    next_sync_at: null,
    last_activity_at: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("describePrForBrief", () => {
  it("covers the open-state variants", () => {
    expect(describePrForBrief(pr({ is_draft: true }))).toContain("(draft)");
    expect(describePrForBrief(pr({ review_decision: "CHANGES_REQUESTED" }))).toContain(
      "CHANGES REQUESTED by the user",
    );
    expect(describePrForBrief(pr({ review_decision: "APPROVED" }))).toContain(
      "approved, awaiting merge",
    );
    expect(describePrForBrief(pr({}))).toContain("awaiting the user's review");
    expect(describePrForBrief(pr({ comment_count: 2 }))).toContain(
      "2 comment(s)/review(s)",
    );
  });

  it("covers merged, closed, sync errors, and action links", () => {
    expect(
      describePrForBrief(pr({ state: "merged", merged_at: "2026-07-13T00:00:00Z" })),
    ).toContain("merged 2026-07-13T00:00:00Z");
    expect(describePrForBrief(pr({ state: "closed" }))).toContain(
      "closed WITHOUT merge",
    );
    expect(describePrForBrief(pr({ sync_error: "gh: not found" }))).toContain(
      "(last sync failed: gh: not found)",
    );
    expect(describePrForBrief(pr({ action_id: "act-9" }))).toContain(
      "linked action act-9",
    );
  });
});

const baseCtx: TickContext = {
  goal: {
    metric_name: "clicks",
    baseline_value: 10,
    target_value: 100,
    metric_direction: "increase",
    mode: "achieve",
    deadline: null,
    spend_envelope_usd: null,
  } as unknown as Goal,
  tickNumber: 3,
  nowIso: "2026-07-21T00:00:00.000Z",
  measurement: { ok: true, value: 30 },
  supportReadings: [],
  targetMet: false,
  pastDeadline: false,
  actionsDueForReview: [],
  gatedActions: [],
  gatedByOthers: [],
  userActionRequests: [],
  loggedSpendUsd: 0,
  recentLearnings: [],
  lastTick: null,
  pullRequests: [],
};

describe("buildTickMessage sections", () => {
  it("renders deadline countdown, spend envelope, and the gate lists", () => {
    const gated = {
      id: "act-g",
      description: "raised bids",
      resources_touched_json: JSON.stringify(["campaign:1"]),
      review_after: "2026-07-25T00:00:00.000Z",
    } as GoalAction;
    const due = {
      id: "act-d",
      description: "paused waste",
      expected_effect: "spend down",
      review_after: "2026-07-20T00:00:00.000Z",
    } as GoalAction;
    const msg = buildTickMessage({
      ...baseCtx,
      goal: {
        ...baseCtx.goal,
        deadline: "2026-07-23T00:00:00.000Z",
        spend_envelope_usd: 500,
      } as Goal,
      loggedSpendUsd: 120,
      actionsDueForReview: [due],
      gatedActions: [gated],
      gatedByOthers: [
        {
          ...gated,
          id: "act-o",
          description: "their test",
          resources_touched_json: "[]",
          agent_id: "proj-goal-2",
        } as GoalAction & { agent_id: string },
      ],
    });
    expect(msg).toContain("(2 days left)");
    expect(msg).toContain("$120 logged of $500 envelope");
    expect(msg).toContain("[act-d] paused waste — expected: spend down");
    expect(msg).toContain("[act-g] raised bids — resources: campaign:1");
    expect(msg).toContain("## Gated by OTHER agents");
    expect(msg).toContain("(proj-goal-2) their test — resources: (unspecified)");
  });

  it("flags a met stop condition and a passed deadline", () => {
    const msg = buildTickMessage({
      ...baseCtx,
      goal: { ...baseCtx.goal, deadline: "2026-07-20T00:00:00.000Z" } as Goal,
      targetMet: true,
      pastDeadline: true,
    });
    expect(msg).toContain("- target_met: true");
    expect(msg).toContain("(PASSED)");
    expect(msg).toContain("A stop condition looks met.");
    // No envelope set → new spend is out of bounds by default.
    expect(msg).toContain("spend envelope: none set");
  });

  it("frames maintain goals as holding, not finished", () => {
    const msg = buildTickMessage({
      ...baseCtx,
      goal: { ...baseCtx.goal, mode: "maintain" } as Goal,
      targetMet: true,
    });
    expect(msg).toContain("holding_at_target: true");
    expect(msg).toContain("NOT a reason to close");
    expect(msg).not.toContain("A stop condition looks met.");
  });

  it("renders PRs, learnings, and the last tick", () => {
    const msg = buildTickMessage({
      ...baseCtx,
      pullRequests: [pr({ title: "Fix pricing meta" })],
      recentLearnings: [
        { confidence: "high", body: "Tuesday spikes are noise" } as never,
      ],
      lastTick: {
        tick_number: 2,
        status: "done",
        summary: "reviewed one action",
      } as GoalTick,
    });
    expect(msg).toContain("## Your pull requests");
    expect(msg).toContain("Fix pricing meta");
    expect(msg).toContain("the user merges, never you");
    expect(msg).toContain("- (high) Tuesday spikes are noise");
    expect(msg).toContain("#2 (done): reviewed one action");
  });

  it("renders a summary-less last tick and the measurement-failure guidance", () => {
    const msg = buildTickMessage({
      ...baseCtx,
      measurement: { ok: false, error: "boom" },
      lastTick: { tick_number: 1, status: "failed", summary: null } as GoalTick,
    });
    expect(msg).toContain("- MEASUREMENT FAILED: boom");
    expect(msg).toContain("Diagnose before anything else.");
    expect(msg).toContain("- target_met: false");
    expect(msg).toContain("#1 (failed): (no summary)");
    expect(msg).toContain("- deadline: none");
  });
});
