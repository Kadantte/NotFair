import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import type { AgentProvisionSpec } from "../types";
import { provisionCodexAgent } from "./provision";

let workspaceDir: string;

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), "notfair-codex-prov-"));
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

describe("provisionCodexAgent", () => {
  it("mirrors the identity into AGENTS.md so codex auto-loads it", async () => {
    await provisionCodexAgent(spec());
    expect(await readFile(join(workspaceDir, "IDENTITY.md"), "utf8")).toBe(
      "# Greg identity\n",
    );
    expect(await readFile(join(workspaceDir, "AGENTS.md"), "utf8")).toBe(
      "# Greg identity\n",
    );
  });

  it("writes PROJECT.md only when a project brief exists", async () => {
    await provisionCodexAgent(spec());
    expect(existsSync(join(workspaceDir, "PROJECT.md"))).toBe(false);

    await provisionCodexAgent(spec({ projectMd: "# Brief\n" }));
    expect(await readFile(join(workspaceDir, "PROJECT.md"), "utf8")).toBe("# Brief\n");
  });

  it("creates the workspace dir and removes a stale SKILL.md sidecar", async () => {
    await writeFile(join(workspaceDir, "SKILL.md"), "old skill", "utf8");
    const nested = join(workspaceDir, "sub", "agent");
    await provisionCodexAgent(spec());
    await provisionCodexAgent(spec({ workspaceDir: nested }));
    expect(existsSync(join(workspaceDir, "SKILL.md"))).toBe(false);
    expect(existsSync(join(nested, "AGENTS.md"))).toBe(true);
  });
});
