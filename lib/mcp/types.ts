import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * A function that registers tools on an MCP server.
 * Each module (read-tools, write-tools) exports one of these.
 */
export type ToolRegistrar = (
  server: McpServer,
  currentAuth: () => import("@/lib/google-ads").AuthContext,
) => void;

/** Wrap a value as an MCP text content response. */
export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
