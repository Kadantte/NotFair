import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/types";

// Mock at the framework / db-module boundary per repo conventions: this
// module is pure cookie orchestration around the projects db module.
const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn<(name: string) => { value: string } | undefined>(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  getProject: vi.fn<(slug: string) => Project | null>(),
  listProjects: vi.fn<() => Project[]>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));
vi.mock("./db/projects", () => ({
  getProject: mocks.getProject,
  listProjects: mocks.listProjects,
}));

import {
  clearActiveProject,
  getActiveProject,
  setActiveProject,
} from "./active-project";

function project(slug: string, archived_at: string | null = null): Project {
  return {
    id: `id-${slug}`,
    slug,
    display_name: slug,
    created_at: "2026-01-01T00:00:00.000Z",
    archived_at,
    google_ads_account_id: null,
    meta_ads_account_id: null,
    gsc_property_id: null,
    website_url: null,
    codebase_path: null,
    harness_adapter: "claude-code-local",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getActiveProject", () => {
  it("returns the cookie's project when it exists and isn't archived", async () => {
    mocks.cookieGet.mockReturnValue({ value: "acme" });
    mocks.getProject.mockReturnValue(project("acme"));

    await expect(getActiveProject()).resolves.toMatchObject({ slug: "acme" });
    expect(mocks.getProject).toHaveBeenCalledWith("acme");
    expect(mocks.listProjects).not.toHaveBeenCalled();
  });

  it("falls back to the first listed project when the cookie project is archived", async () => {
    mocks.cookieGet.mockReturnValue({ value: "old" });
    mocks.getProject.mockReturnValue(project("old", "2026-01-02T00:00:00.000Z"));
    mocks.listProjects.mockReturnValue([project("fresh")]);

    await expect(getActiveProject()).resolves.toMatchObject({ slug: "fresh" });
  });

  it("falls back when the cookie names a deleted project", async () => {
    mocks.cookieGet.mockReturnValue({ value: "ghost" });
    mocks.getProject.mockReturnValue(null);
    mocks.listProjects.mockReturnValue([project("fresh")]);

    await expect(getActiveProject()).resolves.toMatchObject({ slug: "fresh" });
  });

  it("falls back to the first project when no cookie is set", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.listProjects.mockReturnValue([project("a"), project("b")]);

    await expect(getActiveProject()).resolves.toMatchObject({ slug: "a" });
    expect(mocks.getProject).not.toHaveBeenCalled();
  });

  it("returns null when there are no projects at all", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.listProjects.mockReturnValue([]);

    await expect(getActiveProject()).resolves.toBeNull();
  });
});

describe("setActiveProject", () => {
  it("writes a year-long httpOnly cookie", async () => {
    await setActiveProject("acme");
    expect(mocks.cookieSet).toHaveBeenCalledWith("notfair_active_project", "acme", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  });
});

describe("clearActiveProject", () => {
  it("deletes the cookie", async () => {
    await clearActiveProject();
    expect(mocks.cookieDelete).toHaveBeenCalledWith("notfair_active_project");
  });
});
