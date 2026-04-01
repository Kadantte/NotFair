import { z } from "zod";
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

/** Shared optional accountId param for all tools (multi-account targeting). */
export const accountIdParam = z
  .string()
  .optional()
  .describe("Account ID (omit for primary)");

/** Shared annotation presets to avoid repetition across tool registrations. */
export const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

export const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
