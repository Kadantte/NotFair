import { describe, expect, it } from "vitest";

import type { Task } from "@/types";

import { buildTaskKickoffMessage } from "./task-kickoff";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-123",
    display_id: "demo-1",
    project_slug: "demo",
    agent_id: "demo-google-ads",
    title: "Install conversion tracking",
    brief: "Add the Google Ads conversion tag to /thanks.",
    success_criteria: "Tag fires on /thanks and a test conv lands in Google Ads.",
    deadline_iso: null,
    status: "running",
    result_json: null,
    error_message: null,
    thread_id: "thread-1",
    assigner_agent_id: "demo-cmo",
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    ...overrides,
  };
}

describe("buildTaskKickoffMessage", () => {
  it("opens with the (task assignment) header so the agent recognizes the system-injected turn", () => {
    const msg = buildTaskKickoffMessage(makeTask());
    expect(msg.startsWith("(task assignment)")).toBe(true);
  });

  it("includes the canonical task fields in a stable order", () => {
    const msg = buildTaskKickoffMessage(makeTask());
    // Each piece appears, and the brief comes before success criteria.
    expect(msg).toContain("Task ID: task-123");
    expect(msg).toContain("Title: Install conversion tracking");
    expect(msg).toContain("Brief:");
    expect(msg).toContain("Add the Google Ads conversion tag to /thanks.");
    expect(msg).toContain("Success criteria:");
    expect(msg).toContain(
      "Tag fires on /thanks and a test conv lands in Google Ads.",
    );
    expect(msg.indexOf("Brief:")).toBeLessThan(msg.indexOf("Success criteria:"));
  });

  it("falls back to '(untitled)' when title is null", () => {
    const msg = buildTaskKickoffMessage(makeTask({ title: null }));
    expect(msg).toContain("Title: (untitled)");
  });

  it("omits the Success criteria section entirely when success_criteria is null", () => {
    const msg = buildTaskKickoffMessage(
      makeTask({ success_criteria: null }),
    );
    expect(msg).not.toContain("Success criteria:");
    // Still has the trailing instructions block.
    expect(msg).toContain("Acknowledge this task");
  });

  it("teaches the agent the <task_status> done emission contract with the right task_id", () => {
    const msg = buildTaskKickoffMessage(makeTask({ id: "task-xyz" }));
    expect(msg).toContain("<task_status>");
    expect(msg).toContain("task_id: task-xyz");
    expect(msg).toContain("status: done");
    expect(msg).toContain("</task_status>");
  });

  it("mentions the blocked/ask_user/request_approval escape hatches so agents know how to bail", () => {
    const msg = buildTaskKickoffMessage(makeTask());
    expect(msg).toMatch(/status:\s*blocked/);
    expect(msg).toContain("<ask_user>");
    expect(msg).toContain("<add_comment>");
    expect(msg).toContain("<request_approval>");
  });

  it("tells the agent to actually use its tools, not just describe", () => {
    const msg = buildTaskKickoffMessage(makeTask());
    expect(msg).toContain("Use your tools");
    expect(msg).toContain("don't just describe what you'd do");
  });

  it("returns a multi-line string (joined with \\n, not \\r\\n)", () => {
    const msg = buildTaskKickoffMessage(makeTask());
    expect(msg).not.toContain("\r");
    expect(msg.split("\n").length).toBeGreaterThan(10);
  });

  it("preserves multi-line brief content verbatim", () => {
    const brief = "Step 1: import GA4.\nStep 2: map conv to lead.\nStep 3: verify.";
    const msg = buildTaskKickoffMessage(makeTask({ brief }));
    expect(msg).toContain(brief);
  });
});
