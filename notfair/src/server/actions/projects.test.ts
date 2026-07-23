import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
const h = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "notfair-actions-projects-"));
  process.env.NOTFAIR_DATA_DIR = dataDir;
  return { dataDir };
});

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  cookieJar: new Map<string, string>(),
  listProjectAgents: vi.fn(async () => [] as unknown[]),
  readAgentMeta: vi.fn(() => null as unknown),
  relocateAgent: vi.fn(async () => ({ new_agent_id: "x", new_slug: "y" })),
  cascadeDeleteProjectArtifacts: vi.fn(async () => {}),
  getProjectDeletionSummary: vi.fn(async () => ({ agents: [], mcps: [] })),
  listProjectMcpTokens: vi.fn(() => [] as unknown[]),
  renameProjectBriefDir: vi.fn(async () => {}),
  deleteProjectBriefDir: vi.fn(async () => {}),
  syncProjectAgents: vi.fn(async () => 0),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookieJar.has(name) ? { name, value: mocks.cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void mocks.cookieJar.set(name, value),
    delete: (name: string) => void mocks.cookieJar.delete(name),
  }),
}));
vi.mock("@/server/agent-meta", () => ({
  listProjectAgents: mocks.listProjectAgents,
  readAgentMeta: mocks.readAgentMeta,
}));
vi.mock("@/server/actions/agents", () => ({
  relocateAgent: mocks.relocateAgent,
}));
vi.mock("@/server/agents/cascade-delete", () => ({
  cascadeDeleteProjectArtifacts: mocks.cascadeDeleteProjectArtifacts,
  getProjectDeletionSummary: mocks.getProjectDeletionSummary,
}));
vi.mock("@/server/mcp/tokens", () => ({
  listProjectMcpTokens: mocks.listProjectMcpTokens,
}));
vi.mock("@/server/onboarding/project-brief", () => ({
  renameProjectBriefDir: mocks.renameProjectBriefDir,
  deleteProjectBriefDir: mocks.deleteProjectBriefDir,
}));
vi.mock("@/server/goals/provision", () => ({
  syncProjectAgents: mocks.syncProjectAgents,
}));

import { getDb } from "@/server/db/db";
import { createProject, getProject } from "@/server/db/projects";
import {
  archiveProjectAction,
  createProjectAction,
  createProjectForOnboardingAction,
  deleteProjectAction,
  getProjectDeletionSummaryAction,
  renameProjectAction,
  renameProjectFullAction,
  setProjectCodebasePathAction,
  switchProjectAction,
} from "./projects";

const COOKIE = "notfair_active_project";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieJar.clear();
  mocks.listProjectAgents.mockResolvedValue([]);
});

describe("createProjectAction", () => {
  it("throws on a missing name", async () => {
    await expect(createProjectAction(form({}))).rejects.toThrow(
      "Please enter a workspace name.",
    );
  });

  it("throws with the createProject reason on failure", async () => {
    createProject({ display_name: "Taken" });
    await expect(
      createProjectAction(form({ display_name: "Taken" })),
    ).rejects.toThrow("already exists");
  });

  it("creates, activates, and redirects home", async () => {
    await createProjectAction(form({ display_name: "Fresh One" }));
    expect(getProject("fresh-one")).not.toBeNull();
    expect(mocks.cookieJar.get(COOKIE)).toBe("fresh-one");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});

describe("createProjectForOnboardingAction", () => {
  it("returns errors instead of throwing", async () => {
    expect(await createProjectForOnboardingAction(form({}))).toEqual({
      ok: false,
      error: "Please enter a workspace name.",
    });
    const dup = await createProjectForOnboardingAction(
      form({ display_name: "Fresh One" }),
    );
    expect(dup.ok).toBe(false);
  });

  it("persists onboarding hints and falls back on an unknown harness", async () => {
    const r = await createProjectForOnboardingAction(
      form({
        display_name: "Onboard Co",
        website_url: " https://onboard.co ",
        codebase_path: "",
        harness_adapter: "not-a-harness",
      }),
    );
    expect(r).toEqual({
      ok: true,
      data: { slug: "onboard-co", display_name: "Onboard Co" },
    });
    expect(getProject("onboard-co")).toMatchObject({
      website_url: "https://onboard.co",
      codebase_path: null,
      harness_adapter: "claude-code-local",
    });
    expect(mocks.cookieJar.get(COOKIE)).toBe("onboard-co");
  });

  it("honors a valid harness choice", async () => {
    await createProjectForOnboardingAction(
      form({ display_name: "Codex Shop", harness_adapter: "codex-local" }),
    );
    expect(getProject("codex-shop")?.harness_adapter).toBe("codex-local");
  });
});

describe("switch / archive / rename actions", () => {
  it("switchProjectAction repoints the cookie", async () => {
    expect(await switchProjectAction("fresh-one")).toEqual({ ok: true, data: undefined });
    expect(mocks.cookieJar.get(COOKIE)).toBe("fresh-one");
  });

  it("archiveProjectAction handles missing and existing projects", async () => {
    expect(await archiveProjectAction("no-such")).toEqual({
      ok: false,
      error: "Project not found.",
    });
    createProject({ display_name: "Archive Target" });
    expect(await archiveProjectAction("archive-target")).toEqual({
      ok: true,
      data: undefined,
    });
    expect(getProject("archive-target")?.archived_at).toBeTruthy();
  });

  it("renameProjectAction handles missing and existing projects", async () => {
    expect(await renameProjectAction("no-such", "New")).toEqual({
      ok: false,
      error: "Project not found or name invalid.",
    });
    createProject({ display_name: "Rename Target" });
    expect(await renameProjectAction("rename-target", "Renamed Target")).toEqual({
      ok: true,
      data: undefined,
    });
    expect(getProject("rename-target")?.display_name).toBe("Renamed Target");
  });
});

describe("renameProjectFullAction", () => {
  it("validates the project, name, and slug", async () => {
    expect(
      await renameProjectFullAction({ current_slug: "ghost", new_display_name: "X" }),
    ).toEqual({ ok: false, error: "Project 'ghost' not found." });

    createProject({ display_name: "Full Rename" });
    expect(
      await renameProjectFullAction({ current_slug: "full-rename", new_display_name: "  " }),
    ).toEqual({ ok: false, error: "Name cannot be empty." });
    expect(
      await renameProjectFullAction({ current_slug: "full-rename", new_display_name: "###" }),
    ).toMatchObject({ ok: false });
  });

  it("no-ops when nothing changed and takes the cheap path for display-only", async () => {
    const same = await renameProjectFullAction({
      current_slug: "full-rename",
      new_display_name: "Full Rename",
    });
    expect(same).toEqual({
      ok: true,
      data: {
        slug: "full-rename",
        display_name: "Full Rename",
        full_rename: false,
        agents_relocated: [],
        agents_failed: [],
      },
    });

    const display = await renameProjectFullAction({
      current_slug: "full-rename",
      new_display_name: "FULL rename", // same slug, new display name
    });
    expect(display).toMatchObject({
      ok: true,
      data: { slug: "full-rename", display_name: "FULL rename", full_rename: false },
    });
    expect(getProject("full-rename")?.display_name).toBe("FULL rename");
    expect(mocks.relocateAgent).not.toHaveBeenCalled();
  });

  it("refuses to rename onto an existing slug", async () => {
    createProject({ display_name: "Slug Squatter" });
    expect(
      await renameProjectFullAction({
        current_slug: "full-rename",
        new_display_name: "Slug Squatter",
      }),
    ).toEqual({ ok: false, error: "A project with slug 'slug-squatter' already exists." });
  });

  it("cascades: relocates agents, migrates rows, moves the brief, repoints the cookie", async () => {
    mocks.cookieJar.set(COOKIE, "full-rename");
    mocks.listProjectAgents.mockResolvedValue([
      { agent_id: "full-rename-goal-1", slug: "goal-1", name: "Goal 1" },
      { agent_id: "full-rename-goal-2", slug: "goal-2", name: "Goal 2" },
    ]);
    mocks.readAgentMeta.mockReturnValue({
      source_agent_id: "origin-agent",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    mocks.relocateAgent
      .mockResolvedValueOnce({ new_agent_id: "renamed-co-goal-1", new_slug: "goal-1" })
      .mockRejectedValueOnce(new Error("workspace busy"));

    const r = await renameProjectFullAction({
      current_slug: "full-rename",
      new_display_name: "Renamed Co",
    });
    expect(r).toEqual({
      ok: true,
      data: {
        slug: "renamed-co",
        display_name: "Renamed Co",
        full_rename: true,
        agents_relocated: ["full-rename-goal-1"],
        agents_failed: [
          { agent_id: "full-rename-goal-2", error: "workspace busy" },
        ],
      },
    });
    expect(mocks.relocateAgent).toHaveBeenCalledWith({
      old_agent_id: "full-rename-goal-1",
      source_project_slug: "full-rename",
      new_project_slug: "renamed-co",
      new_slug: "goal-1",
      new_display_name: "Goal 1",
      preserve_source_agent_id: "origin-agent",
      preserve_created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(getProject("full-rename")).toBeNull();
    expect(getProject("renamed-co")?.display_name).toBe("Renamed Co");
    expect(mocks.renameProjectBriefDir).toHaveBeenCalledWith("full-rename", "renamed-co");
    expect(mocks.cookieJar.get(COOKIE)).toBe("renamed-co");
  });
});

describe("getProjectDeletionSummaryAction", () => {
  it("handles missing project, success, and summary failure", async () => {
    expect(await getProjectDeletionSummaryAction("ghost")).toEqual({
      ok: false,
      error: "Project 'ghost' not found.",
    });
    createProject({ display_name: "Summary Me" });
    expect(await getProjectDeletionSummaryAction("summary-me")).toEqual({
      ok: true,
      data: { agents: [], mcps: [] },
    });
    mocks.getProjectDeletionSummary.mockRejectedValueOnce(new Error("scan failed"));
    expect(await getProjectDeletionSummaryAction("summary-me")).toEqual({
      ok: false,
      error: "scan failed",
    });
  });
});

describe("deleteProjectAction", () => {
  it("requires a matching confirmation slug and an existing project", async () => {
    expect(await deleteProjectAction("a", "b")).toEqual({
      ok: false,
      error: "Confirmation slug does not match.",
    });
    expect(await deleteProjectAction("ghost", "ghost")).toEqual({
      ok: false,
      error: "Project 'ghost' not found.",
    });
  });

  it("cascades everything and clears the active-project cookie", async () => {
    createProject({ display_name: "Doomed" });
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO sessions (id, project_slug, agent_id, label, harness_adapter, created_at, updated_at)
         VALUES ('doom-s1', 'doomed', 'doomed-goal-1', 'main', 'claude-code-local', ?, ?)`,
      )
      .run(now, now);
    mocks.cookieJar.set(COOKIE, "doomed");
    mocks.listProjectAgents.mockResolvedValue([{ agent_id: "doomed-goal-1" }]);
    mocks.listProjectMcpTokens.mockReturnValue([{}, {}]);

    const r = await deleteProjectAction("doomed", "doomed");
    expect(r).toEqual({
      ok: true,
      data: { agents: ["doomed-goal-1"], agentsFailed: [], mcps: 2, mcpsFailed: 0 },
    });
    expect(mocks.cascadeDeleteProjectArtifacts).toHaveBeenCalledWith("doomed");
    expect(mocks.deleteProjectBriefDir).toHaveBeenCalledWith("doomed");
    expect(getProject("doomed")).toBeNull();
    expect(mocks.cookieJar.has(COOKIE)).toBe(false);
  });

  it("records a cascade failure but still deletes the DB rows", async () => {
    createProject({ display_name: "Doomed Two" });
    mocks.cascadeDeleteProjectArtifacts.mockRejectedValueOnce(new Error("rm failed"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await deleteProjectAction("doomed-two", "doomed-two");
      expect(r).toMatchObject({
        ok: true,
        data: { agentsFailed: [{ agentId: "(project)", error: "rm failed" }] },
      });
      expect(getProject("doomed-two")).toBeNull();
    } finally {
      err.mockRestore();
    }
  });
});

describe("setProjectCodebasePathAction", () => {
  it("validates slug, path existence, and directory-ness", async () => {
    expect(
      await setProjectCodebasePathAction({ project_slug: "  ", codebase_path: "/x" }),
    ).toEqual({ ok: false, error: "Missing project slug." });

    const missing = join(h.dataDir, "does-not-exist");
    expect(
      await setProjectCodebasePathAction({ project_slug: "s", codebase_path: missing }),
    ).toEqual({ ok: false, error: `Folder not found: ${missing}` });

    const file = join(h.dataDir, "a-file.txt");
    writeFileSync(file, "hi");
    expect(
      await setProjectCodebasePathAction({ project_slug: "s", codebase_path: file }),
    ).toEqual({ ok: false, error: `Not a folder: ${file}` });
  });

  it("fails when the project row is missing", async () => {
    const dir = join(h.dataDir, "repo");
    mkdirSync(dir, { recursive: true });
    expect(
      await setProjectCodebasePathAction({ project_slug: "ghost", codebase_path: dir }),
    ).toEqual({ ok: false, error: "Project not found." });
  });

  it("persists the folder and re-syncs agent identities", async () => {
    createProject({ display_name: "Codebase Co" });
    const dir = join(h.dataDir, "repo");
    const r = await setProjectCodebasePathAction({
      project_slug: "codebase-co",
      codebase_path: ` ${dir} `,
    });
    expect(r).toEqual({ ok: true, codebase_path: dir });
    expect(mocks.syncProjectAgents).toHaveBeenCalledWith("codebase-co");
    expect(getProject("codebase-co")?.codebase_path).toBe(dir);
  });

  it("clears the path and tolerates a failing identity sync", async () => {
    mocks.syncProjectAgents.mockRejectedValueOnce(new Error("render broke"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await setProjectCodebasePathAction({
        project_slug: "codebase-co",
        codebase_path: "  ",
      });
      expect(r).toEqual({ ok: true, codebase_path: null });
    } finally {
      warn.mockRestore();
    }
  });
});
