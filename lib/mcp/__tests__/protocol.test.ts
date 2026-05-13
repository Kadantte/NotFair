/**
 * Level-2 MCP integration tests — wire/protocol layer.
 *
 * Wires a real `McpServer` to a real `Client` via the SDK's in-memory
 * transport and drives the full request/response lifecycle: `initialize`
 * → `tools/list` → `tools/call` → `resources/list`. This is the layer
 * where description-length caps (commit 4109ce5), Zod-to-JSON-schema
 * mismatches, and structuredContent serialization bugs would surface —
 * things the handler-level tests in `tool-registration.test.ts` can't see.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (same layout as tool-registration.test.ts) ────────────────

const mockQuery = vi.fn();
const mockMutateResources = vi.fn();
const mockSearchGoogleAdsFields = vi.fn();
const mockCustomer = {
  query: mockQuery,
  mutateResources: mockMutateResources,
  googleAdsFields: { searchGoogleAdsFields: mockSearchGoogleAdsFields },
};

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer() {
      return mockCustomer;
    }
  },
  enums: {},
  resources: {},
  services: {},
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("mock-value"),
  getEnv: vi.fn().mockReturnValue(undefined),
}));

vi.mock("@/lib/tools/execute", () => ({
  execRead: vi.fn(async (_auth, _accountId, _toolName, fn) => fn()),
  execWrite: vi.fn(async (_auth, _accountId, _campaignId, fn) => {
    const result = await fn();
    return { ...result, changeId: 1 };
  }),
}));

vi.mock("@/lib/mcp/rate-limit", () => {
  class RateLimitError extends Error {
    constructor(
      public readonly used = 0,
      public readonly limit = 0,
      public readonly resetsAt = new Date(),
    ) {
      super("rate limited");
      this.name = "RateLimitError";
    }
  }
  return {
    enforceRateLimit: vi.fn(async () => undefined),
    RateLimitError,
    recordOperation: vi.fn(),
  };
});

// ─── Imports after mocks ────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerReadTools } from "../read-tools";
import { registerWriteTools } from "../write-tools";
import { registerCodeModeTools } from "../code-mode";
import { PLAYBOOKS } from "../playbooks";
import { clearCache } from "@/lib/google-ads";
import { TEST_AUTH } from "./harness";

// ─── Harness ─────────────────────────────────────────────────────────

/**
 * Build a real McpServer wired through InMemoryTransport to a real Client.
 * Registers read + write tool modules and the playbook resources (mirroring
 * what `app/api/[transport]/route.ts` does, minus auth/telemetry).
 */
async function connectClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: "adsagent-test", version: "0.0.0" });
  registerReadTools(server, () => TEST_AUTH);
  registerWriteTools(server, () => TEST_AUTH);
  registerCodeModeTools(server, () => TEST_AUTH);

  // Register playbooks the same way the route does, so `resources/list` is covered.
  for (const playbook of PLAYBOOKS) {
    server.registerResource(
      playbook.uri.replace("adsagent://playbooks/", ""),
      playbook.uri,
      { title: playbook.name, description: playbook.description, mimeType: "text/markdown" },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: playbook.content }],
      }),
    );
  }

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);

  const client = new Client({ name: "vitest-client", version: "0.0.0" });
  await client.connect(clientT);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

function resetMocks() {
  mockQuery.mockReset();
  mockMutateResources.mockReset();
  mockQuery.mockResolvedValue([]);
  mockMutateResources.mockResolvedValue({ mutate_operation_responses: [] });
  clearCache();
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("MCP protocol — tools/list", () => {
  beforeEach(resetMocks);

  it("returns every registered tool with a JSON-schema inputSchema", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(20);

      const byName = new Map(tools.map((t) => [t.name, t]));
      for (const anchor of ["listKeywords", "getChanges", "pauseKeyword"]) {
        const t = byName.get(anchor);
        expect(t, `${anchor} should be advertised`).toBeDefined();
        // The SDK turns the raw Zod shape into a JSON schema; connectors
        // reject anything that isn't an object-shaped schema.
        expect(t!.inputSchema?.type).toBe("object");
      }
    } finally {
      await cleanup();
    }
  });

  it("attaches annotation hints the connector can read", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { tools } = await client.listTools();
      const listKeywords = tools.find((t) => t.name === "listKeywords");
      const pauseKeyword = tools.find((t) => t.name === "pauseKeyword");
      expect(listKeywords?.annotations?.readOnlyHint).toBe(true);
      expect(pauseKeyword?.annotations?.readOnlyHint).not.toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("MCP protocol — tools/call", () => {
  beforeEach(resetMocks);

  it("calls a read tool and returns the JSON payload in content[0].text over the wire", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { id: "100", name: "Search", status: "ENABLED" },
        ad_group: { id: "111", name: "Dogs", status: "ENABLED" },
        ad_group_criterion: {
          resource_name: "customers/1234567890/adGroupCriteria/111~222",
          criterion_id: "222",
          status: "ENABLED",
          negative: false,
          keyword: { text: "dog grooming", match_type: "PHRASE" },
        },
      },
    ]);

    const { client, cleanup } = await connectClient();
    try {
      const result = await client.callTool({ name: "listKeywords", arguments: {} });
      expect(result.isError).toBeFalsy();
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      expect(content.type).toBe("text");
      const parsed = JSON.parse(content.text) as {
        keywords: Array<{ text: string; campaignId: string; criterionId: string }>; 
      };
      expect(parsed.keywords).toHaveLength(1);
      expect(parsed.keywords[0]).toMatchObject({
        text: "dog grooming",
        campaignId: "100",
        criterionId: "222",
      });
    } finally {
      await cleanup();
    }
  });

  it("returns isError=true for handler-level failures, not a transport error", async () => {
    // listQueryableResources lets upstream errors bubble up through the
    // handler — perfect for exercising the errorResult path over the wire.
    mockSearchGoogleAdsFields.mockRejectedValueOnce(new Error("BOOM_AT_API"));
    const { client, cleanup } = await connectClient();
    try {
      const result = await client.callTool({ name: "listQueryableResources", arguments: {} });
      expect(result.isError).toBe(true);
      const text = Array.isArray(result.content) && result.content[0]?.type === "text"
        ? result.content[0].text
        : "";
      expect(text).toContain("BOOM_AT_API");
    } finally {
      await cleanup();
    }
  });

  it("runs the simplest code-mode script through the MCP wire envelope", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const result = await client.callTool({
        name: "runScript",
        arguments: { code: "return 1;", timeoutMs: 1000 },
      });
      expect(result.isError).toBeFalsy();
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      expect(content.type).toBe("text");
      const parsed = JSON.parse(content.text) as { ok: boolean; result: unknown };
      expect(parsed).toMatchObject({ ok: true, result: 1 });
    } finally {
      await cleanup();
    }
  });

  it("maps runScript invalid_grant failures to reconnect guidance", async () => {
    mockQuery.mockRejectedValueOnce(new Error("invalid_grant"));
    const { client, cleanup } = await connectClient();
    try {
      const result = await client.callTool({
        name: "runScript",
        arguments: {
          code: "return await ads.gaql('SELECT campaign.id FROM campaign');",
          timeoutMs: 1000,
        },
      });
      expect(result.isError).toBeFalsy();
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      const parsed = JSON.parse(content.text) as {
        ok: boolean;
        error: { code: string; message: string; reconnectUrl: string; retryable: boolean };
      };
      expect(parsed.ok).toBe(false);
      expect(parsed.error.code).toBe("GOOGLE_ADS_RECONNECT_REQUIRED");
      expect(parsed.error.message).toContain("reconnect their Google Ads account");
      expect(parsed.error.reconnectUrl).toBe("https://www.notfair.co/connect/google-ads");
      expect(parsed.error.retryable).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("surfaces unknown-tool calls as isError results with a readable message", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const result = await client.callTool({ name: "does-not-exist", arguments: {} });
      expect(result.isError).toBe(true);
      const text = Array.isArray(result.content) && result.content[0]?.type === "text"
        ? result.content[0].text
        : "";
      expect(text).toMatch(/not found|unknown|does-not-exist/i);
    } finally {
      await cleanup();
    }
  });
});

describe("MCP protocol — resources", () => {
  beforeEach(resetMocks);

  it("advertises playbook resources and serves their markdown content", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { resources } = await client.listResources();
      const uris = resources.map((r) => r.uri);
      for (const playbook of PLAYBOOKS) {
        expect(uris).toContain(playbook.uri);
      }

      const sample = PLAYBOOKS[0];
      const read = await client.readResource({ uri: sample.uri });
      const [content] = read.contents;
      expect(content.mimeType).toBe("text/markdown");
      if (!("text" in content)) throw new Error("expected text content");
      expect(content.text).toBe(sample.content);
    } finally {
      await cleanup();
    }
  });
});
