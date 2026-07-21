import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listCodexModels } from "./models";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "notfair-codex-models-more-"));
}

describe("listCodexModels — cache handling", () => {
  it("falls back to the static list (first marked default) when the cache is missing", async () => {
    const dir = await tmp();
    const models = await listCodexModels(
      join(dir, "no-cache.json"),
      join(dir, "no-config.toml"),
    );
    expect(models).toEqual([
      { value: "gpt-5.5", label: "GPT-5.5", is_default: true },
      { value: "gpt-5.4", label: "GPT-5.4" },
    ]);
  });

  it("falls back when the cache holds an empty model list", async () => {
    const dir = await tmp();
    const cacheFile = join(dir, "models_cache.json");
    await writeFile(cacheFile, JSON.stringify({ models: [] }), "utf8");
    const models = await listCodexModels(cacheFile, join(dir, "no-config.toml"));
    expect(models.map((m) => m.value)).toEqual(["gpt-5.5", "gpt-5.4"]);
  });

  it("filters hidden models, sorts by priority, and carries context windows", async () => {
    const dir = await tmp();
    const cacheFile = join(dir, "models_cache.json");
    await writeFile(
      cacheFile,
      JSON.stringify({
        models: [
          { slug: "internal", display_name: "Internal", visibility: "hide", priority: 0 },
          { slug: "no-priority", display_name: "No Priority" },
          { slug: "second", display_name: "Second", priority: 2, context_window: 0 },
          { slug: "first", display_name: "First", priority: 1, context_window: 272_000 },
          { slug: "", display_name: "Empty slug", priority: 0 },
        ],
      }),
      "utf8",
    );

    const models = await listCodexModels(cacheFile, join(dir, "no-config.toml"));
    expect(models.map((m) => m.value)).toEqual(["first", "second", "no-priority"]);
    expect(models[0]).toMatchObject({
      label: "First",
      context_window: 272_000,
      is_default: true,
    });
    // context_window omitted when non-positive or absent.
    expect(models[1]!.context_window).toBeUndefined();
  });

  it("labels a model by its slug when display_name is missing", async () => {
    const dir = await tmp();
    const cacheFile = join(dir, "models_cache.json");
    await writeFile(
      cacheFile,
      JSON.stringify({ models: [{ slug: "gpt-raw", priority: 1 }] }),
      "utf8",
    );
    const models = await listCodexModels(cacheFile, join(dir, "no-config.toml"));
    expect(models[0]).toMatchObject({ value: "gpt-raw", label: "gpt-raw" });
  });
});

describe("listCodexModels — configured default parsing", () => {
  async function withConfig(config: string) {
    const dir = await tmp();
    const configFile = join(dir, "config.toml");
    const cacheFile = join(dir, "models_cache.json");
    await Promise.all([
      writeFile(configFile, config, "utf8"),
      writeFile(
        cacheFile,
        JSON.stringify({
          models: [
            { slug: "gpt-5.5", display_name: "GPT-5.5", priority: 1 },
            { slug: "gpt-5.4", display_name: "GPT-5.4", priority: 2 },
          ],
        }),
        "utf8",
      ),
    ]);
    return listCodexModels(cacheFile, configFile);
  }

  it("parses a single-quoted model value", async () => {
    const models = await withConfig("model = 'gpt-5.4'\n");
    expect(models.find((m) => m.is_default)?.value).toBe("gpt-5.4");
  });

  it("parses a bare model value with a trailing comment", async () => {
    const models = await withConfig("model = gpt-5.4 # pinned\n");
    expect(models.find((m) => m.is_default)?.value).toBe("gpt-5.4");
  });

  it("ignores model keys nested under a profile table", async () => {
    const models = await withConfig('[profiles.fast]\nmodel = "gpt-5.4"\n');
    // No root-level model → first cache entry is the effective default.
    expect(models.find((m) => m.is_default)?.value).toBe("gpt-5.5");
  });
});
