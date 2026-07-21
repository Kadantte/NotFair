import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// harness-usage reads real HOME paths (~/.codex, ~/.claude) and spawns the
// codex CLI. Point homedir at a tmpdir and fake the spawn + fetch surfaces —
// no real binaries, no network, never the developer's actual home.
const h = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const home = mkdtempSync(join(tmpdir(), "notfair-usage-home-"));
  return {
    home,
    state: {
      loginOutput: "Logged in using ChatGPT\n",
      loginStderr: "",
      spawnMode: "close" as "close" | "error" | "hang",
      killThrows: false,
      spawns: [] as Array<{ cmd: string; args: string[] }>,
    },
  };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, default: { ...actual, homedir: () => h.home }, homedir: () => h.home };
});
vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[]) => {
    h.state.spawns.push({ cmd, args });
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: (sig?: string) => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      if (h.state.killThrows) throw new Error("already exited");
    };
    if (h.state.spawnMode === "close") {
      queueMicrotask(() => {
        if (h.state.loginOutput) {
          child.stdout.emit("data", Buffer.from(h.state.loginOutput));
        }
        if (h.state.loginStderr) {
          child.stderr.emit("data", Buffer.from(h.state.loginStderr));
        }
        child.emit("close", 0);
      });
    } else if (h.state.spawnMode === "error") {
      queueMicrotask(() => child.emit("error", new Error("spawn ENOENT")));
    }
    // "hang": emit nothing — the 3s guard timer must resolve it.
    return child;
  },
}));

import {
  normalizeCodexRateLimits,
  parseCodexLoginStatus,
  readHarnessUsage,
  refreshHarnessUsage,
} from "@/server/harness-usage";

const codexDir = join(h.home, ".codex");
const claudeDir = join(h.home, ".claude");
const authPath = join(codexDir, "auth.json");
const statsPath = join(claudeDir, "stats-cache.json");
const today = () => new Date().toISOString().slice(0, 10);

function writeAuth(auth: unknown): void {
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(authPath, JSON.stringify(auth), "utf8");
}

function writeStats(stats: unknown): void {
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    statsPath,
    typeof stats === "string" ? stats : JSON.stringify(stats),
    "utf8",
  );
}

/** Base64url-encode JWT claims into a decodable fake id_token. */
function fakeIdToken(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `hdr.${body}.sig`;
}

beforeEach(() => {
  rmSync(codexDir, { recursive: true, force: true });
  rmSync(claudeDir, { recursive: true, force: true });
  h.state.loginOutput = "Logged in using ChatGPT\n";
  h.state.loginStderr = "";
  h.state.spawnMode = "close";
  h.state.killThrows = false;
  h.state.spawns = [];
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("claude-code-local usage", () => {
  it("reports zeros + stale when stats-cache.json doesn't exist", async () => {
    await expect(refreshHarnessUsage("claude-code-local")).resolves.toEqual({
      kind: "claude-code",
      messagesToday: 0,
      sessionsToday: 0,
      tokensToday: 0,
      stale: true,
      lastComputedDate: null,
    });
  });

  it("rolls up today's messages, sessions, and tokens across models", async () => {
    writeStats({
      dailyActivity: [
        { date: "2020-01-01", messageCount: 999, sessionCount: 99 },
        { date: today(), messageCount: 12, sessionCount: 3 },
      ],
      dailyModelTokens: [
        {
          date: today(),
          tokensByModel: { "claude-fable-5": 1000, "claude-haiku": 250, bogus: "x" },
        },
      ],
      lastComputedDate: today(),
    });
    await expect(refreshHarnessUsage("claude-code-local")).resolves.toEqual({
      kind: "claude-code",
      messagesToday: 12,
      sessionsToday: 3,
      tokensToday: 1250,
      stale: false,
      lastComputedDate: today(),
    });
  });

  it("flags a snapshot last computed on an earlier day as stale", async () => {
    writeStats({
      dailyActivity: [],
      lastComputedDate: "2020-01-01",
    });
    await expect(refreshHarnessUsage("claude-code-local")).resolves.toMatchObject({
      stale: true,
      lastComputedDate: "2020-01-01",
      messagesToday: 0,
      tokensToday: 0,
    });
  });

  it("collapses malformed JSON to the unknown shape", async () => {
    writeStats("{not json");
    await expect(refreshHarnessUsage("claude-code-local")).resolves.toEqual({
      kind: "unknown",
    });
  });

  it("serves from the 60s cache until refreshed", async () => {
    writeStats({ dailyActivity: [], lastComputedDate: today() });
    const first = await refreshHarnessUsage("claude-code-local");
    // Mutate the file — a cached read must not see it.
    writeStats({
      dailyActivity: [{ date: today(), messageCount: 5, sessionCount: 1 }],
      lastComputedDate: today(),
    });
    await expect(readHarnessUsage("claude-code-local")).resolves.toBe(first);
    // refresh drops the cache entry.
    await expect(refreshHarnessUsage("claude-code-local")).resolves.toMatchObject({
      messagesToday: 5,
    });
  });
});

describe("codex-local usage", () => {
  it("reports login status with no rate limits when auth.json is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(refreshHarnessUsage("codex-local")).resolves.toEqual({
      kind: "codex",
      auth: "chatgpt",
      plan: null,
      email: null,
      rateLimits: [],
    });
    expect(h.state.spawns[0]!.args).toEqual(["login", "status"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("infers auth from auth.json when the CLI's answer is unrecognized", async () => {
    h.state.loginOutput = "codex 0.99 — usage: codex [options]\n";
    writeAuth({ auth_mode: "apikey", tokens: { access_token: "tok" } });
    const fetchSpy = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(refreshHarnessUsage("codex-local")).resolves.toMatchObject({
      kind: "codex",
      auth: "api-key",
    });
  });

  it("stops at auth status when there's no access token", async () => {
    h.state.loginOutput = "Not logged in\n";
    writeAuth({ tokens: {} });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(refreshHarnessUsage("codex-local")).resolves.toEqual({
      kind: "codex",
      auth: "signed-out",
      plan: null,
      email: null,
      rateLimits: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("combines JWT identity with live wham/usage windows", async () => {
    writeAuth({
      tokens: {
        access_token: "tok-123",
        account_id: "acct-9",
        id_token: fakeIdToken({
          email: "me@example.com",
          "https://api.openai.com/auth": {
            chatgpt_account_id: "acct-from-jwt",
            chatgpt_plan_type: "plus",
          },
        }),
      },
    });
    const fetchSpy = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      expect(url).toBe("https://chatgpt.com/backend-api/wham/usage");
      expect(init.headers.Authorization).toBe("Bearer tok-123");
      // Explicit account_id wins over the JWT-derived one.
      expect(init.headers["ChatGPT-Account-Id"]).toBe("acct-9");
      return {
        ok: true,
        json: async () => ({
          plan_type: "pro",
          rate_limit: {
            primary_window: {
              used_percent: 12,
              limit_window_seconds: 604_800,
              reset_at: 1_800_000_000,
            },
            secondary_window: {
              used_percent: 44,
              limit_window_seconds: 18_000,
              reset_at: 1_790_000_000,
            },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(refreshHarnessUsage("codex-local")).resolves.toEqual({
      kind: "codex",
      auth: "chatgpt",
      plan: "pro",
      email: "me@example.com",
      rateLimits: [
        {
          label: "5-hour",
          used_percent: 44,
          limit_window_seconds: 18_000,
          reset_at: 1_790_000_000,
        },
        {
          label: "Weekly",
          used_percent: 12,
          limit_window_seconds: 604_800,
          reset_at: 1_800_000_000,
        },
      ],
    });
  });

  it("keeps the JWT plan when the usage endpoint is unreachable", async () => {
    writeAuth({
      tokens: {
        access_token: "tok-123",
        id_token: fakeIdToken({
          email: "me@example.com",
          "https://api.openai.com/auth": {
            chatgpt_account_id: "acct-from-jwt",
            chatgpt_plan_type: "plus",
          },
        }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(refreshHarnessUsage("codex-local")).resolves.toEqual({
      kind: "codex",
      auth: "chatgpt",
      plan: "plus",
      email: "me@example.com",
      rateLimits: [],
    });
  });

  it("tolerates a malformed id_token", async () => {
    writeAuth({ tokens: { access_token: "tok", id_token: "only-one-part" } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(refreshHarnessUsage("codex-local")).resolves.toMatchObject({
      email: null,
      plan: null,
    });
  });

  it("reads stderr and error events from the login-status child", async () => {
    h.state.loginOutput = "";
    h.state.loginStderr = "Logged in using agent identity\n";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(refreshHarnessUsage("codex-local")).resolves.toMatchObject({
      auth: "agent-identity",
    });

    h.state.spawnMode = "error";
    await expect(refreshHarnessUsage("codex-local")).resolves.toMatchObject({
      auth: "unknown",
    });
  });

  it("times out a wedged codex CLI instead of hanging the sidebar", async () => {
    vi.useFakeTimers();
    h.state.spawnMode = "hang";
    h.state.killThrows = true; // kill() on an exited child must be swallowed
    const pending = refreshHarnessUsage("codex-local");
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toMatchObject({ kind: "codex", auth: "unknown" });
  });

  it("returns unknown for an unrecognized adapter id", async () => {
    await expect(
      refreshHarnessUsage("bogus-adapter" as never),
    ).resolves.toEqual({ kind: "unknown" });
  });
});

describe("normalizeCodexRateLimits labels", () => {
  const window = (limit_window_seconds: number) => ({
    used_percent: 1,
    limit_window_seconds,
    reset_at: 1,
  });

  it("labels known and derived window durations", () => {
    expect(
      normalizeCodexRateLimits({ primary_window: window(86_400) })[0]!.label,
    ).toBe("Daily");
    expect(
      normalizeCodexRateLimits({ primary_window: window(172_800) })[0]!.label,
    ).toBe("2-day");
    expect(
      normalizeCodexRateLimits({ primary_window: window(7_200) })[0]!.label,
    ).toBe("2-hour");
    expect(
      normalizeCodexRateLimits({ primary_window: window(1_234) })[0]!.label,
    ).toBe("Usage");
  });

  it("filters malformed windows and handles a missing rate_limit block", () => {
    expect(normalizeCodexRateLimits(undefined)).toEqual([]);
    expect(normalizeCodexRateLimits(null)).toEqual([]);
    expect(
      normalizeCodexRateLimits({
        primary_window: { used_percent: 5 } as never,
        secondary_window: window(18_000),
      }),
    ).toEqual([{ ...window(18_000), label: "5-hour" }]);
  });
});

describe("parseCodexLoginStatus", () => {
  it("recognizes agent identity and falls back to unknown", () => {
    expect(parseCodexLoginStatus("Logged in using agent identity\n")).toBe(
      "agent-identity",
    );
    expect(parseCodexLoginStatus("something else entirely")).toBe("unknown");
  });
});
