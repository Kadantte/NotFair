import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "@/types";

// --- Module mocks (must be set up before importing the SUT). ---

const claimProposedTaskMock = vi.fn();
const setTaskThreadIfMissingMock = vi.fn();
const updateTaskMock = vi.fn();
vi.mock("@/server/db/tasks", () => ({
  claimProposedTask: (...a: unknown[]) => claimProposedTaskMock(...a),
  setTaskThreadIfMissing: (...a: unknown[]) => setTaskThreadIfMissingMock(...a),
  updateTask: (...a: unknown[]) => updateTaskMock(...a),
}));

const streamChatViaGatewayMock = vi.fn();
vi.mock("@/server/openclaw/gateway-client", () => ({
  streamChatViaGateway: (...a: unknown[]) => streamChatViaGatewayMock(...a),
}));

vi.mock("@/server/openclaw/sessions", () => ({
  buildPendingSessionKey: (agent: string, thread: string) =>
    `agent:${agent}:${thread}`,
}));

const processOrchestrationBlocksMock = vi.fn();
const generateTaskThreadIdMock = vi.fn(() => "thread-fresh");
vi.mock("./process-blocks", () => ({
  processOrchestrationBlocks: (...a: unknown[]) =>
    processOrchestrationBlocksMock(...a),
  generateTaskThreadId: () => generateTaskThreadIdMock(),
}));

// task-kickoff is small + pure — let the real implementation run so we don't
// silently mask a contract change between run-task and the kickoff message.

import { runTaskKickoffServerSide, startTaskIfProposed } from "./run-task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    display_id: "demo-1",
    project_slug: "demo",
    agent_id: "demo-google-ads",
    title: "Install conversion tracking",
    brief: "Add the Google Ads conversion tag.",
    success_criteria: "Tag fires on /thanks; conv appears in Google Ads.",
    deadline_iso: null,
    status: "proposed",
    result_json: null,
    error_message: null,
    thread_id: "thread-existing",
    assigner_agent_id: "demo-cmo",
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    ...overrides,
  };
}

// Helper: build an async-iterable matching the StreamChatInput contract.
async function* eventStream(
  events: Array<{ kind: "delta"; text: string } | { kind: "error"; message: string }>,
): AsyncGenerator<unknown, void, void> {
  for (const evt of events) yield evt;
}

describe("startTaskIfProposed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: streaming returns no text so the kickoff is a no-op past the
    // claim. Individual tests override.
    streamChatViaGatewayMock.mockImplementation(() => eventStream([]));
  });

  it("returns the input task untouched when the claim fails (already running)", () => {
    claimProposedTaskMock.mockReturnValue(null);
    const task = makeTask({ status: "running" });
    const result = startTaskIfProposed(task);
    expect(result).toBe(task);
    // Kickoff must not be triggered when the claim doesn't succeed.
    expect(streamChatViaGatewayMock).not.toHaveBeenCalled();
  });

  it("returns the claimed task and fires kickoff in the background when claim succeeds", async () => {
    const claimed = makeTask({ status: "running" });
    claimProposedTaskMock.mockReturnValue(claimed);

    const result = startTaskIfProposed(makeTask({ status: "proposed" }));
    expect(result).toBe(claimed);
    expect(claimProposedTaskMock).toHaveBeenCalledWith("task-1");

    // The kickoff is fire-and-forget; let microtasks drain so it actually runs.
    await new Promise((r) => setImmediate(r));
    expect(streamChatViaGatewayMock).toHaveBeenCalledTimes(1);
  });

  it("swallows kickoff errors so the caller (synchronous) never throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimed = makeTask({ status: "running", thread_id: null });
    claimProposedTaskMock.mockReturnValue(claimed);
    // Force the kickoff to throw — thread assignment will fail because both
    // claim + setTaskThreadIfMissing return null.
    setTaskThreadIfMissingMock.mockReturnValue(null);

    expect(() =>
      startTaskIfProposed(makeTask({ status: "proposed", thread_id: null })),
    ).not.toThrow();

    // Wait for the background error to surface via console.error.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(errSpy).toHaveBeenCalledWith(
      "[start-task] kickoff failed:",
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});

describe("runTaskKickoffServerSide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processOrchestrationBlocksMock.mockResolvedValue({
      tasks_created: [],
      task_status_updates: [],
      comments_added: [],
      ask_user: [],
      approvals_requested: [],
      errors: [],
    });
  });

  it("consumes the gateway stream, accumulates deltas, and forwards them to orchestration", async () => {
    streamChatViaGatewayMock.mockImplementation(() =>
      eventStream([
        { kind: "delta", text: "On it. " },
        { kind: "delta", text: "Wrapping up.\n" },
        { kind: "delta", text: "<task_status>\ntask_id: task-1\nstatus: done\n</task_status>" },
      ]),
    );

    await runTaskKickoffServerSide(makeTask());

    expect(streamChatViaGatewayMock).toHaveBeenCalledTimes(1);
    const [call] = streamChatViaGatewayMock.mock.calls;
    expect(call?.[0]).toEqual(
      expect.objectContaining({
        sessionKey: "agent:demo-google-ads:thread-existing",
        sessionId: "thread-existing",
        // The kickoff message is built by buildTaskKickoffMessage — sanity-check
        // it carries the brief without locking the prose to a snapshot.
        message: expect.stringContaining("Add the Google Ads conversion tag."),
      }),
    );
    expect(call?.[0].message).toContain("Task ID: task-1");

    // Orchestration sees the full accumulated buffer and the correct context.
    expect(processOrchestrationBlocksMock).toHaveBeenCalledWith(
      "On it. Wrapping up.\n<task_status>\ntask_id: task-1\nstatus: done\n</task_status>",
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );

    expect(updateTaskMock).not.toHaveBeenCalled();
  });

  it("lazily assigns a fresh thread_id when the task has none yet", async () => {
    const refreshed = makeTask({ thread_id: "thread-fresh" });
    setTaskThreadIfMissingMock.mockReturnValue(refreshed);
    streamChatViaGatewayMock.mockImplementation(() => eventStream([]));

    await runTaskKickoffServerSide(makeTask({ thread_id: null }));

    expect(setTaskThreadIfMissingMock).toHaveBeenCalledWith(
      "task-1",
      "thread-fresh",
    );
    expect(streamChatViaGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "thread-fresh",
        sessionKey: "agent:demo-google-ads:thread-fresh",
      }),
    );
  });

  it("throws when no thread_id can be assigned (and does not call the gateway)", async () => {
    setTaskThreadIfMissingMock.mockReturnValue(null);
    await expect(
      runTaskKickoffServerSide(makeTask({ thread_id: null })),
    ).rejects.toThrow(/Failed to assign thread_id/);
    expect(streamChatViaGatewayMock).not.toHaveBeenCalled();
  });

  it("on gateway error event: marks task failed and skips orchestration", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    streamChatViaGatewayMock.mockImplementation(() =>
      eventStream([
        { kind: "delta", text: "partial..." },
        { kind: "error", message: "gateway exploded" },
      ]),
    );

    await runTaskKickoffServerSide(makeTask());

    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error_message: "gateway exploded",
      }),
    );
    expect(processOrchestrationBlocksMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("on gateway iterator throw: marks task failed with the thrown message", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    streamChatViaGatewayMock.mockImplementation(async function* () {
      yield { kind: "delta", text: "starting..." };
      throw new Error("socket closed");
    });

    await runTaskKickoffServerSide(makeTask());

    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error_message: "socket closed",
      }),
    );
    errSpy.mockRestore();
  });

  it("on non-Error throw from gateway: stringifies the value into error_message", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    streamChatViaGatewayMock.mockImplementation(async function* () {
      // Some libraries reject with non-Error sentinels (e.g. plain strings).
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string-reason";
      yield { kind: "delta", text: "" }; // keep async generator type happy
    });

    await runTaskKickoffServerSide(makeTask());

    expect(updateTaskMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error_message: "string-reason",
      }),
    );
    errSpy.mockRestore();
  });

  it("skips orchestration entirely when the buffered text is blank", async () => {
    streamChatViaGatewayMock.mockImplementation(() =>
      eventStream([
        { kind: "delta", text: "   " },
        { kind: "delta", text: "\n\n" },
      ]),
    );
    await runTaskKickoffServerSide(makeTask());
    expect(processOrchestrationBlocksMock).not.toHaveBeenCalled();
    expect(updateTaskMock).not.toHaveBeenCalled();
  });

  it("logs but does not rethrow when orchestration processing itself fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    streamChatViaGatewayMock.mockImplementation(() =>
      eventStream([{ kind: "delta", text: "hello" }]),
    );
    processOrchestrationBlocksMock.mockRejectedValue(new Error("parse boom"));

    await expect(runTaskKickoffServerSide(makeTask())).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("orchestration processing failed"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it("keeps the existing thread_id when the task already has one (no lazy mint)", async () => {
    streamChatViaGatewayMock.mockImplementation(() => eventStream([]));
    await runTaskKickoffServerSide(makeTask({ thread_id: "thread-existing" }));
    expect(setTaskThreadIfMissingMock).not.toHaveBeenCalled();
    expect(streamChatViaGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "thread-existing" }),
    );
  });
});
