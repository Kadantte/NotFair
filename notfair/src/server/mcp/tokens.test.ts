import { beforeAll, describe, expect, it, vi } from "vitest";

// Real better-sqlite3 against a tmpdir DB, per repo test conventions.
// MUST be hoisted: static imports evaluate before module-level statements,
// and db.ts captures NOTFAIR_DATA_DIR at import time — a plain assignment
// here would silently point the suite at the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-tokens-"));
});

import { getDb } from "@/server/db/db";
import {
  deleteMcpToken,
  deleteProjectMcpTokens,
  findMcpToken,
  getMcpToken,
  listProjectMcpTokens,
  updateMcpTokenSecrets,
  upsertMcpToken,
} from "./tokens";

// mcp_tokens.project_slug FKs to projects(slug); seed the parent rows the
// cases reference before any upsert runs.
beforeAll(() => {
  const db = getDb();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES (?, ?, ?, ?, 'claude-code-local')",
  );
  for (const slug of [
    "proj-a", "proj-b", "proj-c", "proj-d", "proj-e",
    "proj-f", "proj-g", "proj-h", "proj-i",
  ]) {
    insert.run(slug, slug, slug, new Date().toISOString());
  }
});

describe("upsertMcpToken", () => {
  it("inserts a new row with defaults applied", () => {
    const token = upsertMcpToken({
      project_slug: "proj-a",
      server_name: "notfair-googleads",
      access_token: "at-1",
    });
    expect(token.id).toBeTruthy();
    expect(token.account_label).toBe("");
    expect(token.access_token_enc).toBe("at-1");
    expect(token.refresh_token_enc).toBeNull();
    expect(token.expires_at).toBeNull();
    expect(token.scope).toBeNull();
    expect(token.metadata_json).toBeNull();
    expect(token.token_endpoint).toBeNull();
    expect(token.client_id).toBeNull();
    expect(token.client_secret).toBeNull();

    // Round-trips through the DB identically.
    expect(getMcpToken(token.id)).toEqual(token);
  });

  it("updates in place on (project_slug, server_name, account_label) collision", () => {
    const first = upsertMcpToken({
      project_slug: "proj-b",
      server_name: "notfair-metaads",
      access_token: "old",
      refresh_token: "old-rt",
    });
    const second = upsertMcpToken({
      project_slug: "proj-b",
      server_name: "notfair-metaads",
      access_token: "new",
      expires_at: "2027-01-01T00:00:00.000Z",
      scope: "ads.read",
      metadata: { account: "123" },
      token_endpoint: "https://oauth.example.com/token",
      client_id: "cid",
      client_secret: "csec",
    });
    expect(second.id).toBe(first.id);
    expect(second.access_token_enc).toBe("new");
    // Update overwrites every secret column — omitted refresh_token becomes null.
    expect(second.refresh_token_enc).toBeNull();
    expect(second.expires_at).toBe("2027-01-01T00:00:00.000Z");
    expect(second.scope).toBe("ads.read");
    expect(second.metadata_json).toBe(JSON.stringify({ account: "123" }));
    expect(second.token_endpoint).toBe("https://oauth.example.com/token");
    expect(second.client_id).toBe("cid");
    expect(second.client_secret).toBe("csec");
    expect(listProjectMcpTokens("proj-b")).toHaveLength(1);
  });

  it("treats different account_labels as distinct rows", () => {
    upsertMcpToken({
      project_slug: "proj-c",
      server_name: "notfair-googleads",
      account_label: "acct-1",
      access_token: "a",
    });
    upsertMcpToken({
      project_slug: "proj-c",
      server_name: "notfair-googleads",
      account_label: "acct-2",
      access_token: "b",
    });
    expect(listProjectMcpTokens("proj-c")).toHaveLength(2);
  });
});

describe("updateMcpTokenSecrets", () => {
  it("rotates the access token and keeps the refresh token via COALESCE", () => {
    const token = upsertMcpToken({
      project_slug: "proj-d",
      server_name: "srv",
      access_token: "at",
      refresh_token: "rt-keep",
      expires_at: "2026-01-01T00:00:00.000Z",
    });
    const updated = updateMcpTokenSecrets(token.id, {
      access_token: "at-2",
      refresh_token: null,
      expires_at: "2026-02-01T00:00:00.000Z",
    });
    expect(updated).not.toBeNull();
    expect(updated!.access_token_enc).toBe("at-2");
    expect(updated!.refresh_token_enc).toBe("rt-keep");
    expect(updated!.expires_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("replaces the refresh token when the provider rotates it", () => {
    const token = upsertMcpToken({
      project_slug: "proj-d",
      server_name: "srv-rotate",
      access_token: "at",
      refresh_token: "rt-old",
    });
    const updated = updateMcpTokenSecrets(token.id, {
      access_token: "at-2",
      refresh_token: "rt-new",
    });
    expect(updated!.refresh_token_enc).toBe("rt-new");
    // Omitted expires_at nulls the column.
    expect(updated!.expires_at).toBeNull();
  });

  it("returns null when the row was deleted mid-refresh", () => {
    expect(
      updateMcpTokenSecrets("nope", { access_token: "x" }),
    ).toBeNull();
  });
});

describe("lookups and deletes", () => {
  it("getMcpToken returns null for unknown id", () => {
    expect(getMcpToken("missing")).toBeNull();
  });

  it("findMcpToken matches (project, server, label) and defaults label to ''", () => {
    const token = upsertMcpToken({
      project_slug: "proj-e",
      server_name: "srv",
      access_token: "at",
    });
    expect(findMcpToken("proj-e", "srv")).toEqual(token);
    expect(findMcpToken("proj-e", "srv", "other-label")).toBeNull();
    expect(findMcpToken("other-proj", "srv")).toBeNull();
  });

  it("listProjectMcpTokens orders by server_name then account_label", () => {
    upsertMcpToken({ project_slug: "proj-f", server_name: "zeta", access_token: "1" });
    upsertMcpToken({
      project_slug: "proj-f",
      server_name: "alpha",
      account_label: "b",
      access_token: "2",
    });
    upsertMcpToken({
      project_slug: "proj-f",
      server_name: "alpha",
      account_label: "a",
      access_token: "3",
    });
    const rows = listProjectMcpTokens("proj-f");
    expect(rows.map((r) => [r.server_name, r.account_label])).toEqual([
      ["alpha", "a"],
      ["alpha", "b"],
      ["zeta", ""],
    ]);
  });

  it("deleteMcpToken removes one row", () => {
    const token = upsertMcpToken({
      project_slug: "proj-g",
      server_name: "srv",
      access_token: "at",
    });
    deleteMcpToken(token.id);
    expect(getMcpToken(token.id)).toBeNull();
  });

  it("deleteProjectMcpTokens clears the whole project without touching others", () => {
    upsertMcpToken({ project_slug: "proj-h", server_name: "one", access_token: "1" });
    upsertMcpToken({ project_slug: "proj-h", server_name: "two", access_token: "2" });
    const other = upsertMcpToken({
      project_slug: "proj-i",
      server_name: "one",
      access_token: "3",
    });
    deleteProjectMcpTokens("proj-h");
    expect(listProjectMcpTokens("proj-h")).toEqual([]);
    expect(getMcpToken(other.id)).toEqual(other);
  });
});
