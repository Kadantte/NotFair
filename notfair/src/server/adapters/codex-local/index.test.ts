import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeCodexLocal: vi.fn(),
  listCodexModels: vi.fn(async () => []),
  provisionCodexAgent: vi.fn(async () => {}),
  testCodexLocalEnvironment: vi.fn(async () => ({ ok: true })),
  registerCodexMcp: vi.fn(async () => {}),
  unregisterCodexMcp: vi.fn(async () => {}),
}));

vi.mock("./execute", () => ({ executeCodexLocal: mocks.executeCodexLocal }));
vi.mock("./models", () => ({ listCodexModels: mocks.listCodexModels }));
vi.mock("./provision", () => ({ provisionCodexAgent: mocks.provisionCodexAgent }));
vi.mock("./test", () => ({ testCodexLocalEnvironment: mocks.testCodexLocalEnvironment }));
vi.mock("./mcp", () => ({
  registerCodexMcp: mocks.registerCodexMcp,
  unregisterCodexMcp: mocks.unregisterCodexMcp,
}));

import { codexLocalAdapter } from "./index";

describe("codexLocalAdapter", () => {
  it("exposes the codex-local id and delegates to the submodules", async () => {
    expect(codexLocalAdapter.id).toBe("codex-local");
    expect(codexLocalAdapter.testEnvironment).toBe(mocks.testCodexLocalEnvironment);
    expect(codexLocalAdapter.listModels).toBe(mocks.listCodexModels);

    const ctx = { agentId: "a" } as never;
    const gen = (async function* () {})();
    mocks.executeCodexLocal.mockReturnValueOnce(gen);
    expect(codexLocalAdapter.execute(ctx)).toBe(gen);
    expect(mocks.executeCodexLocal).toHaveBeenCalledWith(ctx);

    const provisionSpec = { agentId: "a" } as never;
    await codexLocalAdapter.provisionAgent(provisionSpec);
    expect(mocks.provisionCodexAgent).toHaveBeenCalledWith(provisionSpec);
  });

  it("passes the full spec to registerMcp and (serverName, projectSlug) to unregisterMcp", async () => {
    const spec = {
      serverName: "notfair-goals",
      agentId: "agent-9",
      projectSlug: "proj",
      transport: { type: "http" as const, url: "http://x" },
    };
    await codexLocalAdapter.registerMcp(spec);
    expect(mocks.registerCodexMcp).toHaveBeenCalledWith(spec);

    await codexLocalAdapter.unregisterMcp({
      serverName: "notfair-goals",
      projectSlug: "proj",
      agentId: "agent-9",
    });
    expect(mocks.unregisterCodexMcp).toHaveBeenCalledWith("notfair-goals", "proj");
  });
});
