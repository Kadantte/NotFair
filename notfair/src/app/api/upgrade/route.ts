import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { NextResponse } from "next/server";

import {
  _resetLatestCache,
  getCurrentVersion,
  getLatestVersion,
  isSemverGreater,
} from "@/server/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPGRADE_TIMEOUT_MS = 5 * 60 * 1000;
const TAIL_BYTES = 4_000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

type UpgradeAction = "prepare" | "apply";

type PendingUpdate = {
  version: string;
  tarball: string;
  downloaded_at: string;
};

type CommandResult = {
  code: number | null;
  elapsed_ms: number;
  stdout: string;
  stderr: string;
  spawn_error?: string;
};

/**
 * POST /api/upgrade
 *
 * `prepare` is intentionally download-only: it asks npm to pack the exact
 * registry version into NotFair's data directory and records the staged
 * tarball. It never changes the running installation.
 *
 * `apply` is only sent after the user clicks Update. It installs that exact
 * staged tarball globally. The client immediately follows a successful apply
 * with /api/restart when NotFair owns its background process.
 */
export async function POST(request?: Request) {
  const action = await requestedAction(request);
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "Unknown upgrade action." },
      { status: 400 },
    );
  }
  return action === "apply" ? applyUpdate() : prepareUpdate();
}

async function requestedAction(request?: Request): Promise<UpgradeAction | null> {
  if (!request) return "prepare";
  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action === undefined || body.action === "prepare") return "prepare";
    if (body.action === "apply") return "apply";
    return null;
  } catch {
    return "prepare";
  }
}

async function prepareUpdate(): Promise<Response> {
  const latest = await getLatestVersion(true);
  const current = getCurrentVersion();
  if (!latest) {
    return NextResponse.json(
      { ok: false, error: "Could not reach the npm registry." },
      { status: 503 },
    );
  }
  if (!VERSION_PATTERN.test(latest)) {
    return NextResponse.json(
      { ok: false, error: "The npm registry returned an invalid version." },
      { status: 502 },
    );
  }
  if (!isSemverGreater(latest, current)) {
    return NextResponse.json({
      ok: true,
      downloaded_version: latest,
      running_version: current,
      already_current: true,
    });
  }

  const tarball = stagedTarballPath(latest);
  const existing = await isFile(tarball);
  if (!existing) {
    await mkdir(dirname(tarball), { recursive: true });
    const result = await runNpm([
      "pack",
      `notfair@${latest}`,
      "--pack-destination",
      dirname(tarball),
      "--silent",
    ]);
    if (result.spawn_error) {
      return npmUnavailableResponse(result.spawn_error, "download");
    }
    if (result.code !== 0 || !(await isFile(tarball))) {
      return npmFailureResponse(result, "download", latest);
    }
  }

  await writePendingUpdate({
    version: latest,
    tarball,
    downloaded_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    downloaded_version: latest,
    running_version: current,
    note: `v${latest} downloaded and ready to install.`,
  });
}

async function applyUpdate(): Promise<Response> {
  const pending = await readPendingUpdate();
  if (!pending || !(await isFile(pending.tarball))) {
    return NextResponse.json(
      {
        ok: false,
        error: "The downloaded update is missing. Download it again before applying.",
      },
      { status: 409 },
    );
  }

  const result = await runNpm(["i", "-g", pending.tarball]);
  if (result.spawn_error) {
    return npmUnavailableResponse(result.spawn_error, "install", pending.version);
  }
  if (result.code !== 0) {
    return npmFailureResponse(result, "install", pending.version);
  }

  try {
    await syncGlobalNativeBindings();
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "NotFair was installed, but its native database module could not be prepared for this Node.js version.",
        hint: error instanceof Error ? error.message : String(error),
        command: `npm i -g notfair@${pending.version}`,
      },
      { status: 500 },
    );
  }

  _resetLatestCache();
  const managed = process.env.NOTFAIR_MANAGED ?? null;
  const canRestart = managed === "launchd" || managed === "daemon";
  return NextResponse.json({
    ok: true,
    installed_version: pending.version,
    running_version: getCurrentVersion(),
    can_restart: canRestart,
    note: canRestart
      ? "Installed — restarting loads the new version."
      : "Installed. Restart NotFair to load the new version (`notfair` in your terminal).",
    elapsed_ms: result.elapsed_ms,
    stdout_tail: result.stdout.slice(-1000),
  });
}

function updateRoot(): string {
  const dataDir = process.env.NOTFAIR_DATA_DIR ?? join(homedir(), ".notfair");
  return resolve(dataDir, "updates");
}

function stagedTarballPath(version: string): string {
  return join(updateRoot(), version, `notfair-${version}.tgz`);
}

function pendingUpdatePath(): string {
  return join(updateRoot(), "pending.json");
}

async function writePendingUpdate(update: PendingUpdate): Promise<void> {
  const target = pendingUpdatePath();
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(update)}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

async function readPendingUpdate(): Promise<PendingUpdate | null> {
  try {
    const parsed = JSON.parse(await readFile(pendingUpdatePath(), "utf8")) as Partial<PendingUpdate>;
    if (
      typeof parsed.version !== "string" ||
      !VERSION_PATTERN.test(parsed.version) ||
      typeof parsed.tarball !== "string" ||
      typeof parsed.downloaded_at !== "string"
    ) {
      return null;
    }
    const expected = stagedTarballPath(parsed.version);
    if (resolve(parsed.tarball) !== resolve(expected)) return null;
    return parsed as PendingUpdate;
  } catch {
    return null;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function runNpm(args: string[]): Promise<CommandResult> {
  // A running standalone bundle can be replaced by a source rebuild or an
  // explicit install. Never inherit a now-missing server working directory:
  // npm aborts in process.cwd() with ENOENT (exit code 7) before doing work.
  return new Promise((resolveCommand) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;
    try {
      child = spawn("npm", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        cwd: homedir(),
      });
    } catch (error) {
      resolveCommand({
        code: null,
        elapsed_ms: Date.now() - startedAt,
        stdout,
        stderr,
        spawn_error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const append = (target: "out" | "err") => (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (target === "out") stdout = (stdout + text).slice(-TAIL_BYTES);
      else stderr = (stderr + text).slice(-TAIL_BYTES);
    };
    child.stdout?.on("data", append("out"));
    child.stderr?.on("data", append("err"));

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolveCommand(result);
    };
    const killTimer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // best-effort
      }
    }, UPGRADE_TIMEOUT_MS);

    child.on("error", (error) => {
      finish({
        code: null,
        elapsed_ms: Date.now() - startedAt,
        stdout,
        stderr,
        spawn_error: error.message,
      });
    });
    child.on("exit", (code) => {
      finish({ code, elapsed_ms: Date.now() - startedAt, stdout, stderr });
    });
  });
}

function npmUnavailableResponse(error: string, operation: "download" | "install", version?: string) {
  const command = version ? `npm i -g notfair@${version}` : "npm i -g notfair@latest";
  return NextResponse.json(
    {
      ok: false,
      error,
      hint: `Could not run npm to ${operation} the update. Run \`${command}\` in your terminal instead.`,
      command,
    },
    { status: 500 },
  );
}

function npmFailureResponse(
  result: CommandResult,
  operation: "download" | "install",
  version: string,
) {
  return NextResponse.json(
    {
      ok: false,
      error: `npm ${operation} exited with code ${result.code}`,
      elapsed_ms: result.elapsed_ms,
      stdout_tail: result.stdout.slice(-1000),
      stderr_tail: result.stderr.slice(-1000),
      command: `npm i -g notfair@${version}`,
    },
    { status: 500 },
  );
}

async function syncGlobalNativeBindings() {
  const root = await npmGlobalRoot();
  await syncInstalledNativeBindings(join(root, "notfair"));
}

async function npmGlobalRoot(): Promise<string> {
  const result = await runNpm(["root", "-g"]);
  const root = result.stdout.trim();
  if (result.code === 0 && root) return root;
  throw new Error(`Could not locate npm's global package directory (exit ${result.code}).`);
}

/**
 * Next.js standalone output contains a traced copy of better-sqlite3. That
 * copy was compiled on the release builder, while npm installs the package's
 * top-level dependency for the user's current Node ABI. Replace every traced
 * native binding with that runtime-correct copy before restarting the server.
 */
export async function syncInstalledNativeBindings(packageRoot: string) {
  const runtimeBinding = join(
    packageRoot,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  const standaloneRoot = join(packageRoot, ".next", "standalone");
  const targets = await findNativeBindings(standaloneRoot);

  if (targets.length === 0) return 0;

  await Promise.all(targets.map((target) => copyFile(runtimeBinding, target)));
  return targets.length;
}

async function findNativeBindings(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findNativeBindings(path);
      if (entry.isFile() && entry.name === "better_sqlite3.node") return [path];
      return [];
    }),
  );
  return nested.flat();
}
