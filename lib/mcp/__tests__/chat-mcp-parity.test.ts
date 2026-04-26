/**
 * Chat ↔ MCP tool parity guard.
 *
 * The chat agent (lib/agents/google-ads-agent.ts) derives its tools from
 * `collectAdsTools` — the assumption being that every MCP tool the model
 * could call from a Claude/Codex client is also available inside the
 * in-app /chat. This used to silently drift: `runScript` shipped to MCP
 * via `registerCodeModeTools` but was never added to `collectAdsTools`,
 * so chat lost access to any read path the trimmed point-query tools
 * couldn't cover.
 *
 * This test asserts every MCP-registered tool is also collected for chat,
 * with a small allow-list of intentional MCP-only tools (e.g.
 * `listConnectedAccounts` is meaningless for single-account chat).
 */

import { describe, it, expect } from "vitest";
import type { AuthContext } from "@/lib/google-ads";
import { registerReadTools } from "../read-tools";
import { registerWriteTools } from "../write-tools";
import { registerCodeModeTools } from "../code-mode";
import { collectAdsTools } from "../collect";

const fakeAuth = (): AuthContext => ({
  refreshToken: "rt",
  customerId: "1234567890",
  customerIds: [{ id: "1234567890", name: "Test" }],
  userId: "user",
  loginCustomerId: null,
  clientName: "test",
  clientVersion: "0.0.0",
  authMethod: "direct",
  userAgent: "vitest",
  sessionId: null,
});

/** Tools the MCP server registers but chat intentionally omits. */
const CHAT_OMISSIONS = new Set<string>([
  // Chat is single-account; the agent already has the customerId in context.
  "listConnectedAccounts",
]);

describe("chat ↔ MCP tool parity", () => {
  it("collectAdsTools exposes every registrar the MCP route uses (minus the chat omissions)", () => {
    // Mirror app/api/[transport]/route.ts — every registrar invoked there
    // must either be in collectAdsTools or be in CHAT_OMISSIONS.
    const mcpNames = new Set<string>();
    const fakeServer = {
      registerTool: (name: string) => {
        mcpNames.add(name);
        return undefined;
      },
    } as unknown as Parameters<typeof registerReadTools>[0];

    registerReadTools(fakeServer, fakeAuth);
    registerWriteTools(fakeServer, fakeAuth);
    registerCodeModeTools(fakeServer, fakeAuth);

    const chatNames = new Set(collectAdsTools(fakeAuth).map((t) => t.name));

    const missingFromChat = [...mcpNames].filter(
      (name) => !chatNames.has(name) && !CHAT_OMISSIONS.has(name),
    );
    expect(missingFromChat).toEqual([]);
  });

  it("collectAdsTools includes runScript", () => {
    const names = collectAdsTools(fakeAuth).map((t) => t.name);
    expect(names).toContain("runScript");
  });
});
