import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Real fs against a tmpdir data dir, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// so a plain assignment would point the suite at the developer's ~/.notfair.
const h = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "notfair-brief-"));
  process.env.NOTFAIR_DATA_DIR = dataDir;
  return { dataDir };
});

import {
  PROJECT_BRIEF_MAX_BYTES,
  deleteProjectBriefDir,
  projectBriefDir,
  projectBriefPath,
  readProjectBrief,
  renameProjectBriefDir,
  writeProjectBrief,
} from "./project-brief";

describe("project brief paths", () => {
  it("lives under <data dir>/projects/<slug>/PROJECT.md", () => {
    expect(projectBriefDir("acme")).toBe(join(h.dataDir, "projects", "acme"));
    expect(projectBriefPath("acme")).toBe(
      join(h.dataDir, "projects", "acme", "PROJECT.md"),
    );
  });

  it("exposes the documented size cap", () => {
    expect(PROJECT_BRIEF_MAX_BYTES).toBe(64 * 1024);
  });
});

describe("read / write round trip", () => {
  it("returns null before any brief has been written", async () => {
    await expect(readProjectBrief("never-written")).resolves.toBeNull();
  });

  it("writes and reads back the exact body", async () => {
    await writeProjectBrief("acme", "# Acme\n\nWe sell anvils.\n");
    await expect(readProjectBrief("acme")).resolves.toBe(
      "# Acme\n\nWe sell anvils.\n",
    );
  });

  it("overwrites idempotently on rewrite", async () => {
    await writeProjectBrief("acme", "v1");
    await writeProjectBrief("acme", "v2");
    await expect(readProjectBrief("acme")).resolves.toBe("v2");
  });

  it("propagates non-ENOENT fs errors instead of masking them as null", async () => {
    // Make PROJECT.md a *directory* — readFile then fails with EISDIR,
    // which must bubble (only ENOENT means "no brief yet").
    await mkdir(projectBriefPath("dir-not-file"), { recursive: true });
    await expect(readProjectBrief("dir-not-file")).rejects.toThrow();
  });
});

describe("deleteProjectBriefDir", () => {
  it("removes the canonical dir so a recreated slug starts clean", async () => {
    await writeProjectBrief("doomed", "secret prior-tenant brief");
    await deleteProjectBriefDir("doomed");
    expect(existsSync(projectBriefDir("doomed"))).toBe(false);
    await expect(readProjectBrief("doomed")).resolves.toBeNull();
  });

  it("is a no-op when the dir never existed", async () => {
    await expect(deleteProjectBriefDir("never-existed")).resolves.toBeUndefined();
  });
});

describe("renameProjectBriefDir", () => {
  it("moves the brief to the new slug's dir", async () => {
    await writeProjectBrief("old-slug", "the brief");
    await renameProjectBriefDir("old-slug", "new-slug");
    expect(existsSync(projectBriefDir("old-slug"))).toBe(false);
    await expect(readProjectBrief("new-slug")).resolves.toBe("the brief");
  });

  it("no-ops when old and new slug are identical", async () => {
    await expect(renameProjectBriefDir("same", "same")).resolves.toBeUndefined();
  });

  it("no-ops when the source dir doesn't exist", async () => {
    await renameProjectBriefDir("ghost", "ghost-dest");
    expect(existsSync(projectBriefDir("ghost-dest"))).toBe(false);
  });

  it("throws on a slug collision with a non-empty destination", async () => {
    await writeProjectBrief("col-src", "src brief");
    await writeProjectBrief("col-dst", "dst brief");
    await expect(renameProjectBriefDir("col-src", "col-dst")).rejects.toThrow();
    // Neither side was clobbered.
    await expect(readProjectBrief("col-dst")).resolves.toBe("dst brief");
    await expect(readProjectBrief("col-src")).resolves.toBe("src brief");
  });

  it("propagates non-ENOENT stat errors", async () => {
    // A file where the *parent dir path component* should be a directory
    // makes stat fail with ENOTDIR, which must bubble.
    await mkdir(join(h.dataDir, "projects"), { recursive: true });
    await writeFile(join(h.dataDir, "projects", "plainfile"), "x", "utf8");
    await expect(
      renameProjectBriefDir("plainfile/child", "elsewhere"),
    ).rejects.toThrow();
  });
});
