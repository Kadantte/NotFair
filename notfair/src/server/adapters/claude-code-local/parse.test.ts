import { describe, expect, it } from "vitest";

import { makeClaudeStreamState, parseClaudeLine } from "./parse";

const line = (obj: unknown) => JSON.stringify(obj);

describe("parseClaudeLine — noise handling", () => {
  it("ignores blank lines and invalid JSON", () => {
    const state = makeClaudeStreamState();
    expect(parseClaudeLine("", state)).toEqual([]);
    expect(parseClaudeLine("   ", state)).toEqual([]);
    expect(parseClaudeLine("not json {", state)).toEqual([]);
  });

  it("ignores unknown message types", () => {
    expect(
      parseClaudeLine(line({ type: "mystery" }), makeClaudeStreamState()),
    ).toEqual([]);
  });
});

describe("parseClaudeLine — system events", () => {
  it("emits lifecycle + session from the init system message", () => {
    const state = makeClaudeStreamState();
    const events = parseClaudeLine(
      line({ type: "system", subtype: "init", session_id: "sess-1" }),
      state,
    );
    expect(events).toEqual([
      { kind: "lifecycle", phase: "init" },
      { kind: "session", harnessSessionId: "sess-1" },
    ]);
  });

  it("emits the session event at most once per turn", () => {
    const state = makeClaudeStreamState();
    parseClaudeLine(line({ type: "system", subtype: "init", session_id: "sess-1" }), state);
    const events = parseClaudeLine(
      line({ type: "system", subtype: "other", session_id: "sess-1" }),
      state,
    );
    expect(events).toEqual([{ kind: "lifecycle", phase: "other" }]);
  });

  it("skips lifecycle when subtype is missing", () => {
    const events = parseClaudeLine(
      line({ type: "system", session_id: "sess-2" }),
      makeClaudeStreamState(),
    );
    expect(events).toEqual([{ kind: "session", harnessSessionId: "sess-2" }]);
  });
});

describe("parseClaudeLine — assistant text", () => {
  it("forwards text blocks as deltas", () => {
    const state = makeClaudeStreamState();
    const events = parseClaudeLine(
      line({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }] },
      }),
      state,
    );
    expect(events).toEqual([
      { kind: "delta", text: "Hello " },
      { kind: "delta", text: "world" },
    ]);
    expect(state.assistantText).toBe("Hello world");
  });

  it("keeps deltas monotonic across messages", () => {
    const state = makeClaudeStreamState();
    parseClaudeLine(
      line({ type: "assistant", message: { content: [{ type: "text", text: "part one" }] } }),
      state,
    );
    const events = parseClaudeLine(
      line({ type: "assistant", message: { content: [{ type: "text", text: " part two" }] } }),
      state,
    );
    expect(events).toEqual([{ kind: "delta", text: " part two" }]);
  });
});

describe("parseClaudeLine — tool events", () => {
  it("emits a tool start with a first-line label for Bash commands", () => {
    const events = parseClaudeLine(
      line({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "Bash",
              input: { command: "ls -la\ncat foo" },
            },
          ],
        },
      }),
      makeClaudeStreamState(),
    );
    expect(events).toEqual([
      { kind: "tool", phase: "start", toolCallId: "tu_1", name: "Bash", label: "ls -la" },
    ]);
  });

  it("clips a very long Bash first line to 160 chars", () => {
    const events = parseClaudeLine(
      line({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "tu_2", name: "Bash", input: { command: "x".repeat(200) } },
          ],
        },
      }),
      makeClaudeStreamState(),
    );
    const label = (events[0] as { label: string }).label;
    expect(label).toHaveLength(160);
    expect(label.endsWith("…")).toBe(true);
  });

  it("shortens deep file paths to the last two segments", () => {
    const events = parseClaudeLine(
      line({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_3",
              name: "Read",
              input: { file_path: "/Users/x/proj/src/foo.ts" },
            },
          ],
        },
      }),
      makeClaudeStreamState(),
    );
    expect(events[0]).toMatchObject({ label: "…/src/foo.ts" });
  });

  it("keeps short paths whole", () => {
    const events = parseClaudeLine(
      line({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "tu_4", name: "Read", input: { path: "foo.ts" } }],
        },
      }),
      makeClaudeStreamState(),
    );
    expect(events[0]).toMatchObject({ label: "foo.ts" });
  });

  it("uses the URL as the label for web tools", () => {
    const events = parseClaudeLine(
      line({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "tu_5", name: "WebFetch", input: { url: "https://x.test/a" } },
          ],
        },
      }),
      makeClaudeStreamState(),
    );
    expect(events[0]).toMatchObject({ label: "https://x.test/a" });
  });

  it("falls back to labelFromArgs for MCP-ish tools", () => {
    const events = parseClaudeLine(
      line({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_6",
              name: "mcp__x__updateBudget",
              input: { campaign_id: 9, amount: 5 },
            },
          ],
        },
      }),
      makeClaudeStreamState(),
    );
    expect(events[0]).toMatchObject({ label: "campaign_id=9  amount=5" });
  });

  it("defaults toolCallId and name when absent, label undefined without input", () => {
    const events = parseClaudeLine(
      line({ type: "assistant", message: { content: [{ type: "tool_use" }] } }),
      makeClaudeStreamState(),
    );
    expect(events[0]).toMatchObject({ kind: "tool", toolCallId: "", name: "tool" });
    expect((events[0] as { label?: string }).label).toBeUndefined();
  });

  it("surfaces tool_result blocks in user messages as result events", () => {
    const events = parseClaudeLine(
      line({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "tu_1" }, { type: "text" }] },
      }),
      makeClaudeStreamState(),
    );
    expect(events).toEqual([
      { kind: "tool", phase: "result", toolCallId: "tu_1", name: "" },
    ]);
  });
});

describe("parseClaudeLine — result", () => {
  it("emits final with the result text and marks the state finalized", () => {
    const state = makeClaudeStreamState();
    parseClaudeLine(
      line({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } }),
      state,
    );
    const events = parseClaudeLine(line({ type: "result", result: "done" }), state);
    expect(events).toEqual([{ kind: "final", text: "done" }]);
    expect(state.finalized).toBe(true);
  });

  it("emits a trailing delta when the result text extends past emitted deltas", () => {
    const state = makeClaudeStreamState();
    const events = parseClaudeLine(
      line({ type: "result", result: "full answer" }),
      state,
    );
    expect(events).toEqual([
      { kind: "delta", text: "full answer" },
      { kind: "final", text: "full answer" },
    ]);
  });

  it("falls back to accumulated assistant text when result is not a string", () => {
    const state = makeClaudeStreamState();
    parseClaudeLine(
      line({ type: "assistant", message: { content: [{ type: "text", text: "acc" }] } }),
      state,
    );
    const events = parseClaudeLine(line({ type: "result" }), state);
    expect(events).toEqual([{ kind: "final", text: "acc" }]);
  });

  it("maps error subtypes to error events", () => {
    const state = makeClaudeStreamState();
    const events = parseClaudeLine(
      line({ type: "result", subtype: "error_max_turns" }),
      state,
    );
    expect(events).toEqual([{ kind: "error", message: "error_max_turns" }]);
    expect(state.finalized).toBe(true);

    const withMessage = parseClaudeLine(
      line({
        type: "result",
        subtype: "error_during_execution",
        error: { message: "boom" },
      }),
      makeClaudeStreamState(),
    );
    expect(withMessage).toEqual([{ kind: "error", message: "boom" }]);
  });
});
