import { describe, expect, it, vi } from "vitest";

import type { TranscriptEvent } from "@/server/sessions/transcript-tail";
import {
  collapseEvents,
  handleSseEvent,
  upsertToolEntry,
  type SseToolEvent,
} from "./transcript-model";

const t = 1_800_000_000_000;

function handlers() {
  return {
    onText: vi.fn(),
    onTool: vi.fn(),
    onError: vi.fn(),
    onLifecycle: vi.fn(),
    onMeta: vi.fn(),
    onPerf: vi.fn(),
  };
}

const frame = (evt: string, data: unknown) =>
  `event: ${evt}\ndata: ${JSON.stringify(data)}`;

describe("handleSseEvent", () => {
  it("dispatches text chunks", () => {
    const h = handlers();
    handleSseEvent(frame("text", { chunk: "Hello" }), h);
    expect(h.onText).toHaveBeenCalledWith("Hello");
  });

  it("ignores text frames without a string chunk", () => {
    const h = handlers();
    handleSseEvent(frame("text", { chunk: 42 }), h);
    expect(h.onText).not.toHaveBeenCalled();
  });

  it("dispatches tool events verbatim", () => {
    const h = handlers();
    const evt: SseToolEvent = {
      phase: "start",
      tool_call_id: "t1",
      name: "shell",
      label: "ls",
    };
    handleSseEvent(frame("tool", evt), h);
    expect(h.onTool).toHaveBeenCalledWith(evt);
  });

  it("dispatches lifecycle phases only when a handler is wired", () => {
    const h = handlers();
    handleSseEvent(frame("lifecycle", { phase: "run.warming" }), h);
    expect(h.onLifecycle).toHaveBeenCalledWith("run.warming");
    // Non-string phase is dropped.
    handleSseEvent(frame("lifecycle", { phase: 3 }), h);
    expect(h.onLifecycle).toHaveBeenCalledTimes(1);
    // No handler — must not throw.
    expect(() =>
      handleSseEvent(frame("lifecycle", { phase: "x" }), {
        onText: vi.fn(),
        onTool: vi.fn(),
        onError: vi.fn(),
      }),
    ).not.toThrow();
  });

  it("dispatches meta and perf frames", () => {
    const h = handlers();
    handleSseEvent(frame("meta", { agent: "a1", message_chars: 5 }), h);
    expect(h.onMeta).toHaveBeenCalledWith({ agent: "a1", message_chars: 5 });
    const marks = [{ name: "first_token", at: 12.4, delta: 12.4 }];
    handleSseEvent(frame("perf", { marks }), h);
    expect(h.onPerf).toHaveBeenCalledWith(marks);
    // Non-array marks are dropped.
    handleSseEvent(frame("perf", { marks: "nope" }), h);
    expect(h.onPerf).toHaveBeenCalledTimes(1);
  });

  it("dispatches errors with a fallback message", () => {
    const h = handlers();
    handleSseEvent(frame("error", { message: "boom" }), h);
    expect(h.onError).toHaveBeenCalledWith("boom");
    handleSseEvent(frame("error", {}), h);
    expect(h.onError).toHaveBeenCalledWith("unknown error");
  });

  it("ignores malformed frames", () => {
    const h = handlers();
    handleSseEvent("data: {}", h); // no event line
    handleSseEvent("event: text", h); // no data line
    handleSseEvent("event: text\ndata: {not json", h); // bad JSON
    handleSseEvent(frame("mystery", { x: 1 }), h); // unknown event type
    expect(h.onText).not.toHaveBeenCalled();
    expect(h.onTool).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });
});

describe("upsertToolEntry (top-up)", () => {
  it("inserts a result-phase event for an unseen tool as already done", () => {
    const entries = upsertToolEntry([], {
      phase: "result",
      tool_call_id: "t1",
      name: "shell",
    });
    expect(entries[0]).toMatchObject({ toolCallId: "t1", done: true, label: null });
  });

  it("keeps the existing label when an update omits it", () => {
    let entries = upsertToolEntry([], {
      phase: "start",
      tool_call_id: "t1",
      name: "shell",
      label: "ls -la",
    });
    entries = upsertToolEntry(entries, {
      phase: "update",
      tool_call_id: "t1",
      name: "shell",
    });
    expect(entries[0]).toMatchObject({ label: "ls -la", done: false });
  });
});

describe("collapseEvents (top-up)", () => {
  const user = (id: string, body: string, system?: boolean): TranscriptEvent => ({
    kind: "user_message",
    id,
    ts: t,
    body,
    ...(system ? { system } : {}),
  });

  it("carries the system flag through to the rendered user message", () => {
    const items = collapseEvents([user("u1", "[TICK] go", true)]);
    expect(items[0]).toMatchObject({
      kind: "user_message",
      body: "[TICK] go",
      system: true,
    });
  });

  it("renders unknown events as system_unknown rows", () => {
    const items = collapseEvents([
      { kind: "unknown", id: "x1", ts: t, raw_type: "telemetry" },
    ]);
    expect(items).toEqual([
      { kind: "system_unknown", key: "x1", raw_type: "telemetry" },
    ]);
  });

  it("skips lifecycle events entirely", () => {
    const items = collapseEvents([
      { kind: "lifecycle", id: "l1", ts: t, phase: "start" },
      { kind: "lifecycle", id: "l2", ts: t, phase: "done" },
    ]);
    expect(items).toEqual([]);
  });

  it("completes an earlier call even when the result arrives after a message", () => {
    const items = collapseEvents([
      {
        kind: "tool_call",
        id: "c1",
        ts: t,
        tool_call_id: "t1",
        name: "shell",
        label: "ls",
      },
      { kind: "assistant_text", id: "a1", ts: t, body: "narrating" },
      {
        kind: "tool_result",
        id: "r1",
        ts: t,
        tool_call_id: "t1",
        name: "shell",
        summary: "3 files",
        ok: true,
      },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["tool_group", "assistant_text"]);
    const group = items[0] as Extract<
      ReturnType<typeof collapseEvents>[number],
      { kind: "tool_group" }
    >;
    expect(group.tools[0]).toMatchObject({
      toolCallId: "t1",
      done: true,
      ok: true,
      result: "3 files",
    });
  });
});
