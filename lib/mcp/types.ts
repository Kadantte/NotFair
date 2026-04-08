import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { extractErrorMessage } from "@/lib/google-ads";

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

/** Wrap an error as an MCP error response with the actual error message. */
export function errorResult(error: unknown): CallToolResult {
  return { content: [{ type: "text", text: extractErrorMessage(error) }], isError: true };
}

/**
 * Wrap an async tool handler with try-catch error boundary.
 * Ensures errors are returned as proper MCP error responses with readable messages
 * instead of propagating as raw objects (which become "[object Object]").
 */
export function safeHandler<A>(
  fn: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (error) {
      return errorResult(error);
    }
  };
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

/** For bulk/replacement operations that are hard to reverse or have wide blast radius. */
export const DESTRUCTIVE_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;
