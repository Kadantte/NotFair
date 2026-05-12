import { describe, expect, it } from "vitest";

import {
  isChatTabVisibleForVariant,
  normalizeChatTabExperimentVariant,
} from "@/lib/chat-tab-experiment";

describe("chat tab experiment", () => {
  it.each([
    ["show_chat", "show_chat"],
    ["visible", "show_chat"],
    ["test", "show_chat"],
    [true, "show_chat"],
    ["hide_chat", "hide_chat"],
    ["hidden", "hide_chat"],
    ["control", "hide_chat"],
    [false, "hide_chat"],
    [undefined, "unassigned"],
    ["unknown", "unassigned"],
  ] as const)("normalizes %p to %s", (input, expected) => {
    expect(normalizeChatTabExperimentVariant(input)).toBe(expected);
  });

  it("fails open unless PostHog explicitly assigns the hide cohort", () => {
    expect(isChatTabVisibleForVariant(undefined)).toBe(true);
    expect(isChatTabVisibleForVariant("show_chat")).toBe(true);
    expect(isChatTabVisibleForVariant("hide_chat")).toBe(false);
  });
});
