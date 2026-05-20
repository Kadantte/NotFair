import { beforeEach, describe, expect, it, vi } from "vitest";

const agentExistsMock = vi.fn();
const templateForKeyMock = vi.fn();
const agentNameForMock = vi.fn();
vi.mock("@/server/agent-templates", () => ({
  agentExists: (...a: unknown[]) => agentExistsMock(...a),
  templateForKey: (...a: unknown[]) => templateForKeyMock(...a),
  agentNameFor: (...a: unknown[]) => agentNameForMock(...a),
}));

const createTaskMock = vi.fn();
const getTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const claimProposedTaskMock = vi.fn();
const setTaskThreadIfMissingMock = vi.fn();
vi.mock("@/server/db/tasks", () => ({
  createTask: (...a: unknown[]) => createTaskMock(...a),
  getTask: (...a: unknown[]) => getTaskMock(...a),
  updateTask: (...a: unknown[]) => updateTaskMock(...a),
  claimProposedTask: (...a: unknown[]) => claimProposedTaskMock(...a),
  setTaskThreadIfMissing: (...a: unknown[]) => setTaskThreadIfMissingMock(...a),
}));

const logAgentActionMock = vi.fn();
vi.mock("@/server/db/agent-actions", () => ({
  logAgentAction: (...a: unknown[]) => logAgentActionMock(...a),
}));

const createApprovalMock = vi.fn();
vi.mock("@/server/db/approvals", () => ({
  createApproval: (...a: unknown[]) => createApprovalMock(...a),
}));

import { generateTaskThreadId, processOrchestrationBlocks } from "./process-blocks";

const CMO_ID = "demo-cmo";

describe("processOrchestrationBlocks — create_task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    templateForKeyMock.mockImplementation((k: string) =>
      k === "google_ads"
        ? { key: "google_ads", display_name: "Google Ads" }
        : k === "cmo"
          ? { key: "cmo", display_name: "CMO" }
          : undefined,
    );
    agentNameForMock.mockImplementation(
      (slug: string, key: string) => `${slug}-${key.replace(/_/g, "-")}`,
    );
    agentExistsMock.mockResolvedValue(true);
    createTaskMock.mockImplementation((input) => ({
      id: "task-1",
      project_slug: input.project_slug,
      agent_id: input.agent_id,
      title: input.title,
      brief: input.brief,
      success_criteria: input.success_criteria ?? null,
      status: input.status ?? "proposed",
      assigner_agent_id: input.assigner_agent_id ?? null,
      created_at: "now",
      updated_at: "now",
      deadline_iso: null,
      result_json: null,
      error_message: null,
      thread_id: null,
    }));
  });

  it("creates a task when block is well-formed and assignee exists", async () => {
    const text = `<create_task>
title: Install conversion tracking
assignee: google_ads
brief: Add the tag.
</create_task>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: CMO_ID,
    });
    expect(outcome.tasks_created).toHaveLength(1);
    expect(outcome.errors).toHaveLength(0);
    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_slug: "demo",
        agent_id: "demo-google-ads",
        title: "Install conversion tracking",
        brief: "Add the tag.",
        assigner_agent_id: CMO_ID,
        status: "proposed",
      }),
    );
    expect(logAgentActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "task_created",
        agent_id: CMO_ID,
      }),
    );
  });

  it("rejects assigning to an unknown template", async () => {
    templateForKeyMock.mockReturnValueOnce(undefined);
    const text = `<create_task>
title: x
assignee: nope
brief: y
</create_task>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: CMO_ID,
    });
    expect(outcome.tasks_created).toHaveLength(0);
    expect(outcome.errors[0]?.message).toMatch(/Unknown assignee/);
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("rejects CMO assigning a task to itself", async () => {
    const text = `<create_task>
title: x
assignee: cmo
brief: y
</create_task>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: CMO_ID,
    });
    expect(outcome.errors[0]?.message).toMatch(/cannot assign tasks to itself/);
  });

  it("rejects when the assignee agent isn't provisioned", async () => {
    agentExistsMock.mockResolvedValueOnce(false);
    const text = `<create_task>
title: x
assignee: google_ads
brief: y
</create_task>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: CMO_ID,
    });
    expect(outcome.errors[0]?.message).toMatch(/not provisioned/);
  });

  it("processes multiple blocks in order", async () => {
    const text = `
<create_task>
title: A
assignee: google_ads
brief: a
</create_task>
<create_task>
title: B
assignee: google_ads
brief: b
</create_task>
<create_task>
title: C
assignee: google_ads
brief: c
</create_task>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: CMO_ID,
    });
    expect(outcome.tasks_created).toHaveLength(3);
  });
});

describe("processOrchestrationBlocks — task_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTaskMock.mockReturnValue({
      id: "task-1",
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
  });

  it("updates status to succeeded on status=done", async () => {
    const text = `<task_status>
task_id: task-1
status: done
summary: Conv tag installed; tested.
</task_status>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "succeeded" }),
    );
    expect(outcome.task_status_updates[0]).toEqual({
      task_id: "task-1",
      status: "succeeded",
    });
  });

  it("rejects status update from a non-assignee", async () => {
    const text = `<task_status>
task_id: task-1
status: done
</task_status>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-seo", // not the assignee
    });
    expect(outcome.errors[0]?.message).toMatch(/Only the assignee/);
    expect(updateTaskMock).not.toHaveBeenCalled();
  });

  it("rejects cross-project task updates", async () => {
    getTaskMock.mockReturnValueOnce({
      id: "task-1",
      project_slug: "OTHER",
      agent_id: "demo-google-ads",
    });
    const text = `<task_status>
task_id: task-1
status: done
</task_status>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors[0]?.message).toMatch(/Cross-project/);
  });

  it("rejects unknown task_id", async () => {
    getTaskMock.mockReturnValueOnce(null);
    const text = `<task_status>
task_id: missing
status: done
</task_status>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors[0]?.message).toMatch(/Unknown task_id/);
  });

  it("maps status=working to running", async () => {
    const text = `<task_status>
task_id: task-1
status: working
summary: still on it
</task_status>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "running" }),
    );
    expect(outcome.task_status_updates[0]).toEqual({
      task_id: "task-1",
      status: "running",
    });
  });

  it("maps status=blocked to running (still active, just stalled)", async () => {
    const text = `<task_status>
task_id: task-1
status: blocked
summary: waiting on user
</task_status>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "running" }),
    );
    expect(outcome.task_status_updates[0]?.status).toBe("running");
  });

  it("maps status=failed to failed and surfaces summary into error_message", async () => {
    const text = `<task_status>
task_id: task-1
status: failed
summary: tag fetch returned 500
</task_status>`;
    await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error_message: "tag fetch returned 500",
      }),
    );
  });

  it("uses default error_message when failed status has no summary", async () => {
    const text = `<task_status>
task_id: task-1
status: failed
</task_status>`;
    await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error_message: "agent reported failure",
      }),
    );
  });

  it.each(["cancelled", "failed", "succeeded"] as const)(
    "skips writes when task is already terminal (%s)",
    async (terminal) => {
      getTaskMock.mockReturnValueOnce({
        id: "task-1",
        project_slug: "demo",
        agent_id: "demo-google-ads",
        status: terminal,
      });
      const text = `<task_status>
task_id: task-1
status: done
summary: late
</task_status>`;
      const outcome = await processOrchestrationBlocks(text, {
        project_slug: "demo",
        agent_id: "demo-google-ads",
      });
      // No write happens — the existing terminal status is preserved.
      expect(updateTaskMock).not.toHaveBeenCalled();
      // Outcome still reports the existing status for observability.
      expect(outcome.task_status_updates[0]).toEqual({
        task_id: "task-1",
        status: terminal,
      });
      expect(outcome.errors).toHaveLength(0);
    },
  );

  it("captures thrown errors from getTask as task_status errors (not exceptions)", async () => {
    getTaskMock.mockImplementationOnce(() => {
      throw new Error("db boom");
    });
    const text = `<task_status>
task_id: task-1
status: done
</task_status>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors).toEqual([
      { kind: "task_status", message: "db boom" },
    ]);
  });
});

describe("processOrchestrationBlocks — add_comment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTaskMock.mockReturnValue({
      id: "task-1",
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
  });

  it("logs a task_comment agent_action on success", async () => {
    const text = `<add_comment>
task_id: task-1
body: Picked up; running the audit now.
</add_comment>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.comments_added).toEqual([{ task_id: "task-1" }]);
    expect(logAgentActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "task_comment",
        summary: "Picked up; running the audit now.",
        payload: { task_id: "task-1" },
      }),
    );
    expect(outcome.errors).toHaveLength(0);
  });

  it("rejects comments on unknown task_id", async () => {
    getTaskMock.mockReturnValueOnce(null);
    const text = `<add_comment>
task_id: missing
body: hi
</add_comment>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.comments_added).toHaveLength(0);
    expect(outcome.errors[0]).toEqual({
      kind: "add_comment",
      message: expect.stringMatching(/Unknown task_id/),
    });
  });

  it("rejects cross-project comments", async () => {
    getTaskMock.mockReturnValueOnce({
      id: "task-1",
      project_slug: "OTHER",
      agent_id: "demo-google-ads",
    });
    const text = `<add_comment>
task_id: task-1
body: hi
</add_comment>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors[0]?.message).toMatch(/Cross-project comment/);
  });
});

describe("processOrchestrationBlocks — ask_user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTaskMock.mockReturnValue({
      id: "task-1",
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
  });

  it("logs an ask_user agent_action anchored to a task", async () => {
    const text = `<ask_user>
task_id: task-1
question: What's the daily budget cap?
options: 50, 100, 250
</ask_user>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.ask_user).toEqual([
      { task_id: "task-1", question: "What's the daily budget cap?" },
    ]);
    expect(logAgentActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "ask_user",
        summary: "What's the daily budget cap?",
        payload: { task_id: "task-1", options: "50, 100, 250" },
      }),
    );
  });

  it("allows an ask_user with no task_id (unanchored)", async () => {
    const text = `<ask_user>
question: General preference question?
</ask_user>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-cmo",
    });
    expect(getTaskMock).not.toHaveBeenCalled();
    expect(outcome.ask_user[0]).toEqual({
      task_id: undefined,
      question: "General preference question?",
    });
    expect(logAgentActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "ask_user",
        payload: { task_id: null, options: null },
      }),
    );
  });

  it("rejects ask_user on unknown task_id", async () => {
    getTaskMock.mockReturnValueOnce(null);
    const text = `<ask_user>
task_id: missing
question: hi?
</ask_user>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors[0]?.message).toMatch(/Unknown task_id/);
  });

  it("rejects cross-project ask_user", async () => {
    getTaskMock.mockReturnValueOnce({
      id: "task-1",
      project_slug: "OTHER",
      agent_id: "demo-google-ads",
    });
    const text = `<ask_user>
task_id: task-1
question: hi?
</ask_user>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors[0]?.message).toMatch(/Cross-project ask_user/);
  });
});

describe("processOrchestrationBlocks — request_approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTaskMock.mockReturnValue({
      id: "task-1",
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    createApprovalMock.mockImplementation((input) => ({
      id: "approval-1",
      project_slug: input.project_slug,
      agent_id: input.agent_id,
      action_summary: input.action_summary,
      action_type: input.action_type,
      cost_estimate_usd: input.cost_estimate_usd,
      reasoning: input.reasoning ?? null,
      payload_json: JSON.stringify(input.payload ?? {}),
      status: "pending",
      created_at: "now",
      resolved_at: null,
    }));
  });

  it("creates an approval row and reports it on the outcome", async () => {
    const text = `<request_approval>
task_id: task-1
action_summary: Raise the daily cap on Brand to $200.
action_type: bid_change
cost_estimate_usd: 200
reasoning: Brand is throttled; observed CPC stable.
</request_approval>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_slug: "demo",
        agent_id: "demo-google-ads",
        action_type: "bid_change",
        cost_estimate_usd: 200,
        reasoning: "Brand is throttled; observed CPC stable.",
        payload: { task_id: "task-1" },
      }),
    );
    expect(outcome.approvals_requested).toEqual([
      { approval_id: "approval-1", action_type: "bid_change" },
    ]);
  });

  it("defaults cost_estimate_usd to 0 when not provided", async () => {
    const text = `<request_approval>
action_summary: Publish a new blog post.
action_type: content_publishing
</request_approval>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-cmo",
    });
    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cost_estimate_usd: 0,
        reasoning: null,
        payload: { task_id: null },
      }),
    );
    expect(outcome.approvals_requested).toHaveLength(1);
  });

  it("rejects request_approval on unknown task_id", async () => {
    getTaskMock.mockReturnValueOnce(null);
    const text = `<request_approval>
task_id: missing
action_summary: x
action_type: spend
</request_approval>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors[0]).toEqual({
      kind: "request_approval",
      message: expect.stringMatching(/Unknown task_id/),
    });
    expect(createApprovalMock).not.toHaveBeenCalled();
  });

  it("rejects cross-project request_approval", async () => {
    getTaskMock.mockReturnValueOnce({
      id: "task-1",
      project_slug: "OTHER",
      agent_id: "demo-google-ads",
    });
    const text = `<request_approval>
task_id: task-1
action_summary: x
action_type: spend
</request_approval>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-google-ads",
    });
    expect(outcome.errors[0]?.message).toMatch(/Cross-project approval/);
  });

  it("captures unexpected createApproval errors as request_approval errors", async () => {
    createApprovalMock.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const text = `<request_approval>
action_summary: x
action_type: spend
</request_approval>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: "demo-cmo",
    });
    expect(outcome.errors).toEqual([
      { kind: "request_approval", message: "db down" },
    ]);
    expect(outcome.approvals_requested).toHaveLength(0);
  });

  /**
   * Known open issue: when a specialist emits <request_approval> without a
   * corresponding <task_status status: blocked>, the task stays "running"
   * forever (see MEMORY.md). This test documents the current behavior —
   * processing the approval does NOT also flip the task's status. Marked
   * `.fails` so when the bug is fixed, the test breaks and someone has to
   * decide whether to delete or invert the assertion.
   */
  it.fails(
    "BUG: emitting request_approval alone does not flip the task to blocked",
    async () => {
      const text = `<request_approval>
task_id: task-1
action_summary: Raise budget
action_type: spend
</request_approval>`;
      await processOrchestrationBlocks(text, {
        project_slug: "demo",
        agent_id: "demo-google-ads",
      });
      // We *expect* the task to be marked blocked/paused once the bug is
      // fixed. Today, no task update happens at all.
      expect(updateTaskMock).toHaveBeenCalled();
    },
  );
});

describe("processOrchestrationBlocks — create_task error capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    templateForKeyMock.mockReturnValue({
      key: "google_ads",
      display_name: "Google Ads",
    });
    agentNameForMock.mockImplementation(
      (slug: string, key: string) => `${slug}-${key.replace(/_/g, "-")}`,
    );
    agentExistsMock.mockResolvedValue(true);
  });

  it("captures thrown errors from createTask as create_task errors", async () => {
    createTaskMock.mockImplementationOnce(() => {
      throw new Error("constraint violation");
    });
    const text = `<create_task>
title: A
assignee: google_ads
brief: do the thing
</create_task>`;
    const outcome = await processOrchestrationBlocks(text, {
      project_slug: "demo",
      agent_id: CMO_ID,
    });
    expect(outcome.tasks_created).toHaveLength(0);
    expect(outcome.errors).toEqual([
      { kind: "create_task", message: "constraint violation" },
    ]);
  });
});

describe("generateTaskThreadId", () => {
  it("returns a UUID-shaped string", () => {
    const id = generateTaskThreadId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("returns a new UUID on each call", () => {
    const a = generateTaskThreadId();
    const b = generateTaskThreadId();
    expect(a).not.toBe(b);
  });
});
