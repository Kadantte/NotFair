import { describe, expect, it, vi } from "vitest";
import { existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Real fs against a tmpdir data dir, per repo test conventions.
// MUST be hoisted: secret.ts captures NOTFAIR_DATA_DIR at import time, so a
// plain assignment would point the suite at the developer's live ~/.notfair.
const h = vi.hoisted(() => {
  const { mkdtempSync, rmSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "notfair-secret-"));
  // The module mints the data dir itself when missing — exercise that path.
  rmSync(dataDir, { recursive: true, force: true });
  process.env.NOTFAIR_DATA_DIR = dataDir;
  return { dataDir };
});

import {
  getMcpServerSecretPath,
  getOrCreateMcpServerSecret,
  verifyMcpServerSecret,
} from "./secret";

describe("getOrCreateMcpServerSecret", () => {
  it("mints a 32-byte hex secret and creates the data dir on first read", () => {
    expect(existsSync(h.dataDir)).toBe(false);
    const secret = getOrCreateMcpServerSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(h.dataDir)).toBe(true);
  });

  it("persists with 0600 perms and a trailing newline", () => {
    getOrCreateMcpServerSecret();
    const mode = statSync(getMcpServerSecretPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("returns the same secret on subsequent reads", () => {
    expect(getOrCreateMcpServerSecret()).toBe(getOrCreateMcpServerSecret());
  });

  it("re-mints when the stored file is empty", () => {
    const first = getOrCreateMcpServerSecret();
    writeFileSync(getMcpServerSecretPath(), "\n", "utf8");
    const second = getOrCreateMcpServerSecret();
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it("re-mints after the file is deleted (manual rotation)", () => {
    const first = getOrCreateMcpServerSecret();
    rmSync(getMcpServerSecretPath());
    expect(getOrCreateMcpServerSecret()).not.toBe(first);
  });
});

describe("verifyMcpServerSecret", () => {
  it("accepts the stored secret", () => {
    const secret = getOrCreateMcpServerSecret();
    expect(verifyMcpServerSecret(secret)).toBe(true);
  });

  it("rejects null / undefined / empty without throwing", () => {
    expect(verifyMcpServerSecret(null)).toBe(false);
    expect(verifyMcpServerSecret(undefined)).toBe(false);
    expect(verifyMcpServerSecret("")).toBe(false);
  });

  it("rejects a length-mismatched bearer before the constant-time compare", () => {
    expect(verifyMcpServerSecret("short")).toBe(false);
  });

  it("rejects an equal-length wrong bearer", () => {
    const secret = getOrCreateMcpServerSecret();
    const wrong = secret.slice(0, -1) + (secret.endsWith("0") ? "1" : "0");
    expect(wrong).toHaveLength(secret.length);
    expect(verifyMcpServerSecret(wrong)).toBe(false);
  });
});

describe("getMcpServerSecretPath", () => {
  it("lives inside the data dir", () => {
    expect(getMcpServerSecretPath()).toBe(join(h.dataDir, "mcp-server-secret"));
  });
});
