import { describe, expect, it } from "vitest";

import { clientNameFromUserAgent, normalizeClientName } from "@/lib/mcp/client-info";

describe("clientNameFromUserAgent", () => {
  it.each([
    ["claude-code/2.1.140 (sdk-cli)", "claude-code"],
    ["claude-code/2.1.138 (claude-desktop, agent-sdk/0.2.138)", "claude-code"],
    ["Claude-User", "claude-ai"],
    ["Anthropic/Toolbox", "anthropic/toolbox"],
    ["Mozilla/5.0", null],
    [null, null],
  ])("maps %s to %s", (userAgent, expected) => {
    expect(clientNameFromUserAgent(userAgent)).toBe(expected);
  });
});

describe("normalizeClientName", () => {
  it("uses user-agent to recover Claude Code behind mcp-remote fallback", () => {
    expect(normalizeClientName("mcp-remote-fallback-test", "oauth", "claude-code/2.1.140")).toBe("claude-code");
  });
});
