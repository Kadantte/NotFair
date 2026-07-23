import { beforeAll, describe, expect, it, vi } from "vitest";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-db-umcp-"));
});

import { getDb } from "@/server/db/db";
import {
  deleteUserMcpServer,
  findUserMcpServer,
  findUserMcpServerByResourceUrl,
  insertUserMcpServer,
  listUserMcpServers,
} from "./user-mcp-servers";

const SLUG = "proj";

beforeAll(() => {
  getDb()
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES ('p1', ?, 'Proj', ?, 'claude-code-local')",
    )
    .run(SLUG, new Date().toISOString());
});

describe("insertUserMcpServer / findUserMcpServer", () => {
  it("inserts a row and reads it back by key", () => {
    const row = insertUserMcpServer({
      project_slug: SLUG,
      key: "acme",
      display_name: "Acme MCP",
      resource_url: "https://mcp.acme.dev/sse",
      discovery_url:
        "https://mcp.acme.dev/.well-known/oauth-protected-resource/sse",
    });
    expect(row.id).toBeTruthy();
    expect(row.description).toBe(""); // defaulted when omitted

    const found = findUserMcpServer(SLUG, "acme");
    expect(found).toMatchObject({
      project_slug: SLUG,
      key: "acme",
      display_name: "Acme MCP",
      description: "",
      resource_url: "https://mcp.acme.dev/sse",
    });
  });

  it("returns null for a missing key or wrong project", () => {
    expect(findUserMcpServer(SLUG, "nope")).toBeNull();
    expect(findUserMcpServer("other-proj", "acme")).toBeNull();
  });
});

describe("findUserMcpServerByResourceUrl", () => {
  it("matches regardless of trailing slash, host case, and default port", () => {
    for (const candidate of [
      "https://mcp.acme.dev/sse/",
      "https://MCP.ACME.DEV/sse",
      "https://mcp.acme.dev:443/sse",
    ]) {
      expect(findUserMcpServerByResourceUrl(SLUG, candidate)?.key).toBe("acme");
    }
  });

  it("returns null when no row matches", () => {
    expect(
      findUserMcpServerByResourceUrl(SLUG, "https://mcp.other.dev/sse"),
    ).toBeNull();
    // Path is case-sensitive by design.
    expect(
      findUserMcpServerByResourceUrl(SLUG, "https://mcp.acme.dev/SSE"),
    ).toBeNull();
  });

  it("falls back to a lowercased string compare for unparseable URLs", () => {
    insertUserMcpServer({
      project_slug: SLUG,
      key: "weird",
      display_name: "Weird",
      resource_url: "not a url",
      discovery_url: "also not a url",
    });
    expect(findUserMcpServerByResourceUrl(SLUG, "  NOT A URL/ ")?.key).toBe(
      "weird",
    );
  });
});

describe("listUserMcpServers / deleteUserMcpServer", () => {
  it("lists rows oldest-first and scopes to the project", () => {
    // Force distinct created_at values so ORDER BY created_at is decisive.
    getDb()
      .prepare("UPDATE user_mcp_servers SET created_at = ? WHERE key = 'acme'")
      .run("2026-01-01T00:00:00.000Z");
    getDb()
      .prepare("UPDATE user_mcp_servers SET created_at = ? WHERE key = 'weird'")
      .run("2026-01-02T00:00:00.000Z");
    expect(listUserMcpServers(SLUG).map((r) => r.key)).toEqual([
      "acme",
      "weird",
    ]);
    expect(listUserMcpServers("other-proj")).toEqual([]);
  });

  it("deletes only the (project, key) pair", () => {
    deleteUserMcpServer("other-proj", "acme"); // wrong project: no-op
    expect(findUserMcpServer(SLUG, "acme")).not.toBeNull();
    deleteUserMcpServer(SLUG, "acme");
    expect(findUserMcpServer(SLUG, "acme")).toBeNull();
    expect(listUserMcpServers(SLUG).map((r) => r.key)).toEqual(["weird"]);
  });
});
