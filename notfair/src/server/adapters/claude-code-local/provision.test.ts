import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import type { AgentProvisionSpec } from "../types";
import { provisionClaudeCodeAgent } from "./provision";

let workspaceDir: string;

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), "notfair-claude-prov-"));
});

function spec(overrides: Partial<AgentProvisionSpec> = {}): AgentProvisionSpec {
  return {
    projectSlug: "proj",
    agentId: "proj-goal-1",
    displayName: "Greg",
    templateKey: "goal",
    workspaceDir,
    identityMd: "# Greg identity\n",
    ...overrides,
  };
}

describe("provisionClaudeCodeAgent", () => {
  it("writes IDENTITY.md and a pointer CLAUDE.md (not a mirror)", async () => {
    await provisionClaudeCodeAgent(spec());
    expect(await readFile(join(workspaceDir, "IDENTITY.md"), "utf8")).toBe(
      "# Greg identity\n",
    );
    const claudeMd = await readFile(join(workspaceDir, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("IDENTITY.md");
    expect(claudeMd).not.toContain("# Greg identity");
  });

  it("writes PROJECT.md only when a project brief exists", async () => {
    await provisionClaudeCodeAgent(spec());
    expect(existsSync(join(workspaceDir, "PROJECT.md"))).toBe(false);

    await provisionClaudeCodeAgent(spec({ projectMd: "# Brief\n" }));
    expect(await readFile(join(workspaceDir, "PROJECT.md"), "utf8")).toBe("# Brief\n");
  });

  it("creates the workspace dir and removes a stale SKILL.md sidecar", async () => {
    await writeFile(join(workspaceDir, "SKILL.md"), "old skill", "utf8");
    const nested = join(workspaceDir, "sub", "agent");
    await provisionClaudeCodeAgent(spec());
    await provisionClaudeCodeAgent(spec({ workspaceDir: nested }));
    expect(existsSync(join(workspaceDir, "SKILL.md"))).toBe(false);
    expect(existsSync(join(nested, "IDENTITY.md"))).toBe(true);
  });
});
