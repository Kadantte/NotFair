import { describe, expect, it } from "vitest";

import { listClaudeCodeModels } from "./models";

describe("listClaudeCodeModels", () => {
  it("returns the stable CLI alias tiers with documented context windows", async () => {
    const models = await listClaudeCodeModels();
    expect(models.map((m) => m.value)).toEqual(["fable", "opus", "sonnet", "haiku"]);
    for (const model of models) {
      expect(model.label.length).toBeGreaterThan(0);
      expect(model.context_window).toBe(200_000);
    }
    // No alias is marked default — omitting the flag is the CLI's own choice.
    expect(models.some((m) => m.is_default)).toBe(false);
  });
});
