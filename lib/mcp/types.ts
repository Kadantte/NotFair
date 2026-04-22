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

/**
 * Wrap a typed value as an MCP tool response with `structuredContent` as the
 * primary payload channel. The `content[0].text` field carries only a short
 * human-readable summary for clients that don't render structured content.
 *
 * Consumers should read `result.structuredContent` directly — the text field
 * is no longer the source of truth.
 *
 * `structuredContent` on the MCP wire is constrained to a JSON object, so:
 *  - arrays are wrapped as `{ items: [...] }`
 *  - primitives are wrapped as `{ value }`
 *  - `null`/`undefined` omits `structuredContent` entirely
 *  - plain objects pass through unchanged
 */
export function typedResult<T>(value: T, summary?: string): CallToolResult {
  const text = summary ?? defaultSummary(value);
  const structured = toStructuredContent(value);
  return structured === undefined
    ? { content: [{ type: "text", text }] }
    : { content: [{ type: "text", text }], structuredContent: structured };
}

function toStructuredContent(value: unknown): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return { items: value };
  if (typeof value === "object") return value as Record<string, unknown>;
  return { value };
}

function defaultSummary(value: unknown): string {
  if (value == null) return "null";
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  if (typeof value === "object") {
    const keys = Object.keys(value as object).length;
    return `${keys} ${keys === 1 ? "field" : "fields"}`;
  }
  return String(value);
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

/**
 * Wrap a typed async handler that returns a raw value (not a CallToolResult).
 *
 * The handler signature is `(args) => Promise<TOut>` where `TOut` is the
 * declared response type. `typedResult` converts the value to a CallToolResult
 * with `structuredContent` populated, and `safeHandler` adds error catching.
 *
 * Prefer this over hand-wiring `safeHandler(async () => typedResult(...))` —
 * it enforces the typed contract at the signature and yields shorter call sites.
 *
 * @param fn - Handler that returns the declared response type directly.
 * @param summarize - Optional function producing a short human summary for
 *   text-only clients. When omitted, `typedResult` derives a default summary.
 */
export function safeTypedHandler<A, T>(
  fn: (args: A) => Promise<T>,
  summarize?: (value: T) => string,
): (args: A) => Promise<CallToolResult> {
  return safeHandler(async (args: A) => {
    const value = await fn(args);
    return typedResult<T>(value, summarize?.(value));
  });
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
