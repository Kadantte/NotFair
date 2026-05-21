import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { extractErrorMessage } from "@/lib/google-ads";
import { formatMcpErrorText } from "./auth-error-response";

/**
 * A function that registers tools on an MCP server.
 * Each module (read-tools, write-tools) exports one of these.
 */
export type ToolRegistrar = (
  server: McpServer,
  currentAuth: () => import("@/lib/google-ads").AuthContext,
) => void;

/**
 * Wrap a typed value as an MCP tool response. The full payload is JSON-
 * serialized into `content[0].text` — this is the channel Claude.ai's
 * connector actually surfaces to the model.
 *
 * An earlier design split the data into typed `structuredContent` plus a
 * short summary in text, but in practice Claude only reads text reliably,
 * so unsummarised tools showed up as "N fields" in chat with the real data
 * stranded in `structuredContent`. We now put everything in text.
 *
 * If a tool prefers a hand-written human-readable string instead of the raw
 * JSON dump (e.g. "Created campaign 12345"), pass it as `summary`.
 */
export function typedResult<T>(value: T, summary?: string): CallToolResult {
  const text = summary ?? defaultText(value);
  return { content: [{ type: "text", text }] };
}

function defaultText(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

/** Wrap an error as an MCP error response with the actual error message. */
export function errorResult(error: unknown): CallToolResult {
  const message = extractErrorMessage(error);
  return { content: [{ type: "text", text: formatMcpErrorText(message, error) }], isError: true };
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

/**
 * Shared `runScript` timeout schema for the Google + Meta code-mode tools.
 *
 * Stays a factory (not a const) because each platform appends its own
 * trailing guidance clause to the description — Google mentions
 * `gaqlParallel`, Meta mentions `graphParallel`. The `min`/`max`/`default`
 * envelope and the unit-spelled-out error messages are identical, so any
 * drift would silently regress the DocBot 2026-05-21 fix on one platform.
 *
 * Regression-guarded by `MCP runScript — description guardrails` in
 * `lib/mcp/__tests__/tool-registration.test.ts`.
 */
export function runScriptTimeoutMsParam(extraGuidance = "") {
  const base = "Wall-clock cap in MILLISECONDS before the script is interrupted. Default 30000 (30s), max 45000 (45s). Examples: pass 45000 for a 45-second cap. Do NOT pass 45 — that's 45ms and will be rejected.";
  return z
    .number()
    .int()
    .min(100, "timeoutMs is in MILLISECONDS (min 100 = 0.1s). For a 45-second cap pass 45000, not 45.")
    .max(45_000, "timeoutMs is in MILLISECONDS (max 45000 = 45s). For a 45-second cap pass 45000, not 45.")
    .default(30_000)
    .describe(extraGuidance ? `${base} ${extraGuidance}` : base);
}

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
