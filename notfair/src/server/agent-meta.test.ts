import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Real fs against a tmpdir data dir, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// so a plain assignment would point the suite at the developer's ~/.notfair.
const h = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "notfair-meta-"));
  process.env.NOTFAIR_DATA_DIR = dataDir;
  return { dataDir };
});

import {
  agentExistsOnDisk,
  listProjectAgents,
  readAgentMeta,
  resolveAgentBySlug,
  workspaceDirFor,
  writeAgentMeta,
} from "./agent-meta";

describe("agent meta sidecar", () => {
  it("round-trips write → read", async () => {
    await writeAgentMeta({
      agent_id: "acme-goal-alex",
      project_slug: "acme",
      name: "Alex",
      slug: "goal-alex",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const meta = readAgentMeta("acme-goal-alex");
    expect(meta).toMatchObject({
      agent_id: "acme-goal-alex",
      project_slug: "acme",
      name: "Alex",
      slug: "goal-alex",
    });
    // Human-inspectable: pretty-printed JSON on disk.
    const raw = readFileSync(
      join(h.dataDir, "agents", "acme-goal-alex", "notfair-meta.json"),
      "utf8",
    );
    expect(raw).toContain("\n  \"agent_id\"");
  });

  it("returns null for a missing sidecar", () => {
    expect(readAgentMeta("no-such-agent")).toBeNull();
  });

  it("returns null for a corrupt sidecar instead of throwing", async () => {
    const dir = join(h.dataDir, "agents", "acme-goal-corrupt");
    await mkdir(dir, { recursive: true });
    writeFileSync(join(dir, "notfair-meta.json"), "{not json", "utf8");
    expect(readAgentMeta("acme-goal-corrupt")).toBeNull();
  });
});

describe("agentExistsOnDisk", () => {
  it("is true for a provisioned workspace dir", async () => {
    await mkdir(join(h.dataDir, "agents", "acme-goal-here"), { recursive: true });
    await expect(agentExistsOnDisk("acme-goal-here")).resolves.toBe(true);
  });

  it("is false for a missing workspace", async () => {
    await expect(agentExistsOnDisk("acme-goal-missing")).resolves.toBe(false);
  });

  it("is false when the path is a file, not a directory", async () => {
    await mkdir(join(h.dataDir, "agents"), { recursive: true });
    await writeFile(join(h.dataDir, "agents", "acme-goal-file"), "x", "utf8");
    await expect(agentExistsOnDisk("acme-goal-file")).resolves.toBe(false);
  });
});

describe("workspaceDirFor", () => {
  it("points inside the data dir", () => {
    expect(workspaceDirFor("acme-goal-alex")).toBe(
      join(h.dataDir, "agents", "acme-goal-alex"),
    );
  });
});

describe("listProjectAgents", () => {
  beforeAll(async () => {
    // Roster for "roster" plus a lookalike project "roster-q4" whose slug
    // has "roster" as a string prefix — must not cross-leak.
    await writeAgentMeta({
      agent_id: "roster-goal-beth",
      project_slug: "roster",
      name: "Beth",
      slug: "goal-beth",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await writeAgentMeta({
      agent_id: "roster-goal-abe",
      project_slug: "roster",
      name: "Abe",
      slug: "goal-abe",
      source_agent_id: "roster-goal-beth",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await writeAgentMeta({
      agent_id: "roster-q4-goal-carl",
      project_slug: "roster-q4",
      name: "Carl",
      slug: "goal-carl",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    // Sidecar written before `slug` existed: falls back to slugified name.
    const legacy = {
      agent_id: "roster-goal-dee-jones",
      project_slug: "roster",
      name: "Dee Jones!",
      created_at: "2026-01-04T00:00:00.000Z",
    };
    const dir = join(h.dataDir, "agents", legacy.agent_id);
    await mkdir(dir, { recursive: true });
    writeFileSync(join(dir, "notfair-meta.json"), JSON.stringify(legacy), "utf8");
    // Dir with the right prefix but no sidecar — skipped.
    await mkdir(join(h.dataDir, "agents", "roster-goal-nometa"), {
      recursive: true,
    });
  });

  it("returns only this project's sidecars, oldest first", async () => {
    const agents = await listProjectAgents("roster");
    expect(agents.map((a) => a.agent_id)).toEqual([
      "roster-goal-abe",
      "roster-goal-beth",
      "roster-goal-dee-jones",
    ]);
    expect(agents[0]!.source_agent_id).toBe("roster-goal-beth");
  });

  it("never leaks a prefix-colliding project's roster", async () => {
    const agents = await listProjectAgents("roster-q4");
    expect(agents.map((a) => a.agent_id)).toEqual(["roster-q4-goal-carl"]);
  });

  it("derives a slug for legacy sidecars without one", async () => {
    const agents = await listProjectAgents("roster");
    const dee = agents.find((a) => a.agent_id === "roster-goal-dee-jones")!;
    expect(dee.slug).toBe("goal-dee-jones");
  });

  it("returns [] when the agents root doesn't exist yet", async () => {
    const saved = process.env.NOTFAIR_DATA_DIR;
    process.env.NOTFAIR_DATA_DIR = join(h.dataDir, "does-not-exist");
    try {
      await expect(listProjectAgents("roster")).resolves.toEqual([]);
    } finally {
      process.env.NOTFAIR_DATA_DIR = saved;
    }
  });
});

describe("resolveAgentBySlug", () => {
  it("resolves a URL slug to the full agent id", async () => {
    await expect(resolveAgentBySlug("roster", "goal-beth")).resolves.toEqual({
      agent_id: "roster-goal-beth",
      name: "Beth",
      slug: "goal-beth",
    });
  });

  it("returns null for an unknown slug", async () => {
    await expect(resolveAgentBySlug("roster", "goal-nobody")).resolves.toBeNull();
  });
});
