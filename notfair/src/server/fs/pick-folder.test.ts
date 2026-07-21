import { beforeEach, describe, expect, it, vi } from "vitest";

// Never spawn real dialog binaries: mock the child_process + platform
// boundary and drive each OS branch through the callback contract.
type ExecCall = { cmd: string; args: string[] };
type ExecOutcome = {
  err?: (Error & { code?: number | string }) | null;
  stdout?: string;
  stderr?: string;
};

const h = vi.hoisted(() => {
  const state = {
    platform: "darwin" as string,
    calls: [] as ExecCall[],
    // Consumed in order — one entry per expected execFile invocation.
    outcomes: [] as ExecOutcome[],
  };
  return { state };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, platform: () => h.state.platform };
});
vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    h.state.calls.push({ cmd, args });
    const outcome = h.state.outcomes.shift() ?? {};
    queueMicrotask(() =>
      cb(outcome.err ?? null, outcome.stdout ?? "", outcome.stderr ?? ""),
    );
  },
}));

import { pickFolder } from "./pick-folder";

function errWithCode(code: number | string): Error & { code: number | string } {
  return Object.assign(new Error(`exec failed (${code})`), { code });
}

beforeEach(() => {
  h.state.platform = "darwin";
  h.state.calls = [];
  h.state.outcomes = [];
});

describe("platform dispatch", () => {
  it("reports unsupported on Windows without spawning anything", async () => {
    h.state.platform = "win32";
    await expect(pickFolder({})).resolves.toEqual({
      ok: false,
      kind: "unsupported",
      platform: "win32",
    });
    expect(h.state.calls).toHaveLength(0);
  });
});

describe("macOS (osascript)", () => {
  it("returns the picked path with the trailing slash stripped", async () => {
    h.state.outcomes = [{ stdout: "/Users/me/Sites/acme/\n" }];
    await expect(pickFolder({})).resolves.toEqual({
      ok: true,
      path: "/Users/me/Sites/acme",
    });
    expect(h.state.calls[0]!.cmd).toBe("/usr/bin/osascript");
    expect(h.state.calls[0]!.args[0]).toBe("-e");
  });

  it("passes the prompt and default location into the script, escaped", async () => {
    h.state.outcomes = [{ stdout: "/tmp/x/\n" }];
    await pickFolder({
      prompt: 'Pick "the" folder',
      defaultLocation: '/Users/me/"quoted"',
    });
    const script = h.state.calls[0]!.args[1]!;
    expect(script).toContain('choose folder with prompt "Pick \\"the\\" folder"');
    expect(script).toContain('default location POSIX file "/Users/me/\\"quoted\\""');
  });

  it("omits the default-location clause when none is given", async () => {
    h.state.outcomes = [{ stdout: "/tmp/x\n" }];
    await pickFolder({});
    const script = h.state.calls[0]!.args[1]!;
    expect(script).toContain('choose folder with prompt "Select a folder"');
    expect(script).not.toContain("default location");
  });

  it("maps the cancel sentinel to kind: cancelled", async () => {
    h.state.outcomes = [{ stdout: "__USER_CANCELLED__\n" }];
    await expect(pickFolder({})).resolves.toEqual({ ok: false, kind: "cancelled" });
  });

  it("treats empty output as cancelled", async () => {
    h.state.outcomes = [{ stdout: "" }];
    await expect(pickFolder({})).resolves.toEqual({ ok: false, kind: "cancelled" });
  });

  it("surfaces stderr when osascript exits non-zero", async () => {
    h.state.outcomes = [
      { err: errWithCode(1), stderr: "execution error: boom (-1)" },
    ];
    await expect(pickFolder({})).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "execution error: boom (-1)",
    });
  });

  it("falls back to the exit code when stderr is empty", async () => {
    h.state.outcomes = [{ err: errWithCode(2), stderr: "" }];
    await expect(pickFolder({})).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "osascript exited with code 2",
    });
  });
});

describe("Linux (zenity → kdialog)", () => {
  beforeEach(() => {
    h.state.platform = "linux";
  });

  it("uses zenity when available and returns the picked path", async () => {
    h.state.outcomes = [{ stdout: "/home/me/proj/\n" }];
    await expect(
      pickFolder({ prompt: "Pick it", defaultLocation: "/home/me" }),
    ).resolves.toEqual({ ok: true, path: "/home/me/proj" });
    expect(h.state.calls).toEqual([
      {
        cmd: "zenity",
        args: [
          "--file-selection",
          "--directory",
          "--title=Pick it",
          "--filename=/home/me/",
        ],
      },
    ]);
  });

  it("falls back to kdialog when zenity is not installed", async () => {
    h.state.outcomes = [
      { err: errWithCode("ENOENT") }, // zenity missing
      { stdout: "/home/me/other\n" }, // kdialog succeeds
    ];
    await expect(pickFolder({ prompt: "Pick it" })).resolves.toEqual({
      ok: true,
      path: "/home/me/other",
    });
    expect(h.state.calls.map((c) => c.cmd)).toEqual(["zenity", "kdialog"]);
    expect(h.state.calls[1]!.args).toEqual([
      "--getexistingdirectory",
      "",
      "--title",
      "Pick it",
    ]);
  });

  it("reports a clear install hint when neither tool exists", async () => {
    h.state.outcomes = [
      { err: errWithCode("ENOENT") },
      { err: errWithCode("ENOENT") },
    ];
    const result = await pickFolder({});
    expect(result).toMatchObject({ ok: false, kind: "error" });
    expect((result as { message: string }).message).toMatch(
      /zenity.*kdialog|kdialog.*zenity/i,
    );
  });

  it("maps zenity exit code 1 to cancelled", async () => {
    h.state.outcomes = [{ err: errWithCode(1) }];
    await expect(pickFolder({})).resolves.toEqual({ ok: false, kind: "cancelled" });
  });

  it("treats empty dialog output as cancelled", async () => {
    h.state.outcomes = [{ stdout: "\n" }];
    await expect(pickFolder({})).resolves.toEqual({ ok: false, kind: "cancelled" });
  });

  it("surfaces other dialog failures as errors", async () => {
    h.state.outcomes = [
      { err: errWithCode(255), stderr: "cannot open display" },
    ];
    await expect(pickFolder({})).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "cannot open display",
    });
  });
});
