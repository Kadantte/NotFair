import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// dataDir() reads NOTFAIR_DATA_DIR at call time, but hoist anyway so no code
// path in the import graph can ever resolve to the developer's live ~/.notfair.
const tmpDataDir = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "notfair-claude-index-"));
  process.env.NOTFAIR_DATA_DIR = dir;
  return dir;
});

const mocks = vi.hoisted(() => ({
  executeClaudeCodeLocal: vi.fn(),
  listClaudeCodeModels: vi.fn(async () => []),
  provisionClaudeCodeAgent: vi.fn(async () => {}),
  testClaudeCodeLocalEnvironment: vi.fn(async () => ({ ok: true })),
  registerClaudeCodeMcp: vi.fn(async () => {}),
  unregisterClaudeCodeMcp: vi.fn(async () => {}),
}));

vi.mock("./execute", () => ({ executeClaudeCodeLocal: mocks.executeClaudeCodeLocal }));
vi.mock("./models", () => ({ listClaudeCodeModels: mocks.listClaudeCodeModels }));
vi.mock("./provision", () => ({ provisionClaudeCodeAgent: mocks.provisionClaudeCodeAgent }));
vi.mock("./test", () => ({ testClaudeCodeLocalEnvironment: mocks.testClaudeCodeLocalEnvironment }));
vi.mock("./mcp", () => ({
  registerClaudeCodeMcp: mocks.registerClaudeCodeMcp,
  unregisterClaudeCodeMcp: mocks.unregisterClaudeCodeMcp,
}));

import { claudeCodeLocalAdapter } from "./index";

describe("claudeCodeLocalAdapter", () => {
  it("exposes the claude-code-local id and delegates to the submodules", async () => {
    expect(claudeCodeLocalAdapter.id).toBe("claude-code-local");
    expect(claudeCodeLocalAdapter.testEnvironment).toBe(
      mocks.testClaudeCodeLocalEnvironment,
    );
    expect(claudeCodeLocalAdapter.listModels).toBe(mocks.listClaudeCodeModels);

    const ctx = { agentId: "a" } as never;
    const gen = (async function* () {})();
    mocks.executeClaudeCodeLocal.mockReturnValueOnce(gen);
    expect(claudeCodeLocalAdapter.execute(ctx)).toBe(gen);
    expect(mocks.executeClaudeCodeLocal).toHaveBeenCalledWith(ctx);

    const provisionSpec = { agentId: "a" } as never;
    await claudeCodeLocalAdapter.provisionAgent(provisionSpec);
    expect(mocks.provisionClaudeCodeAgent).toHaveBeenCalledWith(provisionSpec);
  });

  it("registers MCP into the agent's workspace under the data dir", async () => {
    const spec = {
      serverName: "notfair-goals",
      agentId: "agent-9",
      projectSlug: "proj",
      transport: { type: "http" as const, url: "http://x" },
    };
    await claudeCodeLocalAdapter.registerMcp(spec);
    expect(mocks.registerClaudeCodeMcp).toHaveBeenCalledWith(
      join(tmpDataDir, "agents", "agent-9"),
      spec,
    );

    await claudeCodeLocalAdapter.unregisterMcp({
      serverName: "notfair-goals",
      projectSlug: "proj",
      agentId: "agent-9",
    });
    expect(mocks.unregisterClaudeCodeMcp).toHaveBeenCalledWith(
      join(tmpDataDir, "agents", "agent-9"),
      "notfair-goals",
    );
  });
});
