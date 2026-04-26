import type { ZodRawShape, ZodTypeAny } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "@/lib/google-ads";
import { registerReadTools } from "./read-tools";
import { registerWriteTools } from "./write-tools";
import { registerCodeModeTools } from "./code-mode";
import { withMcpTelemetry } from "./telemetry";

/**
 * A tool collected from the MCP registrars in a portable shape.
 * Used by the chat agent to derive its tools from the MCP server (the
 * source of truth) without duplicating definitions.
 */
export type CollectedTool = {
  name: string;
  description: string;
  inputShape: ZodRawShape;
  annotations?: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
};

type RegisterToolConfig = {
  description?: string;
  inputSchema?: ZodRawShape;
  annotations?: Record<string, unknown>;
};

/**
 * Implements just enough of the McpServer surface to capture every
 * `registerTool(name, config, handler)` call. The MCP registrars only
 * touch this method, so we cast through `unknown` when handing it off.
 */
class ToolCollector {
  readonly tools: CollectedTool[] = [];

  registerTool(
    name: string,
    config: RegisterToolConfig,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
  ): unknown {
    this.tools.push({
      name,
      description: config.description ?? "",
      inputShape: (config.inputSchema ?? {}) as Record<string, ZodTypeAny>,
      annotations: config.annotations,
      handler,
    });
    return undefined;
  }
}

/**
 * Run the MCP read/write registrars against an in-memory collector and
 * return the resulting tool list. The MCP server remains the single
 * source of truth for tool names, schemas, and handlers.
 */
export function collectAdsTools(currentAuth: () => AuthContext): CollectedTool[] {
  const collector = new ToolCollector();
  withMcpTelemetry(collector);
  registerReadTools(collector as unknown as McpServer, currentAuth);
  registerWriteTools(collector as unknown as McpServer, currentAuth);
  // `runScript` lets the chat agent fan out GAQL queries the same way the
  // MCP server does. Without it, chat loses access to anything not exposed
  // as a dedicated point-query tool — and the read surface was deliberately
  // trimmed in favor of runScript (see commit c1eb981).
  registerCodeModeTools(collector as unknown as McpServer, currentAuth);
  return collector.tools;
}
