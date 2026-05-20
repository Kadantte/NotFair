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
vi.mock("@/server/db/tasks", () => ({
  createTask: (...a: unknown[]) => createTaskMock(...a),
  getTask: (...a: unknown[]) => getTaskMock(...a),
  updateTask: (...a: unknown[]) => updateTaskMock(...a),
}));

const logAgentActionMock = vi.fn();
vi.mock("@/server/db/agent-actions", () => ({
  logAgentAction: (...a: unknown[]) => logAgentActionMock(...a),
}));

import { processOrchestrationBlocks } from "./process-blocks";

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
});
