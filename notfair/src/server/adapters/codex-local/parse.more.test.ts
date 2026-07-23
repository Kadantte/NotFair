import { describe, expect, it } from "vitest";

import {
  isAdvisoryCodexItemError,
  isTransientCodexError,
  makeCodexStreamState,
  parseCodexLine,
} from "./parse";

const line = (obj: unknown) => JSON.stringify(obj);

describe("parseCodexLine — noise handling", () => {
  it("ignores blank lines, invalid JSON and unknown types", () => {
    const state = makeCodexStreamState();
    expect(parseCodexLine("", state)).toEqual([]);
    expect(parseCodexLine("garbage {", state)).toEqual([]);
    expect(parseCodexLine(line({ type: "mystery" }), state)).toEqual([]);
  });

  it("ignores item.completed for non-toolish, non-message item types", () => {
    expect(
      parseCodexLine(
        line({ type: "item.completed", item: { type: "reasoning", text: "thinking" } }),
        makeCodexStreamState(),
      ),
    ).toEqual([]);
  });
});

describe("parseCodexLine — thread lifecycle", () => {
  it("emits lifecycle + session on thread.started", () => {
    const state = makeCodexStreamState();
    const events = parseCodexLine(
      line({ type: "thread.started", thread_id: "th-1" }),
      state,
    );
    expect(events).toEqual([
      { kind: "lifecycle", phase: "start" },
      { kind: "session", harnessSessionId: "th-1" },
    ]);
    expect(state.threadId).toBe("th-1");
  });

  it("emits only lifecycle when thread.started lacks a thread id", () => {
    const events = parseCodexLine(
      line({ type: "thread.started" }),
      makeCodexStreamState(),
    );
    expect(events).toEqual([{ kind: "lifecycle", phase: "start" }]);
  });
});

describe("parseCodexLine — agent messages and finals", () => {
  it("forwards agent_message text whole as one delta, then final on turn.completed", () => {
    const state = makeCodexStreamState();
    const deltas = parseCodexLine(
      line({ type: "item.completed", item: { type: "agent_message", text: "answer" } }),
      state,
    );
    expect(deltas).toEqual([{ kind: "delta", text: "answer" }]);

    const finals = parseCodexLine(line({ type: "turn.completed", usage: {} }), state);
    expect(finals).toEqual([{ kind: "final", text: "answer" }]);
    expect(state.finalized).toBe(true);
  });

  it("accumulates multiple agent messages into the final text", () => {
    const state = makeCodexStreamState();
    parseCodexLine(
      line({ type: "item.completed", item: { type: "agent_message", text: "one " } }),
      state,
    );
    parseCodexLine(
      line({ type: "item.completed", item: { type: "agent_message", text: "two" } }),
      state,
    );
    expect(parseCodexLine(line({ type: "turn.completed" }), state)).toEqual([
      { kind: "final", text: "one two" },
    ]);
  });
});

describe("parseCodexLine — tool naming", () => {
  it("names command_execution items 'shell' and keeps the command in the label", () => {
    const state = makeCodexStreamState();
    const started = parseCodexLine(
      line({
        type: "item.started",
        item: { type: "command_execution", id: "c1", command: "ls -la\npwd" },
      }),
      state,
    );
    expect(started).toEqual([
      { kind: "tool", phase: "start", toolCallId: "c1", name: "shell", label: "ls -la" },
    ]);

    const completed = parseCodexLine(
      line({
        type: "item.completed",
        item: { type: "command_execution", id: "c1", command: "ls -la" },
      }),
      state,
    );
    expect(completed).toEqual([
      { kind: "tool", phase: "result", toolCallId: "c1", name: "shell" },
    ]);
  });

  it("clips a long command label to 160 chars", () => {
    const events = parseCodexLine(
      line({
        type: "item.started",
        item: { type: "command_execution", id: "c2", command: "x".repeat(200) },
      }),
      makeCodexStreamState(),
    );
    const label = (events[0] as { label: string }).label;
    expect(label).toHaveLength(160);
    expect(label.endsWith("…")).toBe(true);
  });

  it("keeps declared names for function_call items", () => {
    const events = parseCodexLine(
      line({
        type: "item.started",
        item: { type: "function_call", id: "f1", name: "lookup_thing" },
      }),
      makeCodexStreamState(),
    );
    expect(events[0]).toMatchObject({ kind: "tool", name: "lookup_thing" });
  });

  it("uses tool name without a server prefix for serverless mcp_call items", () => {
    const events = parseCodexLine(
      line({
        type: "item.started",
        item: { type: "mcp_call", id: "m1", tool_name: "getInsights" },
      }),
      makeCodexStreamState(),
    );
    expect(events[0]).toMatchObject({ name: "getInsights" });
  });

  it("degrades to the 'tool' token when every naming signal is missing", () => {
    const events = parseCodexLine(
      line({ type: "item.started", item: { type: "tool_call", id: "t1" } }),
      makeCodexStreamState(),
    );
    expect(events[0]).toMatchObject({ toolCallId: "t1", name: "tool" });
    expect((events[0] as { label?: string }).label).toBeUndefined();
  });
});

describe("parseCodexLine — errors", () => {
  it("surfaces non-advisory item errors as transient errors", () => {
    const events = parseCodexLine(
      line({
        type: "item.completed",
        item: { type: "error", message: "tool exploded" },
      }),
      makeCodexStreamState(),
    );
    expect(events).toEqual([
      { kind: "error", message: "tool exploded", transient: true },
    ]);
  });

  it("suppresses advisory item errors that codex prints on every run", () => {
    const events = parseCodexLine(
      line({
        type: "item.completed",
        item: {
          type: "error",
          message: "Skill descriptions were shortened to fit the 2% skills context budget.",
        },
      }),
      makeCodexStreamState(),
    );
    expect(events).toEqual([]);
  });

  it("marks terminal turn.failed as finalized with a non-transient error", () => {
    const state = makeCodexStreamState();
    const events = parseCodexLine(
      line({ type: "turn.failed", error: { message: "quota exhausted" } }),
      state,
    );
    expect(events).toEqual([
      { kind: "error", message: "quota exhausted", transient: false },
    ]);
    expect(state.finalized).toBe(true);
  });

  it("keeps the turn un-finalized on transient reconnect chatter", () => {
    const state = makeCodexStreamState();
    const events = parseCodexLine(
      line({ type: "turn.failed", error: { message: "Reconnecting... 2/5 (mcp)" } }),
      state,
    );
    expect(events).toEqual([
      { kind: "error", message: "Reconnecting... 2/5 (mcp)", transient: true },
    ]);
    expect(state.finalized).toBe(false);
  });

  it("falls back to a generic message when turn.failed carries none", () => {
    const events = parseCodexLine(
      line({ type: "turn.failed" }),
      makeCodexStreamState(),
    );
    expect(events[0]).toMatchObject({ message: "codex turn failed" });
  });

  it("forwards top-level error events with transient tagging", () => {
    expect(
      parseCodexLine(line({ type: "error", message: "boom" }), makeCodexStreamState()),
    ).toEqual([{ kind: "error", message: "boom", transient: false }]);
    expect(
      parseCodexLine(line({ type: "error" }), makeCodexStreamState()),
    ).toEqual([{ kind: "error", message: "codex error", transient: false }]);
  });
});

describe("transient / advisory classifiers", () => {
  it("classifies only the reconnect loop as transient", () => {
    expect(isTransientCodexError("Reconnecting... 3/5 (network)")).toBe(true);
    expect(isTransientCodexError("  Reconnecting... 1/5")).toBe(true);
    expect(isTransientCodexError("connection reset")).toBe(false);
  });

  it("classifies the skills-budget nudge as advisory", () => {
    expect(isAdvisoryCodexItemError("Skill descriptions were shortened …")).toBe(true);
    expect(isAdvisoryCodexItemError("real failure")).toBe(false);
  });
});
