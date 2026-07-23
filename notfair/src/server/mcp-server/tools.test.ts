import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  handleAmendGoal: vi.fn(),
  handleAddSupportMetric: vi.fn(),
  handleBackfillHistory: vi.fn(),
  handleDefineGoal: vi.fn(),
  handleGetGoal: vi.fn(),
  handleGetProject: vi.fn(),
  handleLogGoalAction: vi.fn(),
  handleLogLearning: vi.fn(),
  handleProposeGoalMetric: vi.fn(),
  handleProposeTarget: vi.fn(),
  handleRegisterPullRequest: vi.fn(),
  handleReviewGoalAction: vi.fn(),
  handleSearchLearnings: vi.fn(),
  handleSetProjectBrief: vi.fn(),
  handleUpdateGoalStatus: vi.fn(),
}));

vi.mock("@/server/goals/handlers", () => handlers);

import { TOOLS, describeTool, findTool, type ToolResult } from "./tools";

const CTX = { project_slug: "proj", agent_id: "agent-1" };
const BASE = { project_slug: "proj", agent_id: "agent-1", goal_id: "goal-1" };

function ok<T>(data: T) {
  return { ok: true as const, data };
}

async function call(name: string, input: unknown): Promise<ToolResult> {
  const tool = findTool(name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(input, {});
}

function text(result: ToolResult): string {
  if (!result.ok) throw new Error(`expected ok result, got: ${result.error}`);
  return result.content.map((c) => c.text).join("\n");
}

beforeEach(() => {
  for (const fn of Object.values(handlers)) fn.mockReset();
});

describe("registry", () => {
  it("exposes the full goal-lifecycle surface", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "get_goal",
      "define_goal",
      "propose_goal_metric",
      "backfill_metric_history",
      "add_supporting_metric",
      "propose_target",
      "amend_goal",
      "log_goal_action",
      "register_pull_request",
      "review_goal_action",
      "log_learning",
      "search_learnings",
      "update_goal_status",
      "get_project",
      "set_shared_context",
    ]);
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("findTool resolves by name and misses cleanly", () => {
    expect(findTool("get_goal")?.name).toBe("get_goal");
    expect(findTool("no_such_tool")).toBeUndefined();
  });

  it("every tool rejects malformed args without calling its handler", async () => {
    for (const tool of TOOLS) {
      const r = await tool.handler({ project_slug: 42 }, {});
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^Invalid arguments:/);
    }
    for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("describeTool JSON schema", () => {
  it("maps enum/number/string/optionality for propose_goal_metric", () => {
    const desc = describeTool(findTool("propose_goal_metric")!);
    expect(desc.name).toBe("propose_goal_metric");
    const schema = desc.inputSchema as {
      type: string;
      properties: Record<string, { type: string; enum?: string[]; description?: string }>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.metric_direction).toMatchObject({
      type: "string",
      enum: ["increase", "decrease"],
    });
    expect(schema.properties.project_slug).toMatchObject({
      type: "string",
      description: "From IDENTITY.md.",
    });
    expect(schema.required).toEqual([
      "project_slug",
      "agent_id",
      "goal_id",
      "metric_name",
      "metric_source_key",
      "metric_source_tool",
      "metric_source_args_json",
      "metric_direction",
    ]);
  });

  it("optional numbers and booleans keep their types but leave required", () => {
    const define = describeTool(findTool("define_goal")!).inputSchema as {
      properties: Record<string, { type: string }>;
      required: string[];
    };
    expect(define.properties.spend_envelope_usd.type).toBe("number");
    expect(define.required).not.toContain("spend_envelope_usd");
    expect(define.required).not.toContain("deadline");

    const review = describeTool(findTool("review_goal_action")!).inputSchema as {
      properties: Record<string, { type: string }>;
      required: string[];
    };
    expect(review.properties.abandoned.type).toBe("boolean");
    expect(review.required).not.toContain("abandoned");
  });
});

describe("get_goal", () => {
  it("dispatches and returns the goal state as JSON", async () => {
    handlers.handleGetGoal.mockResolvedValueOnce(ok({ statement: "grow" }));
    const r = await call("get_goal", BASE);
    expect(handlers.handleGetGoal).toHaveBeenCalledWith({ goal_id: "goal-1" }, CTX);
    expect(JSON.parse(text(r))).toEqual({ statement: "grow" });
  });

  it("surfaces handler errors", async () => {
    handlers.handleGetGoal.mockResolvedValueOnce({ ok: false, error: "Unknown goal_id 'goal-1'" });
    const r = await call("get_goal", BASE);
    expect(r).toEqual({ ok: false, error: "Unknown goal_id 'goal-1'" });
  });
});

describe("define_goal", () => {
  it("splits caller identity from the payload", async () => {
    handlers.handleDefineGoal.mockReturnValueOnce(ok({ statement: "Cut CAC to $30" }));
    const r = await call("define_goal", {
      ...BASE,
      statement: "Cut CAC to $30",
      short_label: "CAC → $30",
      deadline: "2026-09-01",
      spend_envelope_usd: 500,
    });
    expect(handlers.handleDefineGoal).toHaveBeenCalledWith(
      {
        goal_id: "goal-1",
        statement: "Cut CAC to $30",
        short_label: "CAC → $30",
        deadline: "2026-09-01",
        spend_envelope_usd: 500,
      },
      CTX,
    );
    expect(text(r)).toContain('goal defined: "Cut CAC to $30"');
  });

  it("enforces the 48-char short_label cap", async () => {
    const r = await call("define_goal", {
      ...BASE,
      statement: "x",
      short_label: "y".repeat(49),
    });
    expect(r.ok).toBe(false);
    expect(handlers.handleDefineGoal).not.toHaveBeenCalled();
  });
});

describe("propose_goal_metric", () => {
  it("reports the verified baseline", async () => {
    handlers.handleProposeGoalMetric.mockResolvedValueOnce(ok({ baseline_value: 42.5 }));
    const r = await call("propose_goal_metric", {
      ...BASE,
      metric_name: "CAC (USD, trailing 30d)",
      metric_source_key: "notfair-googleads",
      metric_source_tool: "runScript",
      metric_source_args_json: '{"script":"..."}',
      metric_direction: "decrease",
    });
    expect(handlers.handleProposeGoalMetric).toHaveBeenCalledWith(
      {
        goal_id: "goal-1",
        metric_name: "CAC (USD, trailing 30d)",
        metric_source_key: "notfair-googleads",
        metric_source_tool: "runScript",
        metric_source_args_json: '{"script":"..."}',
        metric_direction: "decrease",
      },
      CTX,
    );
    expect(text(r)).toContain("Baseline measured: 42.5");
  });

  it("rejects an unknown metric_direction", async () => {
    const r = await call("propose_goal_metric", {
      ...BASE,
      metric_name: "x",
      metric_source_key: "k",
      metric_source_tool: "t",
      metric_source_args_json: "{}",
      metric_direction: "sideways",
    });
    expect(r.ok).toBe(false);
  });
});

describe("backfill_metric_history", () => {
  it("summarizes the backfilled range", async () => {
    handlers.handleBackfillHistory.mockResolvedValueOnce(
      ok({ points: 30, from: "2026-06-01", to: "2026-06-30" }),
    );
    const r = await call("backfill_metric_history", {
      ...BASE,
      source_key: "notfair-googleads",
      source_tool: "runScript",
      source_args_json: "{}",
    });
    expect(text(r)).toBe(
      "History backfilled: 30 daily points from 2026-06-01 to 2026-06-30. The progress chart now has context.",
    );
  });

  it("surfaces handler errors", async () => {
    handlers.handleBackfillHistory.mockResolvedValueOnce({ ok: false, error: "query failed" });
    const r = await call("backfill_metric_history", {
      ...BASE,
      source_key: "k",
      source_tool: "t",
      source_args_json: "{}",
    });
    expect(r).toEqual({ ok: false, error: "query failed" });
  });
});

describe("add_supporting_metric", () => {
  const args = {
    ...BASE,
    name: "PRs open (live)",
    source_key: "local",
    source_tool: "shell",
    source_args_json: '{"command":"echo 3"}',
  };

  it("mentions backfilled points when history was provided", async () => {
    handlers.handleAddSupportMetric.mockResolvedValueOnce(
      ok({ metric: { name: "PRs open (live)", current_value: 3 }, backfilled: 30 }),
    );
    const r = await call("add_supporting_metric", { ...args, history_args_json: "{}" });
    expect(text(r)).toContain("current value 3, 30 history points backfilled");
  });

  it("omits the backfill clause when nothing was backfilled", async () => {
    handlers.handleAddSupportMetric.mockResolvedValueOnce(
      ok({ metric: { name: "PRs open (live)", current_value: 3 }, backfilled: 0 }),
    );
    const r = await call("add_supporting_metric", args);
    expect(text(r)).not.toContain("backfilled");
  });
});

describe("propose_target", () => {
  it("rejects an invalid cadence_cron before touching the handler", async () => {
    const r = await call("propose_target", {
      ...BASE,
      target_value: 30,
      cadence_cron: "not a cron",
    });
    expect(r).toEqual({
      ok: false,
      error: "Invalid cadence_cron 'not a cron' — must be a 5-field cron expression.",
    });
    expect(handlers.handleProposeTarget).not.toHaveBeenCalled();
  });

  it("accepts a valid cron and starts the loop", async () => {
    handlers.handleProposeTarget.mockReturnValueOnce(ok({}));
    const r = await call("propose_target", {
      ...BASE,
      target_value: 30,
      mode: "maintain",
      cadence_cron: "0 16 * * 1-5",
    });
    expect(handlers.handleProposeTarget).toHaveBeenCalledWith(
      { goal_id: "goal-1", target_value: 30, mode: "maintain", cadence_cron: "0 16 * * 1-5" },
      CTX,
    );
    expect(text(r)).toContain("loop is LIVE");
  });

  it("cadence_cron is optional", async () => {
    handlers.handleProposeTarget.mockReturnValueOnce(ok({}));
    const r = await call("propose_target", { ...BASE, target_value: 30 });
    expect(r.ok).toBe(true);
  });
});

describe("amend_goal", () => {
  it("validates cadence_cron", async () => {
    const r = await call("amend_goal", { ...BASE, cadence_cron: "99 99 * * *" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Invalid cadence_cron");
    expect(handlers.handleAmendGoal).not.toHaveBeenCalled();
  });

  it("echoes the amended values, with placeholders for unset fields", async () => {
    handlers.handleAmendGoal.mockReturnValueOnce(
      ok({ target_value: null, deadline: null, spend_envelope_usd: null, cadence_cron: "0 16 * * *" }),
    );
    const r = await call("amend_goal", { ...BASE, cadence_cron: "0 16 * * *" });
    expect(text(r)).toBe(
      "Goal amended: target=—, deadline=none, envelope=none, cadence=0 16 * * *. Confirm the change back to the user.",
    );
  });

  it("formats set values", async () => {
    handlers.handleAmendGoal.mockReturnValueOnce(
      ok({
        target_value: 25,
        deadline: "2026-10-01",
        spend_envelope_usd: 400,
        cadence_cron: "0 16 * * 1",
      }),
    );
    const r = await call("amend_goal", { ...BASE, target_value: 25 });
    expect(text(r)).toContain("target=25, deadline=2026-10-01, envelope=$400, cadence=0 16 * * 1");
  });
});

describe("log_goal_action", () => {
  const args = {
    ...BASE,
    kind: "mutation",
    description: "Lower tROAS to 220% on campaign 123",
    expected_effect: "CPA -$3 within 7 days",
  };

  it("splits resources_touched into a trimmed list", async () => {
    handlers.handleLogGoalAction.mockReturnValueOnce(
      ok({ action_id: "act-1", review_after: "2026-07-25T00:00:00.000Z" }),
    );
    const r = await call("log_goal_action", {
      ...args,
      resources_touched: " campaign:123 , adgroup:456,, ",
      review_after_hours: 120,
    });
    expect(handlers.handleLogGoalAction).toHaveBeenCalledWith(
      {
        goal_id: "goal-1",
        kind: "mutation",
        description: "Lower tROAS to 220% on campaign 123",
        expected_effect: "CPA -$3 within 7 days",
        resources_touched: ["campaign:123", "adgroup:456"],
        review_after_hours: 120,
      },
      CTX,
    );
    expect(text(r)).toBe(
      "action act-1 logged. Review due 2026-07-25T00:00:00.000Z. Its resources are gated until then.",
    );
  });

  it("defaults resources to [] and omits the gate sentence without review_after", async () => {
    handlers.handleLogGoalAction.mockReturnValueOnce(ok({ action_id: "act-2", review_after: null }));
    const r = await call("log_goal_action", { ...args, kind: "research" });
    expect(handlers.handleLogGoalAction).toHaveBeenCalledWith(
      expect.objectContaining({ resources_touched: [] }),
      CTX,
    );
    expect(text(r)).toBe("action act-2 logged.");
  });
});

describe("register_pull_request", () => {
  it("dispatches and reports the PR state", async () => {
    handlers.handleRegisterPullRequest.mockResolvedValueOnce(ok({ state: "open" }));
    const r = await call("register_pull_request", {
      ...BASE,
      url: "https://github.com/o/r/pull/7",
      title: "feat: add landing page",
      branch: "feat/landing",
      action_id: "act-1",
    });
    expect(handlers.handleRegisterPullRequest).toHaveBeenCalledWith(
      {
        goal_id: "goal-1",
        url: "https://github.com/o/r/pull/7",
        title: "feat: add landing page",
        branch: "feat/landing",
        action_id: "act-1",
      },
      CTX,
    );
    expect(text(r)).toContain("PR registered (state: open)");
  });
});

describe("review_goal_action", () => {
  it("reports status and any recorded learning", async () => {
    handlers.handleReviewGoalAction.mockReturnValueOnce(
      ok({ action_id: "act-1", status: "reviewed", learning_id: "lrn-9" }),
    );
    const r = await call("review_goal_action", {
      ...BASE,
      action_id: "act-1",
      observed_outcome: "CPA fell $2.10 vs the $3 predicted",
      learning: "tROAS moves take ~5 days to settle",
    });
    expect(text(r)).toBe("action act-1 reviewed. Learning lrn-9 recorded.");
  });

  it("omits the learning clause when none was recorded", async () => {
    handlers.handleReviewGoalAction.mockReturnValueOnce(
      ok({ action_id: "act-1", status: "abandoned", learning_id: null }),
    );
    const r = await call("review_goal_action", {
      ...BASE,
      action_id: "act-1",
      observed_outcome: "reverted",
      abandoned: true,
    });
    expect(text(r)).toBe("action act-1 abandoned.");
  });
});

describe("log_learning / search_learnings", () => {
  it("log_learning confirms the recorded id", async () => {
    handlers.handleLogLearning.mockReturnValueOnce(ok({ learning_id: "lrn-1" }));
    const r = await call("log_learning", {
      ...BASE,
      body: "Brand campaigns cap out at ~$40/day",
      confidence: "high",
    });
    expect(handlers.handleLogLearning).toHaveBeenCalledWith(
      { goal_id: "goal-1", body: "Brand campaigns cap out at ~$40/day", confidence: "high" },
      CTX,
    );
    expect(text(r)).toBe("learning lrn-1 recorded.");
  });

  it("search_learnings returns the matches as JSON", async () => {
    handlers.handleSearchLearnings.mockReturnValueOnce(
      ok({ learnings: [{ id: "lrn-1", body: "fact" }] }),
    );
    const r = await call("search_learnings", { ...BASE, query: "fact", limit: 5 });
    expect(handlers.handleSearchLearnings).toHaveBeenCalledWith(
      { goal_id: "goal-1", query: "fact", limit: 5 },
      CTX,
    );
    expect(JSON.parse(text(r))).toEqual([{ id: "lrn-1", body: "fact" }]);
  });
});

describe("update_goal_status", () => {
  it("dispatches and confirms the new status", async () => {
    handlers.handleUpdateGoalStatus.mockReturnValueOnce(
      ok({ goal_id: "goal-1", status: "achieved" }),
    );
    const r = await call("update_goal_status", {
      ...BASE,
      status: "achieved",
      reason: "CAC measured at $28.40, target $30",
    });
    expect(text(r)).toBe("goal goal-1 is now 'achieved'.");
  });

  it("rejects statuses outside the enum", async () => {
    const r = await call("update_goal_status", { ...BASE, status: "done", reason: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("get_project / set_shared_context", () => {
  it("get_project returns project metadata as JSON", async () => {
    handlers.handleGetProject.mockReturnValueOnce(ok({ slug: "proj", website: "https://x.co" }));
    const r = await call("get_project", { project_slug: "proj", agent_id: "agent-1" });
    expect(handlers.handleGetProject).toHaveBeenCalledWith({}, CTX);
    expect(JSON.parse(text(r))).toEqual({ slug: "proj", website: "https://x.co" });
  });

  it("set_shared_context pluralizes the synced-agent count", async () => {
    handlers.handleSetProjectBrief.mockResolvedValueOnce(ok({ bytes: 512, synced_agents: 2 }));
    const two = await call("set_shared_context", {
      project_slug: "proj",
      agent_id: "agent-1",
      content: "# Brief",
    });
    expect(handlers.handleSetProjectBrief).toHaveBeenCalledWith({ content: "# Brief" }, CTX);
    expect(text(two)).toBe("shared context updated (512 bytes); 2 agent identities re-rendered.");

    handlers.handleSetProjectBrief.mockResolvedValueOnce(ok({ bytes: 64, synced_agents: 1 }));
    const one = await call("set_shared_context", {
      project_slug: "proj",
      agent_id: "agent-1",
      content: "# Brief",
    });
    expect(text(one)).toBe("shared context updated (64 bytes); 1 agent identity re-rendered.");
  });
});
