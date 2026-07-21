import { describe, expect, it, vi } from "vitest";

// The adapter modules pull in @/server/mcp-server/secret and @/server/db/db,
// which capture NOTFAIR_DATA_DIR at import time — hoist the override so
// nothing ever resolves to the developer's live ~/.notfair.
vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  process.env.NOTFAIR_DATA_DIR = mkdtempSync(join(tmpdir(), "notfair-registry-"));
});

import {
  DEFAULT_HARNESS_ADAPTER,
  getAdapter,
  isHarnessAdapterId,
  listAdapters,
  requireAdapter,
} from "./registry";

describe("adapter registry", () => {
  it("resolves both built-in adapters by id", () => {
    expect(getAdapter("claude-code-local")?.id).toBe("claude-code-local");
    expect(getAdapter("codex-local")?.id).toBe("codex-local");
  });

  it("returns null from getAdapter for an unknown id", () => {
    expect(getAdapter("nope" as never)).toBeNull();
  });

  it("requireAdapter returns the adapter or throws with the id in the message", () => {
    expect(requireAdapter("codex-local").id).toBe("codex-local");
    expect(() => requireAdapter("nope" as never)).toThrow(
      "Unknown harness adapter: nope",
    );
  });

  it("lists exactly the built-ins", () => {
    expect(listAdapters().map((a) => a.id).sort()).toEqual([
      "claude-code-local",
      "codex-local",
    ]);
  });

  it("defaults to claude-code-local", () => {
    expect(DEFAULT_HARNESS_ADAPTER).toBe("claude-code-local");
  });

  it("isHarnessAdapterId accepts only known ids", () => {
    expect(isHarnessAdapterId("claude-code-local")).toBe(true);
    expect(isHarnessAdapterId("codex-local")).toBe(true);
    expect(isHarnessAdapterId("gemini-local")).toBe(false);
    expect(isHarnessAdapterId(undefined)).toBe(false);
    expect(isHarnessAdapterId(42)).toBe(false);
  });
});
