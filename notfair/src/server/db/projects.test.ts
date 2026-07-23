import { describe, expect, it } from "vitest";
import { vi } from "vitest";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-db-projects-"));
});

import { getDb } from "./db";
import {
  addHiddenMcpPresetKey,
  archiveProject,
  changeProjectSlug,
  createProject,
  deleteProjectRow,
  getHiddenMcpPresetKeys,
  getProject,
  listProjects,
  removeHiddenMcpPresetKey,
  renameProject,
  setProjectCodebasePath,
  setProjectGoogleAdsAccount,
  setProjectGscProperty,
  setProjectHarnessAdapter,
  setProjectMetaAdsAccount,
  unarchiveProject,
} from "./projects";
import { createGoal } from "./goals";
import { insertUserMcpServer, listUserMcpServers } from "./user-mcp-servers";

describe("createProject", () => {
  it("creates a project with defaults and a slug from the display name", () => {
    const result = createProject({ display_name: "  Acme Corp  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slug).toBe("acme-corp");
    expect(result.project.display_name).toBe("Acme Corp");
    expect(result.project.harness_adapter).toBe("claude-code-local");
    expect(result.project.website_url).toBeNull();
    expect(result.project.codebase_path).toBeNull();
    // Round-trips through the DB.
    expect(getProject("acme-corp")).toMatchObject({
      slug: "acme-corp",
      display_name: "Acme Corp",
      archived_at: null,
    });
  });

  it("rejects an unusable display name", () => {
    const result = createProject({ display_name: "###" });
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate slug", () => {
    createProject({ display_name: "Dup Target" });
    const result = createProject({ display_name: "Dup Target" });
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.reason).toContain("already exists");
  });

  it("honors an explicit slug, harness adapter, and trims optional hints", () => {
    const result = createProject({
      display_name: "Hints",
      slug: "hints-custom",
      website_url: "  https://hints.dev  ",
      codebase_path: "   ",
      harness_adapter: "codex-local",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slug).toBe("hints-custom");
    expect(result.project.website_url).toBe("https://hints.dev");
    expect(result.project.codebase_path).toBeNull();
    expect(result.project.harness_adapter).toBe("codex-local");
  });
});

describe("listProjects", () => {
  it("filters archived projects unless asked for them", () => {
    createProject({ display_name: "List Live" });
    createProject({ display_name: "List Archived" });
    archiveProject("list-archived");

    const live = listProjects().map((p) => p.slug);
    expect(live).toContain("list-live");
    expect(live).not.toContain("list-archived");

    const all = listProjects({ includeArchived: true }).map((p) => p.slug);
    expect(all).toContain("list-archived");
  });
});

describe("getProject", () => {
  it("returns null for a missing slug", () => {
    expect(getProject("nope-never")).toBeNull();
  });
});

describe("project field setters", () => {
  it("returns null when the project doesn't exist", () => {
    expect(setProjectGoogleAdsAccount("ghost", "123")).toBeNull();
    expect(setProjectMetaAdsAccount("ghost", "act_1")).toBeNull();
    expect(setProjectCodebasePath("ghost", "/tmp")).toBeNull();
    expect(setProjectGscProperty("ghost", "sc-domain:x")).toBeNull();
  });

  it("sets and clears the per-platform account fields", () => {
    createProject({ display_name: "Setters" });
    expect(setProjectGoogleAdsAccount("setters", "111")?.google_ads_account_id).toBe("111");
    expect(setProjectMetaAdsAccount("setters", "act_2")?.meta_ads_account_id).toBe("act_2");
    expect(setProjectCodebasePath("setters", "/repo")?.codebase_path).toBe("/repo");
    expect(setProjectGscProperty("setters", "sc-domain:s")?.gsc_property_id).toBe("sc-domain:s");
    expect(setProjectGoogleAdsAccount("setters", null)?.google_ads_account_id).toBeNull();
  });

  it("swaps the harness adapter", () => {
    createProject({ display_name: "Adapter Swap" });
    expect(setProjectHarnessAdapter("adapter-swap", "codex-local")?.harness_adapter).toBe(
      "codex-local",
    );
  });
});

describe("renameProject", () => {
  it("rejects an empty name and trims a valid one", () => {
    createProject({ display_name: "Rename Me" });
    expect(renameProject("rename-me", "   ")).toBeNull();
    expect(renameProject("rename-me", "  Renamed  ")?.display_name).toBe("Renamed");
  });
});

describe("archive / unarchive", () => {
  it("stamps and clears archived_at", () => {
    createProject({ display_name: "Arch" });
    const archived = archiveProject("arch");
    expect(archived?.archived_at).toBeTruthy();
    // Re-archiving doesn't overwrite the original stamp.
    expect(archiveProject("arch")?.archived_at).toBe(archived?.archived_at);
    expect(unarchiveProject("arch")?.archived_at).toBeNull();
  });
});

describe("changeProjectSlug", () => {
  it("handles the same-slug display-name-only path", () => {
    createProject({ display_name: "Same Slug" });
    const updated = changeProjectSlug("same-slug", "same-slug", "  Same Slug 2  ");
    expect(updated?.display_name).toBe("Same Slug 2");
    expect(changeProjectSlug("same-slug", "same-slug")?.slug).toBe("same-slug");
  });

  it("returns null when the source slug doesn't exist", () => {
    expect(changeProjectSlug("ghost-src", "ghost-dst")).toBeNull();
  });

  it("throws when the destination slug is taken", () => {
    createProject({ display_name: "Slug Src" });
    createProject({ display_name: "Slug Dst" });
    expect(() => changeProjectSlug("slug-src", "slug-dst")).toThrow(
      "already exists",
    );
  });

  it("migrates every child row keyed off project_slug", () => {
    createProject({ display_name: "Move Src" });
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO sessions (id, project_slug, agent_id, label, harness_adapter, created_at, updated_at)
         VALUES ('mv-s1', 'move-src', 'move-src-goal-1', 'main', 'claude-code-local', ?, ?)`,
      )
      .run(now, now);
    const goal = createGoal({
      project_slug: "move-src",
      agent_id: "move-src-goal-1",
      statement: "grow",
    });
    insertUserMcpServer({
      project_slug: "move-src",
      key: "acme",
      display_name: "Acme",
      resource_url: "https://mcp.acme.dev/sse",
      discovery_url: "https://mcp.acme.dev/.well-known/oauth-protected-resource/sse",
    });

    const moved = changeProjectSlug("move-src", "move-dst", "Move Dst");
    expect(moved).toMatchObject({ slug: "move-dst", display_name: "Move Dst" });
    expect(getProject("move-src")).toBeNull();

    const session = getDb()
      .prepare("SELECT project_slug FROM sessions WHERE id = 'mv-s1'")
      .get() as { project_slug: string };
    expect(session.project_slug).toBe("move-dst");
    const movedGoal = getDb()
      .prepare("SELECT project_slug FROM goals WHERE id = ?")
      .get(goal.id) as { project_slug: string };
    expect(movedGoal.project_slug).toBe("move-dst");
    expect(listUserMcpServers("move-dst").map((r) => r.key)).toEqual(["acme"]);
    expect(listUserMcpServers("move-src")).toEqual([]);
  });
});

describe("deleteProjectRow", () => {
  it("deletes the project and every child row", () => {
    createProject({ display_name: "Del Me" });
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO sessions (id, project_slug, agent_id, label, harness_adapter, created_at, updated_at)
         VALUES ('del-s1', 'del-me', 'del-me-goal-1', 'main', 'claude-code-local', ?, ?)`,
      )
      .run(now, now);
    createGoal({ project_slug: "del-me", agent_id: "del-me-goal-1" });
    insertUserMcpServer({
      project_slug: "del-me",
      key: "gone",
      display_name: "Gone",
      resource_url: "https://mcp.gone.dev",
      discovery_url: "https://mcp.gone.dev/.well-known/oauth-protected-resource",
    });

    deleteProjectRow("del-me");

    expect(getProject("del-me")).toBeNull();
    const counts = getDb()
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM sessions WHERE project_slug = 'del-me') AS sessions,
           (SELECT COUNT(*) FROM goals WHERE project_slug = 'del-me') AS goals,
           (SELECT COUNT(*) FROM user_mcp_servers WHERE project_slug = 'del-me') AS mcps`,
      )
      .get() as { sessions: number; goals: number; mcps: number };
    expect(counts).toEqual({ sessions: 0, goals: 0, mcps: 0 });
  });
});

describe("hidden MCP preset keys", () => {
  it("adds, dedupes, and removes keys", () => {
    createProject({ display_name: "Hide List" });
    expect(getHiddenMcpPresetKeys("hide-list")).toEqual([]);

    addHiddenMcpPresetKey("hide-list", "notfair-googleads");
    addHiddenMcpPresetKey("hide-list", "notfair-googleads"); // no dup
    addHiddenMcpPresetKey("hide-list", "notfair-metaads");
    expect(getHiddenMcpPresetKeys("hide-list")).toEqual([
      "notfair-googleads",
      "notfair-metaads",
    ]);

    removeHiddenMcpPresetKey("hide-list", "notfair-googleads");
    expect(getHiddenMcpPresetKeys("hide-list")).toEqual(["notfair-metaads"]);
    // Removing an absent key is a no-op (no write).
    removeHiddenMcpPresetKey("hide-list", "notfair-googleads");
    expect(getHiddenMcpPresetKeys("hide-list")).toEqual(["notfair-metaads"]);
  });

  it("tolerates corrupt or non-array JSON in the column", () => {
    createProject({ display_name: "Hide Corrupt" });
    getDb()
      .prepare("UPDATE projects SET hidden_mcp_preset_keys_json = ? WHERE slug = ?")
      .run("{not json", "hide-corrupt");
    expect(getHiddenMcpPresetKeys("hide-corrupt")).toEqual([]);
    getDb()
      .prepare("UPDATE projects SET hidden_mcp_preset_keys_json = ? WHERE slug = ?")
      .run('{"a":1}', "hide-corrupt");
    expect(getHiddenMcpPresetKeys("hide-corrupt")).toEqual([]);
    getDb()
      .prepare("UPDATE projects SET hidden_mcp_preset_keys_json = ? WHERE slug = ?")
      .run('["ok", 42]', "hide-corrupt");
    expect(getHiddenMcpPresetKeys("hide-corrupt")).toEqual(["ok"]);
    // Missing project → empty list.
    expect(getHiddenMcpPresetKeys("no-such-project")).toEqual([]);
  });
});
