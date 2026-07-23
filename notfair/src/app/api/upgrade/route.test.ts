import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("@/server/version", () => ({
  _resetLatestCache: vi.fn(),
  getCurrentVersion: vi.fn(() => "0.9.7"),
  getLatestVersion: vi.fn(async () => "0.9.8"),
  isSemverGreater: vi.fn(() => true),
}));

import { POST, syncInstalledNativeBindings } from "./route";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("POST /api/upgrade", () => {
  let dataDir: string;
  const originalDataDir = process.env.NOTFAIR_DATA_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    return mkdtemp(join(tmpdir(), "notfair-update-data-")).then((dir) => {
      dataDir = dir;
      process.env.NOTFAIR_DATA_DIR = dir;
    });
  });

  afterEach(async () => {
    if (originalDataDir === undefined) delete process.env.NOTFAIR_DATA_DIR;
    else process.env.NOTFAIR_DATA_DIR = originalDataDir;
    await rm(dataDir, { recursive: true, force: true });
  });

  it("downloads the package without modifying the installed version", async () => {
    const child = fakeChild();
    mocks.spawn.mockReturnValue(child);

    const responsePromise = POST();

    await vi.waitFor(() => {
      expect(mocks.spawn).toHaveBeenCalledWith(
        "npm",
        [
          "pack",
          "notfair@0.9.8",
          "--pack-destination",
          join(dataDir, "updates", "0.9.8"),
          "--silent",
        ],
        expect.objectContaining({ cwd: homedir() }),
      );
    });
    expect(mocks.spawn).not.toHaveBeenCalledWith(
      "npm",
      expect.arrayContaining(["-g"]),
      expect.anything(),
    );

    await mkdir(join(dataDir, "updates", "0.9.8"), { recursive: true });
    await writeFile(join(dataDir, "updates", "0.9.8", "notfair-0.9.8.tgz"), "package");
    child.emit("exit", 0);
    const response = await responsePromise;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      downloaded_version: "0.9.8",
    });
  });

  it("runs npm install only for an explicit apply action", async () => {
    const updateDir = join(dataDir, "updates", "0.9.8");
    const tarball = join(updateDir, "notfair-0.9.8.tgz");
    await mkdir(updateDir, { recursive: true });
    await writeFile(tarball, "package");
    await writeFile(
      join(dataDir, "updates", "pending.json"),
      JSON.stringify({
        version: "0.9.8",
        tarball,
        downloaded_at: new Date().toISOString(),
      }),
    );
    const child = fakeChild();
    mocks.spawn.mockReturnValue(child);

    const responsePromise = POST(
      new Request("http://localhost/api/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      }),
    );

    await vi.waitFor(() => {
      expect(mocks.spawn).toHaveBeenCalledWith(
        "npm",
        ["i", "-g", tarball],
        expect.objectContaining({ cwd: homedir() }),
      );
    });
    child.emit("exit", 7);
    const response = await responsePromise;
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "npm install exited with code 7",
    });
  });

  it("replaces standalone native bindings with npm's runtime-compatible copy", async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "notfair-upgrade-"));
    const runtimeDir = join(packageRoot, "node_modules", "better-sqlite3", "build", "Release");
    const tracedDir = join(
      packageRoot,
      ".next",
      "standalone",
      ".next",
      "node_modules",
      "better-sqlite3-build-copy",
      "build",
      "Release",
    );
    const nestedDir = join(
      packageRoot,
      ".next",
      "standalone",
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
    );

    try {
      await Promise.all([
        mkdir(runtimeDir, { recursive: true }),
        mkdir(tracedDir, { recursive: true }),
        mkdir(nestedDir, { recursive: true }),
      ]);
      await writeFile(join(runtimeDir, "better_sqlite3.node"), "node-25-binding");
      await Promise.all([
        writeFile(join(tracedDir, "better_sqlite3.node"), "node-24-binding"),
        writeFile(join(nestedDir, "better_sqlite3.node"), "node-24-binding"),
      ]);

      await expect(syncInstalledNativeBindings(packageRoot)).resolves.toBe(2);
      await expect(readFile(join(tracedDir, "better_sqlite3.node"), "utf8")).resolves.toBe(
        "node-25-binding",
      );
      await expect(readFile(join(nestedDir, "better_sqlite3.node"), "utf8")).resolves.toBe(
        "node-25-binding",
      );
    } finally {
      await rm(packageRoot, { recursive: true, force: true });
    }
  });
});
