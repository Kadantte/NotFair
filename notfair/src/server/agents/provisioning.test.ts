import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import type { AgentProvisionSpec } from "@/server/adapters/types";

// Point the workspace layout at a tmpdir — provisioning derives paths from
// NOTFAIR_DATA_DIR and must never resolve to the developer's ~/.notfair.
const h = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "notfair-provision-"));
  process.env.NOTFAIR_DATA_DIR = dataDir;
  return { dataDir, provisionAgent: vi.fn(async (_spec: AgentProvisionSpec) => {}) };
});

// Mock the harness boundary: the real adapter would write workspace files
// and touch the developer's harness config.
vi.mock("@/server/adapters/registry", () => ({
  requireAdapter: vi.fn((id: string) => {
    if (id !== "claude-code-local" && id !== "codex-local") {
      throw new Error(`Unknown harness adapter: ${id}`);
    }
    return { provisionAgent: h.provisionAgent };
  }),
}));

import { provisionAgent, workspaceDirFor } from "./provisioning";

describe("workspaceDirFor", () => {
  it("resolves under <data dir>/agents/<agent id>", () => {
    expect(workspaceDirFor("acme-goal-alex")).toBe(
      join(h.dataDir, "agents", "acme-goal-alex"),
    );
  });
});

describe("provisionAgent", () => {
  it("hands the adapter a fully-resolved provision spec", async () => {
    await provisionAgent({
      projectSlug: "acme",
      agentId: "acme-goal-alex",
      displayName: "Alex",
      templateKey: "goal",
      identityMd: "# IDENTITY",
      projectMd: "# PROJECT",
      harnessAdapter: "claude-code-local",
    });

    expect(h.provisionAgent).toHaveBeenCalledTimes(1);
    expect(h.provisionAgent).toHaveBeenCalledWith({
      projectSlug: "acme",
      agentId: "acme-goal-alex",
      displayName: "Alex",
      templateKey: "goal",
      workspaceDir: join(h.dataDir, "agents", "acme-goal-alex"),
      identityMd: "# IDENTITY",
      projectMd: "# PROJECT",
    });
  });

  it("propagates an unknown-adapter failure", async () => {
    await expect(
      provisionAgent({
        projectSlug: "acme",
        agentId: "acme-goal-alex",
        displayName: "Alex",
        templateKey: "goal",
        identityMd: "# IDENTITY",
        harnessAdapter: "not-a-harness" as never,
      }),
    ).rejects.toThrow(/Unknown harness adapter/);
  });
});
