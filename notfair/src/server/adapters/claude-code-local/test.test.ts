import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

import { testClaudeCodeLocalEnvironment } from "./test";

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

function scriptVersionCmd(script: {
  stdout?: string;
  exitCode?: number;
  spawnError?: boolean;
  hang?: boolean;
}): FakeChild {
  const child = new FakeChild();
  mocks.spawn.mockImplementationOnce(() => {
    if (!script.hang) {
      setImmediate(() => {
        if (script.spawnError) {
          child.emit("error", new Error("ENOENT"));
          return;
        }
        if (script.stdout) child.stdout.emit("data", Buffer.from(script.stdout));
        child.emit("close", script.exitCode ?? 0);
      });
    }
    return child;
  });
  return child;
}

beforeEach(() => mocks.spawn.mockReset());
afterEach(() => vi.useRealTimers());

describe("testClaudeCodeLocalEnvironment", () => {
  it("reports ok with a parsed version label when the CLI responds", async () => {
    scriptVersionCmd({ stdout: "1.0.42 (Claude Code)\n" });
    const health = await testClaudeCodeLocalEnvironment();
    expect(health).toEqual({
      ok: true,
      auth: "unknown",
      versionLabel: "Claude Code 1.0.42",
    });
    expect(mocks.spawn).toHaveBeenCalledWith("claude", ["--version"], expect.anything());
  });

  it("falls back to a bare label when the version string is unparsable", async () => {
    scriptVersionCmd({ stdout: "dev build\n" });
    const health = await testClaudeCodeLocalEnvironment();
    expect(health.versionLabel).toBe("Claude Code");
  });

  it("reports not-ok with an install hint when the binary is missing", async () => {
    scriptVersionCmd({ spawnError: true });
    const health = await testClaudeCodeLocalEnvironment();
    expect(health.ok).toBe(false);
    expect(health.auth).toBe("unknown");
    expect(health.message).toContain("`claude` not found on PATH");
  });

  it("reports not-ok on a non-zero exit code", async () => {
    scriptVersionCmd({ exitCode: 3 });
    const health = await testClaudeCodeLocalEnvironment();
    expect(health.ok).toBe(false);
  });

  it("times out a hung probe instead of waiting forever", async () => {
    vi.useFakeTimers();
    const child = scriptVersionCmd({ hang: true });
    const pending = testClaudeCodeLocalEnvironment();
    await vi.advanceTimersByTimeAsync(5_001);
    const health = await pending;
    expect(health.ok).toBe(false);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
