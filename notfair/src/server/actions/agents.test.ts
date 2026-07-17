import { beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
const h = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "notfair-relocate-"));
  process.env.NOTFAIR_DATA_DIR = dataDir;
  return { dataDir, unregisterMcp: vi.fn(async () => {}) };
});

// Mock the harness boundary: the real adapter would edit the developer's
// actual ~/.codex / ~/.claude config when unregistering MCP servers.
vi.mock("@/server/adapters/registry", () => ({
  requireAdapter: () => ({ unregisterMcp: h.unregisterMcp }),
}));
vi.mock("@/server/mcp-catalog", () => ({ getMcpCatalog: () => [] }));
vi.mock("@/server/mcp-server/registration", () => ({
  GOALS_MCP_KEY: "notfair-goals",
  BROWSER_MCP_KEY: "notfair-browser",
}));

import { getDb } from "@/server/db/db";
import { writeAgentMeta, readAgentMeta } from "@/server/agent-meta";
import { relocateAgent } from "./agents";

const OLD_AGENT = "src-proj-goal-1";
const NEW_AGENT = "dst-proj-goal-1";

beforeAll(async () => {
  getDb()
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES ('p1', 'src-proj', 'Src', ?, 'codex-local')",
    )
    .run(new Date().toISOString());
  // Old agent: workspace dir + meta sidecar + one chat session.
  mkdirSync(join(h.dataDir, "agents", OLD_AGENT), { recursive: true });
  await writeAgentMeta({
    agent_id: OLD_AGENT,
    project_slug: "src-proj",
    slug: "goal-1",
    name: "Goal 1",
    created_at: new Date().toISOString(),
  });
  getDb()
    .prepare(
      `INSERT INTO sessions (id, project_slug, agent_id, label, harness_adapter, created_at, updated_at)
       VALUES ('s1', 'src-proj', ?, 'main', 'codex-local', ?, ?)`,
    )
    .run(OLD_AGENT, new Date().toISOString(), new Date().toISOString());
});

describe("relocateAgent", () => {
  it("moves the agent and fully cleans up the old one", async () => {
    const result = await relocateAgent({
      old_agent_id: OLD_AGENT,
      source_project_slug: "src-proj",
      new_project_slug: "dst-proj",
      new_slug: "goal-1",
      new_display_name: "Goal 1",
    });

    expect(result.new_agent_id).toBe(NEW_AGENT);
    // New workspace exists with a sidecar pointing at the new project.
    expect(existsSync(join(h.dataDir, "agents", NEW_AGENT))).toBe(true);
    expect(readAgentMeta(NEW_AGENT)?.project_slug).toBe("dst-proj");

    // Old artifacts are gone: workspace dir, session rows (this delete used
    // to throw on a nonexistent scheduled_jobs table and get swallowed,
    // stranding sessions forever), and harness MCP registrations.
    expect(existsSync(join(h.dataDir, "agents", OLD_AGENT))).toBe(false);
    const sessions = getDb()
      .prepare("SELECT COUNT(*) AS n FROM sessions WHERE agent_id = ?")
      .get(OLD_AGENT) as { n: number };
    expect(sessions.n).toBe(0);
    const unregistered = h.unregisterMcp.mock.calls.map(
      (c) => (c as unknown as [{ serverName: string; agentId: string }])[0],
    );
    expect(unregistered.every((u) => u.agentId === OLD_AGENT)).toBe(true);
    expect(unregistered.map((u) => u.serverName).sort()).toEqual([
      "notfair-browser",
      "notfair-goals",
    ]);
  });
});
