import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Real fs against a tmpdir data dir, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// so a plain assignment would point the suite at the developer's ~/.notfair.
const h = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "notfair-clone-"));
  process.env.NOTFAIR_DATA_DIR = dataDir;
  return { dataDir };
});

import { agentExistsInProject, cloneAgent } from "./clone";
import { readAgentMeta } from "@/server/agent-meta";

const agentsRoot = () => join(h.dataDir, "agents");

async function seedAgent(agentId: string, files: Record<string, string> = {}) {
  const dir = join(agentsRoot(), agentId);
  await mkdir(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body, "utf8");
  }
}

describe("cloneAgent", () => {
  it("copies the workspace and writes a fresh meta sidecar", async () => {
    await seedAgent("acme-goal-src", {
      "IDENTITY.md": "# identity",
      "notes.txt": "scratch",
    });

    const result = await cloneAgent({
      source_agent_id: "acme-goal-src",
      project_slug: "acme",
      new_slug: "Goal Copy!",
      display_name: "Copy",
    });

    expect(result).toEqual({
      new_agent_id: "acme-goal-copy",
      new_slug: "goal-copy",
      files_copied: 1,
      sessions_copied: 0,
    });
    // Workspace files came along.
    expect(
      readFileSync(join(agentsRoot(), "acme-goal-copy", "IDENTITY.md"), "utf8"),
    ).toBe("# identity");
    // Sidecar reflects the clone, including provenance.
    expect(readAgentMeta("acme-goal-copy")).toMatchObject({
      agent_id: "acme-goal-copy",
      project_slug: "acme",
      slug: "goal-copy",
      name: "Copy",
      source_agent_id: "acme-goal-src",
    });
  });

  it("defaults the display name to the source agent id", async () => {
    await seedAgent("acme-goal-src2", { "a.txt": "a" });
    await cloneAgent({
      source_agent_id: "acme-goal-src2",
      project_slug: "acme",
      new_slug: "unnamed-clone",
    });
    expect(readAgentMeta("acme-unnamed-clone")?.name).toBe("acme-goal-src2");
  });

  it("still writes the sidecar when the source workspace is missing", async () => {
    const result = await cloneAgent({
      source_agent_id: "acme-goal-ghost",
      project_slug: "acme",
      new_slug: "from-ghost",
    });
    expect(result.files_copied).toBe(0);
    // The sidecar itself creates the destination dir.
    expect(readAgentMeta("acme-from-ghost")?.slug).toBe("from-ghost");
  });

  it("rejects an invalid user-entered slug", async () => {
    await expect(
      cloneAgent({
        source_agent_id: "acme-goal-src",
        project_slug: "acme",
        new_slug: "!!!",
      }),
    ).rejects.toThrow(/Invalid agent slug/);
  });

  it("accepts a canonical slug verbatim and rejects malformed ones", async () => {
    await expect(
      cloneAgent({
        source_agent_id: "acme-goal-src",
        project_slug: "acme",
        new_slug: "Bad_Canonical",
        slug_is_canonical: true,
      }),
    ).rejects.toThrow(/Invalid canonical slug/);

    const result = await cloneAgent({
      source_agent_id: "acme-goal-src",
      project_slug: "acme",
      new_slug: "canon-ok",
      slug_is_canonical: true,
    });
    expect(result.new_agent_id).toBe("acme-canon-ok");
  });

  it("refuses to clobber an existing agent with the same slug", async () => {
    await seedAgent("acme-goal-taken", { "x.txt": "x" });
    await expect(
      cloneAgent({
        source_agent_id: "acme-goal-src",
        project_slug: "acme",
        new_slug: "goal-taken",
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("agentExistsInProject", () => {
  it("is false when the workspace dir doesn't exist", () => {
    expect(agentExistsInProject("acme", "goal-nowhere")).toBe(false);
  });

  it("is false for an existing but empty dir (half-provisioned leftovers)", async () => {
    await mkdir(join(agentsRoot(), "acme-goal-empty"), { recursive: true });
    expect(agentExistsInProject("acme", "goal-empty")).toBe(false);
  });

  it("is true for a dir with contents", async () => {
    await seedAgent("acme-goal-full", { "a.txt": "a" });
    expect(agentExistsInProject("acme", "goal-full")).toBe(true);
  });
});
