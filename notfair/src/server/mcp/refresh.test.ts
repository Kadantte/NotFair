import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-refresh-"));
});

import { getDb } from "@/server/db/db";
import { isExpiringSoon, refreshMcpToken } from "./refresh";
import { getMcpToken, upsertMcpToken, type McpToken } from "./tokens";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // mcp_tokens.project_slug FKs to projects(slug).
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES ('proj', 'proj', 'proj', ?, 'claude-code-local')",
    )
    .run(new Date().toISOString());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let counter = 0;
function makeToken(overrides: Partial<Parameters<typeof upsertMcpToken>[0]> = {}): McpToken {
  return upsertMcpToken({
    project_slug: "proj",
    server_name: `srv-${++counter}`,
    access_token: "old-at",
    refresh_token: "rt-1",
    token_endpoint: "https://oauth.example.com/token",
    client_id: "cid",
    ...overrides,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("refreshMcpToken", () => {
  it("returns null without fetching when refresh fields are missing", async () => {
    const noRefresh = makeToken({ refresh_token: undefined });
    const noEndpoint = makeToken({ token_endpoint: undefined });
    const noClient = makeToken({ client_id: undefined });
    expect(await refreshMcpToken(noRefresh)).toBeNull();
    expect(await refreshMcpToken(noEndpoint)).toBeNull();
    expect(await refreshMcpToken(noClient)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a urlencoded refresh_token grant and persists the rotated pair", async () => {
    const token = makeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "new-at", refresh_token: "rt-2", expires_in: 3600 }),
    );

    const before = Date.now();
    const refreshed = await refreshMcpToken(token);
    const after = Date.now();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://oauth.example.com/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const params = new URLSearchParams(init.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt-1");
    expect(params.get("client_id")).toBe("cid");
    expect(params.get("client_secret")).toBeNull();

    expect(refreshed).not.toBeNull();
    expect(refreshed!.access_token_enc).toBe("new-at");
    expect(refreshed!.refresh_token_enc).toBe("rt-2");
    const expiresMs = Date.parse(refreshed!.expires_at!);
    expect(expiresMs).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 3600 * 1000);

    // Persisted, not just returned.
    expect(getMcpToken(token.id)!.access_token_enc).toBe("new-at");
  });

  it("includes client_secret when stored", async () => {
    const token = makeToken({ client_secret: "shh" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "new-at" }));
    await refreshMcpToken(token);
    const params = new URLSearchParams(fetchMock.mock.calls[0]![1].body as string);
    expect(params.get("client_secret")).toBe("shh");
  });

  it("keeps the existing refresh token when the response omits one", async () => {
    const token = makeToken();
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "new-at" }));
    const refreshed = await refreshMcpToken(token);
    expect(refreshed!.refresh_token_enc).toBe("rt-1");
    expect(refreshed!.expires_at).toBeNull();
  });

  it("returns null and leaves the row alone on network error", async () => {
    const token = makeToken();
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await refreshMcpToken(token)).toBeNull();
    expect(getMcpToken(token.id)!.access_token_enc).toBe("old-at");
  });

  it("returns null on a non-2xx response", async () => {
    const token = makeToken();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, 400));
    expect(await refreshMcpToken(token)).toBeNull();
    expect(getMcpToken(token.id)!.access_token_enc).toBe("old-at");
  });

  it("returns null on a non-JSON body", async () => {
    const token = makeToken();
    fetchMock.mockResolvedValueOnce(new Response("<html>oops</html>", { status: 200 }));
    expect(await refreshMcpToken(token)).toBeNull();
  });

  it("returns null when the response has no access_token", async () => {
    const token = makeToken();
    fetchMock.mockResolvedValueOnce(jsonResponse({ token_type: "Bearer" }));
    expect(await refreshMcpToken(token)).toBeNull();
  });
});

describe("isExpiringSoon", () => {
  function tokenWithExpiry(expires_at: string | null): McpToken {
    return { expires_at } as McpToken;
  }

  it("false when expires_at is missing (legacy rows)", () => {
    expect(isExpiringSoon(tokenWithExpiry(null))).toBe(false);
  });

  it("false when expires_at is unparseable", () => {
    expect(isExpiringSoon(tokenWithExpiry("not-a-date"))).toBe(false);
  });

  it("true when already expired", () => {
    expect(
      isExpiringSoon(tokenWithExpiry(new Date(Date.now() - 1000).toISOString())),
    ).toBe(true);
  });

  it("true inside the skew window, false outside it", () => {
    const in30s = new Date(Date.now() + 30_000).toISOString();
    const in10m = new Date(Date.now() + 600_000).toISOString();
    expect(isExpiringSoon(tokenWithExpiry(in30s))).toBe(true);
    expect(isExpiringSoon(tokenWithExpiry(in10m))).toBe(false);
    // Custom skew widens the window.
    expect(isExpiringSoon(tokenWithExpiry(in10m), 700_000)).toBe(true);
  });
});
