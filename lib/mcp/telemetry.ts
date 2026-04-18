import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Per-tool-call telemetry context. Set once at the MCP boundary (by
 * wrapping `server.registerTool`) so `execRead`/`execWrite` can read
 * toolName + args + requestId without the 74 individual call sites
 * having to thread them through.
 */
export type ToolCallTelemetry = {
  requestId: string;
  /** Raw camelCase name from `server.registerTool(name, ...)`. */
  toolName: string;
  args: unknown;
  startedAt: number;
};

const telemetryStore = new AsyncLocalStorage<ToolCallTelemetry>();

export function getTelemetry(): ToolCallTelemetry | undefined {
  return telemetryStore.getStore();
}

export function runWithTelemetry<T>(
  ctx: ToolCallTelemetry,
  fn: () => Promise<T>,
): Promise<T> {
  return telemetryStore.run(ctx, fn);
}

/**
 * Wrap a server/collector so every `registerTool(name, config, handler)` runs
 * its handler inside a telemetry context. The wrap is in-place (we mutate
 * `.registerTool`) because both the SDK's `McpServer` and our `ToolCollector`
 * expose it as a property.
 *
 * Signature uses `unknown` at the boundary because the SDK signature is
 * highly generic (per-tool zod schemas); a structural constraint would
 * reject one caller or the other. We only proxy the handler callback.
 */
const WRAPPED = Symbol("adsagent.telemetryWrapped");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownFn = (...args: any[]) => unknown;

export function withMcpTelemetry<S>(server: S): S {
  const s = server as unknown as { registerTool: UnknownFn; [WRAPPED]?: boolean };
  if (s[WRAPPED]) return server;
  const original = s.registerTool.bind(s) as UnknownFn;
  s.registerTool = ((...args: unknown[]) => {
    // Supported arities: (name, handler) and (name, config, handler).
    const name = typeof args[0] === "string" ? args[0] : "unknown";
    const handlerIdx = args.length - 1;
    const handler = args[handlerIdx];
    if (typeof handler !== "function") return original(...args);
    const wrapped = (toolArgs: unknown) => {
      const ctx: ToolCallTelemetry = {
        requestId: randomUUID(),
        toolName: name,
        args: toolArgs,
        startedAt: performance.now(),
      };
      return runWithTelemetry(ctx, async () => (handler as UnknownFn)(toolArgs));
    };
    const next = [...args];
    next[handlerIdx] = wrapped;
    return original(...next);
  }) as UnknownFn;
  s[WRAPPED] = true;
  return server;
}
