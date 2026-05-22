import { describe, expect, it } from "vitest";
import { isSchemaRequest } from "./response-utils";

function mcpRequest(method: string): Request {
  return new Request("https://www.notfair.co/api/mcp/google_ads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
  });
}

describe("response-utils — schema request detection", () => {
  it("allows the MCP handshake methods through unauthenticated", async () => {
    for (const method of ["initialize", "notifications/initialized"]) {
      const { schemaOnly, cloned } = await isSchemaRequest(mcpRequest(method));
      expect(schemaOnly, `${method} should bypass auth for the handshake`).toBe(true);
      await expect(cloned.json()).resolves.toMatchObject({ method });
    }
  });

  it("requires auth for tools/list and resource discovery so Claude.ai's connector UI surfaces auth failures during setup, not on first tool call", async () => {
    for (const method of ["tools/list", "resources/list", "resources/read", "tools/call"]) {
      const { schemaOnly } = await isSchemaRequest(mcpRequest(method));
      expect(schemaOnly, `${method} should require auth`).toBe(false);
    }
  });
});
