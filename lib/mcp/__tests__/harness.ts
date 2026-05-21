/**
 * Test harness for level-1 MCP tool-handler integration tests.
 *
 * Builds a fake `McpServer` that captures `registerTool`/`registerResource`
 * calls, then exposes a `callTool` method that validates the caller's
 * arguments through the tool's Zod input schema and invokes the handler.
 * No HTTP, no MCP SDK, no DB — the underlying `google-ads-api` client is
 * the only boundary the tests stub.
 *
 * The harness is intentionally structural: it accepts `ToolRegistrar`s
 * (registerReadTools, registerWriteTools) so future tools are covered by
 * the same smoke assertions without per-tool wiring.
 */

import { z, type ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuthContext } from "@/lib/google-ads";
import type { ToolRegistrar } from "../types";

type ToolHandler = (args: unknown) => Promise<CallToolResult>;

type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

type CapturedTool = {
  name: string;
  description: string;
  inputSchema: ZodRawShape | undefined;
  annotations: ToolAnnotations | undefined;
  handler: ToolHandler;
};

type CapturedResource = {
  name: string;
  uri: string;
  metadata: Record<string, unknown>;
};

export type ToolHarness = {
  tools: Map<string, CapturedTool>;
  resources: CapturedResource[];
  callTool: (name: string, args?: Record<string, unknown>) => Promise<CallToolResult>;
  listToolNames: () => string[];
  getTool: (name: string) => CapturedTool;
  getField: (toolName: string, fieldName: string) => z.ZodTypeAny;
};

/**
 * Register tool modules against a fake server and return a harness that
 * can invoke those tools with Zod-validated arguments.
 *
 * Passing `auth` is required — tests decide what `currentAuth()` should
 * return. If a test needs to vary it per-call, wrap the harness and mutate
 * a closure variable.
 */
export function buildHarness(
  registrars: ToolRegistrar[],
  auth: AuthContext,
): ToolHarness {
  const tools = new Map<string, CapturedTool>();
  const resources: CapturedResource[] = [];

  const fakeServer = {
    registerTool(
      name: string,
      def: {
        description?: string;
        inputSchema?: ZodRawShape;
        annotations?: ToolAnnotations;
      },
      handler: ToolHandler,
    ) {
      if (tools.has(name)) {
        throw new Error(`Tool "${name}" registered twice in harness`);
      }
      tools.set(name, {
        name,
        description: def.description ?? "",
        inputSchema: def.inputSchema,
        annotations: def.annotations,
        handler,
      });
    },
    registerResource(
      name: string,
      uri: string,
      metadata: Record<string, unknown>,
      _handler: unknown,
    ) {
      resources.push({ name, uri, metadata });
    },
  } as unknown as McpServer;

  for (const register of registrars) {
    register(fakeServer, () => auth);
  }

  const getTool = (name: string): CapturedTool => {
    const t = tools.get(name);
    if (!t) throw new Error(`Tool "${name}" not registered. Known: ${[...tools.keys()].join(", ")}`);
    return t;
  };

  const getField = (toolName: string, fieldName: string): z.ZodTypeAny => {
    const tool = getTool(toolName);
    const field = tool.inputSchema?.[fieldName];
    if (!field) {
      const known = Object.keys(tool.inputSchema ?? {}).join(", ") || "<none>";
      throw new Error(`Tool "${toolName}" has no input field "${fieldName}". Known: ${known}`);
    }
    // ZodRawShape values are typed as the structural `$ZodType` in zod 4;
    // tests need the rich `ZodTypeAny` surface (safeParse/description). Cast
    // through unknown — every value placed into a Zod object schema is a
    // full ZodType at runtime.
    return field as unknown as z.ZodTypeAny;
  };

  return {
    tools,
    resources,
    getTool,
    getField,
    listToolNames: () => [...tools.keys()],
    async callTool(name, args = {}) {
      const tool = getTool(name);
      // Mirror what `createMcpHandler` does on the wire: validate the caller's
      // arguments through a z.object built from the tool's raw inputSchema,
      // applying defaults. If the tool declared no inputSchema (e.g. the
      // zero-arg `listConnectedAccounts`), pass args through untouched.
      const parsed = tool.inputSchema
        ? z.object(tool.inputSchema).parse(args)
        : args;
      return tool.handler(parsed);
    },
  };
}

/** Reasonable default AuthContext for tests that don't care about multi-account. */
export const TEST_AUTH: AuthContext = {
  refreshToken: "test-refresh-token",
  customerId: "1234567890",
  customerIds: [{ id: "1234567890", name: "Test Account" }],
  userId: "test-user",
  loginCustomerId: null,
  clientName: "harness",
  clientVersion: "0.0.0",
  authMethod: "direct",
  userAgent: "vitest",
  sessionId: null,
};

/**
 * Assert a CallToolResult is a successful `typedResult`-shaped response.
 * Parses the JSON-serialised payload out of `content[0].text` and returns
 * it for further assertions. (typedResult writes the full payload to text
 * — see lib/mcp/types.ts.)
 */
export function expectOk(result: CallToolResult): Record<string, unknown> {
  if (result.isError) {
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : JSON.stringify(result);
    throw new Error(`Expected ok result, got error: ${text}`);
  }
  const first = result.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error(`Expected text content, got ${JSON.stringify(result)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(first.text);
  } catch {
    throw new Error(`Expected JSON-serialised text payload, got: ${first.text.slice(0, 200)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected an object payload, got: ${typeof parsed}`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Assert a CallToolResult is an error response and return the error text.
 * Tool errors from `errorResult` come back as `{ isError: true, content: [text] }`.
 */
export function expectError(result: CallToolResult): string {
  if (!result.isError) {
    throw new Error(`Expected error result, got ok: ${JSON.stringify(result)}`);
  }
  const first = result.content?.[0];
  return first?.type === "text" ? first.text : JSON.stringify(result);
}
