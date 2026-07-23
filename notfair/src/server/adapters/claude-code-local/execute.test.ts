import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HarnessEvent, HarnessExecuteContext } from "../types";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

import { executeClaudeCodeLocal } from "./execute";

class FakeChild extends EventEmitter {
  stdin = { write: vi.fn(), end: vi.fn() };
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

interface Script {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  spawnError?: Error;
}

/** Mock spawn to return a scripted child; returns the child for inspection. */
function scriptSpawn(script: Script): FakeChild {
  const child = new FakeChild();
  mocks.spawn.mockImplementationOnce(() => {
    setImmediate(async () => {
      if (script.spawnError) {
        child.emit("error", script.spawnError);
        return;
      }
      if (script.stdout) child.stdout.write(script.stdout);
      if (script.stderr) child.stderr.write(script.stderr);
      // Let PassThrough flush data events before the close lands.
      await new Promise((r) => setTimeout(r, 15));
      child.emit("close", script.exitCode ?? 0);
    });
    return child;
  });
  return child;
}

async function collect(ctx: HarnessExecuteContext): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  for await (const evt of executeClaudeCodeLocal(ctx)) events.push(evt);
  return events;
}

let workspaceDir: string;

function ctx(overrides: Partial<HarnessExecuteContext> = {}): HarnessExecuteContext {
  return {
    projectSlug: "proj",
    agentId: "agent-1",
    workspaceDir,
    message: "hi there",
    threadId: "thread-1",
    ...overrides,
  };
}

beforeEach(async () => {
  mocks.spawn.mockReset();
  workspaceDir = await mkdtemp(join(tmpdir(), "notfair-claude-exec-"));
});

describe("executeClaudeCodeLocal — argv wiring", () => {
  it("spawns claude in stream-json mode and pipes the message on stdin", async () => {
    const child = scriptSpawn({ stdout: `${JSON.stringify({ type: "result", result: "ok" })}\n` });
    const events = await collect(ctx());

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = mocks.spawn.mock.calls[0]!;
    expect(bin).toBe("claude");
    expect(args).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--input-format",
      "text",
      "--verbose",
    ]);
    expect(opts).toMatchObject({
      cwd: workspaceDir,
      env: expect.objectContaining({
        NOTFAIR_PROJECT_SLUG: "proj",
        NOTFAIR_AGENT_ID: "agent-1",
      }),
    });
    expect(child.stdin.write).toHaveBeenCalledWith("hi there");
    expect(child.stdin.end).toHaveBeenCalled();
    expect(events).toEqual([
      { kind: "delta", text: "ok" },
      { kind: "final", text: "ok" },
    ]);
  });

  it("appends IDENTITY.md as the system prompt when present", async () => {
    await writeFile(join(workspaceDir, "IDENTITY.md"), "# You are Greg\n", "utf8");
    scriptSpawn({ stdout: `${JSON.stringify({ type: "result", result: "ok" })}\n` });
    await collect(ctx());

    const args = mocks.spawn.mock.calls[0]![1] as string[];
    const idx = args.indexOf("--append-system-prompt");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("# You are Greg\n");
  });

  it("passes the model override and resumes real claude session ids", async () => {
    scriptSpawn({ stdout: `${JSON.stringify({ type: "result", result: "ok" })}\n` });
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    await collect(ctx({ model: "opus", harnessSessionId: uuid }));

    const args = mocks.spawn.mock.calls[0]![1] as string[];
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("opus");
    expect(args[args.indexOf("--resume") + 1]).toBe(uuid);
  });

  it("never passes a non-UUID session id to --resume", async () => {
    scriptSpawn({ stdout: `${JSON.stringify({ type: "result", result: "ok" })}\n` });
    await collect(ctx({ harnessSessionId: "not-a-claude-session" }));

    expect(mocks.spawn.mock.calls[0]![1]).not.toContain("--resume");
  });
});

describe("executeClaudeCodeLocal — stream handling", () => {
  it("forwards parsed events across chunk boundaries and flushes the tail line", async () => {
    const l1 = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "123e4567-e89b-42d3-a456-426614174000",
    });
    const l2 = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "hello" }] },
    });
    // Final line has no trailing newline — must be flushed on close.
    const l3 = JSON.stringify({ type: "result", result: "hello" });
    scriptSpawn({ stdout: `${l1}\n${l2}\n${l3}` });

    const events = await collect(ctx());
    expect(events).toEqual([
      { kind: "lifecycle", phase: "init" },
      { kind: "session", harnessSessionId: "123e4567-e89b-42d3-a456-426614174000" },
      { kind: "delta", text: "hello" },
      { kind: "final", text: "hello" },
    ]);
  });

  it("emits an error with the stderr tail on a non-zero exit without a final", async () => {
    scriptSpawn({ exitCode: 1, stderr: "line1\nauth expired\n" });
    const events = await collect(ctx());
    expect(events).toEqual([
      { kind: "error", message: "claude exited with code 1: line1\nauth expired" },
    ]);
  });

  it("suppresses the exit-code error when the turn already finalized", async () => {
    scriptSpawn({
      stdout: `${JSON.stringify({ type: "result", result: "done" })}\n`,
      exitCode: 1,
    });
    const events = await collect(ctx());
    expect(events).toEqual([
      { kind: "delta", text: "done" },
      { kind: "final", text: "done" },
    ]);
  });

  it("yields a terminal error when the binary fails to spawn", async () => {
    scriptSpawn({ spawnError: new Error("spawn claude ENOENT") });
    const events = await collect(ctx());
    expect(events).toEqual([{ kind: "error", message: "spawn claude ENOENT" }]);
  });

  it("kills the subprocess when the abort signal fires", async () => {
    const controller = new AbortController();
    const child = new FakeChild();
    child.kill = vi.fn(() => {
      child.emit("close", 143);
      return true;
    });
    mocks.spawn.mockImplementationOnce(() => {
      setImmediate(() => controller.abort());
      return child;
    });

    const events = await collect(ctx({ signal: controller.signal }));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(events).toEqual([
      { kind: "error", message: "claude exited with code 143" },
    ]);
  });
});
