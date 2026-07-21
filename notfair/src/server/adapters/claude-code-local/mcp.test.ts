import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import type { McpRegistrationSpec } from "../types";
import { registerClaudeCodeMcp, unregisterClaudeCodeMcp } from "./mcp";

let workspaceDir: string;

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), "notfair-claude-mcp-"));
});

function spec(overrides: Partial<McpRegistrationSpec> = {}): McpRegistrationSpec {
  return {
    serverName: "notfair-goals",
    agentId: "agent-1",
    projectSlug: "proj",
    transport: { type: "http", url: "http://127.0.0.1:3326/api/mcp/goals" },
    ...overrides,
  };
}

async function readMcpJson(): Promise<{ mcpServers: Record<string, unknown> }> {
  return JSON.parse(await readFile(join(workspaceDir, ".mcp.json"), "utf8"));
}

describe("registerClaudeCodeMcp", () => {
  it("writes an http server entry into .mcp.json", async () => {
    await registerClaudeCodeMcp(
      workspaceDir,
      spec({
        transport: {
          type: "http",
          url: "http://127.0.0.1:3326/api/mcp/goals",
          headers: { Authorization: "Bearer s3cret" },
        },
      }),
    );
    expect(await readMcpJson()).toEqual({
      mcpServers: {
        "notfair-goals": {
          type: "http",
          url: "http://127.0.0.1:3326/api/mcp/goals",
          headers: { Authorization: "Bearer s3cret" },
        },
      },
    });
  });

  it("writes a stdio server entry with command, args and env", async () => {
    await registerClaudeCodeMcp(
      workspaceDir,
      spec({
        serverName: "local-tool",
        transport: {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { TOKEN: "t" },
        },
      }),
    );
    expect((await readMcpJson()).mcpServers["local-tool"]).toEqual({
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "t" },
    });
  });

  it("creates the workspace dir when it does not exist yet", async () => {
    const fresh = join(workspaceDir, "nested", "agent");
    await registerClaudeCodeMcp(fresh, spec());
    const parsed = JSON.parse(await readFile(join(fresh, ".mcp.json"), "utf8"));
    expect(Object.keys(parsed.mcpServers)).toEqual(["notfair-goals"]);
  });

  it("merges with existing servers instead of clobbering them", async () => {
    await registerClaudeCodeMcp(workspaceDir, spec({ serverName: "a" }));
    await registerClaudeCodeMcp(workspaceDir, spec({ serverName: "b" }));
    expect(Object.keys((await readMcpJson()).mcpServers).sort()).toEqual(["a", "b"]);
  });

  it("recovers from a corrupt .mcp.json by starting fresh", async () => {
    await writeFile(join(workspaceDir, ".mcp.json"), "{ not json", "utf8");
    await registerClaudeCodeMcp(workspaceDir, spec());
    expect(Object.keys((await readMcpJson()).mcpServers)).toEqual(["notfair-goals"]);
  });
});

describe("unregisterClaudeCodeMcp", () => {
  it("removes only the named server", async () => {
    await registerClaudeCodeMcp(workspaceDir, spec({ serverName: "a" }));
    await registerClaudeCodeMcp(workspaceDir, spec({ serverName: "b" }));
    await unregisterClaudeCodeMcp(workspaceDir, "a");
    expect(Object.keys((await readMcpJson()).mcpServers)).toEqual(["b"]);
  });

  it("is a no-op (but still writes a valid file) when the server is absent", async () => {
    await unregisterClaudeCodeMcp(workspaceDir, "ghost");
    expect(await readMcpJson()).toEqual({ mcpServers: {} });
  });
});
