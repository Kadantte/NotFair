import { parse } from "acorn";
import {
  newAsyncContext,
  type QuickJSAsyncContext,
  type QuickJSAsyncRuntime,
} from "quickjs-emscripten";

/**
 * Host-side implementation of a namespaced API exposed to the sandbox.
 * Values are JSON-serializable — the sandbox only ever sees the serialized
 * form. This is the only surface the agent's script can touch; no `fetch`,
 * no `process`, no `require` is reachable inside QuickJS.
 */
export type HostApi = Record<
  string,
  Record<string, (...args: unknown[]) => Promise<unknown>>
>;

export type RunScriptResult = {
  ok: boolean;
  /** The script's last expression / return value, JSON-serialized then parsed back. */
  result?: unknown;
  resultTruncated: boolean;
  logs: string[];
  logsTruncated: boolean;
  error?: {
    message: string;
    name?: string;
    stack?: string;
    code?: string;
    reconnectUrl?: string;
    retryable?: boolean;
    userAction?: string;
    originalError?: string;
    /** 1-based line number in the user's script, if the runtime reported one. */
    line?: number;
    /** 1-based column number, if reported. */
    column?: number;
  };
  timedOut: boolean;
  elapsedMs: number;
};

export type RunScriptOptions = {
  code: string;
  host: HostApi;
  /**
   * Raw JS evaluated inside the VM right after the host API is installed and
   * before the user's script runs. Use this to pre-install VM-local data and
   * pure helpers (query builders, constants, serializable utilities) so scripts
   * can reach them synchronously without paying an async RPC round-trip.
   *
   * Runs in the same global scope as the user script, so anything it assigns
   * to `globalThis.x` or `ads.x` is visible. Keep it JSON-safe — no closures
   * that capture host references.
   */
  bootstrap?: string;
  /** Hard wall-clock cap. Interrupt fires shortly after this is exceeded. */
  timeoutMs?: number;
  /** Maximum total characters of captured console output; excess is truncated. */
  maxLogChars?: number;
  /** Maximum JSON size (bytes) of the returned value; excess replaced with a truncation sentinel. */
  maxReturnBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_LOG_CHARS = 100_000;
const DEFAULT_MAX_RETURN_BYTES = 500_000;

export async function runScriptInSandbox(opts: RunScriptOptions): Promise<RunScriptResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxLogChars = opts.maxLogChars ?? DEFAULT_MAX_LOG_CHARS;
  const maxReturnBytes = opts.maxReturnBytes ?? DEFAULT_MAX_RETURN_BYTES;

  const startedAt = Date.now();
  let reservedNameError: ReservedNameFinding | undefined;
  try {
    reservedNameError = findReservedNamespaceShadowing(opts.code, opts.host);
  } catch (e) {
    const err = e as { message?: string; loc?: { line?: number; column?: number } };
    return {
      ok: false,
      resultTruncated: false,
      logs: [],
      logsTruncated: false,
      error: {
        name: "SyntaxError",
        message: err.message ?? String(e),
        line: err.loc?.line ? Math.max(1, err.loc.line - 1) : undefined,
        column: err.loc?.column !== undefined ? err.loc.column + 1 : undefined,
      },
      timedOut: false,
      elapsedMs: Date.now() - startedAt,
    };
  }
  if (reservedNameError) {
    return {
      ok: false,
      resultTruncated: false,
      logs: [],
      logsTruncated: false,
      error: {
        name: "SyntaxError",
        message:
          `Variable '${reservedNameError.name}' shadows the SDK namespace at line ${reservedNameError.line}. ` +
          `Rename to '${reservedNameError.name}Rows', 'adList', 'campaignAds', etc.`,
        line: reservedNameError.line,
        column: reservedNameError.column,
      },
      timedOut: false,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const logs: string[] = [];
  let logChars = 0;
  let logsTruncated = false;
  function appendLog(line: string) {
    if (logsTruncated) return;
    if (logChars + line.length > maxLogChars) {
      const remaining = Math.max(0, maxLogChars - logChars);
      if (remaining > 0) logs.push(line.slice(0, remaining));
      logs.push(`[…log truncated at ${maxLogChars} chars]`);
      logsTruncated = true;
      return;
    }
    logs.push(line);
    logChars += line.length;
  }

  let ctx: QuickJSAsyncContext | undefined;
  let timedOut = false;
  try {
    ctx = await newAsyncContext();
    const runtime = ctx.runtime;

    const deadline = startedAt + timeoutMs;
    runtime.setInterruptHandler(() => {
      if (Date.now() > deadline) {
        timedOut = true;
        return true;
      }
      return false;
    });

    installConsole(ctx, appendLog);
    installHostApis(ctx, runtime, opts.host);
    if (opts.bootstrap) runBootstrap(ctx, opts.bootstrap);

    const wrapped = `(async () => {\n${opts.code}\n})()`;
    const evalResult = await ctx.evalCodeAsync(wrapped, "script.js");

    if (evalResult.error) {
      const err = ctx.dump(evalResult.error);
      evalResult.error.dispose();
      return {
        ok: false,
        resultTruncated: false,
        logs,
        logsTruncated,
        error: normalizeVmError(err, timedOut),
        timedOut,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const promiseHandle = evalResult.value;
    // Must kick off resolvePromise BEFORE draining the microtask queue — then
    // drain, then await. The async IIFE's return value lives in a pending
    // microtask that executePendingJobs needs to drive, but resolvePromise
    // installs the listener that captures the resolved value.
    const resolvedPromise = ctx.resolvePromise(promiseHandle);
    runtime.executePendingJobs();
    const resolvedHandle = await resolvedPromise;
    promiseHandle.dispose();

    if (resolvedHandle.error) {
      const err = ctx.dump(resolvedHandle.error);
      resolvedHandle.error.dispose();
      return {
        ok: false,
        resultTruncated: false,
        logs,
        logsTruncated,
        error: normalizeVmError(err, timedOut),
        timedOut,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const value = ctx.dump(resolvedHandle.value);
    resolvedHandle.value.dispose();

    const { result, resultTruncated } = capResult(value, maxReturnBytes);
    return {
      ok: true,
      result,
      resultTruncated,
      logs,
      logsTruncated,
      timedOut: false,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      resultTruncated: false,
      logs,
      logsTruncated,
      error: timedOut
        ? { message: `Script timed out after ${timeoutMs}ms` }
        : { message },
      timedOut,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    // Disposing the context disposes the runtime it owns; do NOT double-dispose.
    // ctx may be undefined if newAsyncContext() itself threw (e.g. WASM load
    // failure) — guard so the throw isn't masked by a NPE on cleanup.
    try {
      ctx?.dispose();
    } catch (disposeError) {
      // Cleanup failures must not replace the script result. Production traces
      // showed valid scripts bubbling raw disposal TypeErrors through the MCP
      // handler while parse failures still returned the structured envelope.
      console.warn("[runScript] QuickJS context dispose failed", disposeError);
    }
  }
}

type AstNode = {
  type?: string;
  loc?: { start: { line: number; column: number } };
  [key: string]: unknown;
};

type ReservedNameFinding = {
  name: string;
  line: number;
  column: number;
};

function findReservedNamespaceShadowing(
  code: string,
  host: HostApi,
): ReservedNameFinding | undefined {
  const reservedNames = new Set(Object.keys(host));
  if (reservedNames.size === 0) return undefined;

  const wrapped = `async function __user_script__() {\n${code}\n}`;
  const ast = parse(wrapped, {
    ecmaVersion: "latest",
    locations: true,
    sourceType: "script",
  }) as unknown as AstNode;

  return findBindingShadow(ast, reservedNames);
}

function findBindingShadow(
  node: unknown,
  reservedNames: Set<string>,
): ReservedNameFinding | undefined {
  if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
  const ast = node as AstNode;

  switch (ast.type) {
    case "VariableDeclarator": {
      const finding = findPatternShadow(ast.id, reservedNames);
      if (finding) return finding;
      break;
    }
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression": {
      const idFinding = findPatternShadow(ast.id, reservedNames);
      if (idFinding) return idFinding;
      if (ast.type === "ClassDeclaration" || ast.type === "ClassExpression") break;
      for (const param of (ast.params as unknown[] | undefined) ?? []) {
        const paramFinding = findPatternShadow(param, reservedNames);
        if (paramFinding) return paramFinding;
      }
      break;
    }
    case "ArrowFunctionExpression": {
      for (const param of (ast.params as unknown[] | undefined) ?? []) {
        const paramFinding = findPatternShadow(param, reservedNames);
        if (paramFinding) return paramFinding;
      }
      break;
    }
    case "CatchClause": {
      const finding = findPatternShadow(ast.param, reservedNames);
      if (finding) return finding;
      break;
    }
    case "AssignmentExpression": {
      const finding = findAssignmentTargetShadow(ast.left, reservedNames);
      if (finding) return finding;
      break;
    }
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier": {
      const finding = findPatternShadow(ast.local, reservedNames);
      if (finding) return finding;
      break;
    }
  }

  for (const [key, value] of Object.entries(ast)) {
    if (
      key === "id" ||
      key === "params" ||
      key === "param" ||
      key === "local" ||
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "range"
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        const finding = findBindingShadow(child, reservedNames);
        if (finding) return finding;
      }
    } else {
      const finding = findBindingShadow(value, reservedNames);
      if (finding) return finding;
    }
  }
  return undefined;
}

function findAssignmentTargetShadow(
  target: unknown,
  reservedNames: Set<string>,
): ReservedNameFinding | undefined {
  if (!target || typeof target !== "object" || Array.isArray(target)) return undefined;
  const ast = target as AstNode;
  if (
    ast.type === "Identifier" ||
    ast.type === "ObjectPattern" ||
    ast.type === "ArrayPattern" ||
    ast.type === "AssignmentPattern" ||
    ast.type === "RestElement"
  ) {
    return findPatternShadow(ast, reservedNames);
  }
  return undefined;
}

function findPatternShadow(
  pattern: unknown,
  reservedNames: Set<string>,
): ReservedNameFinding | undefined {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) return undefined;
  const ast = pattern as AstNode;

  if (ast.type === "Identifier" && typeof ast.name === "string" && reservedNames.has(ast.name)) {
    return astLocation(ast, ast.name);
  }

  if (ast.type === "Property") {
    return findPatternShadow(ast.value, reservedNames);
  }

  if (ast.type === "RestElement") {
    return findPatternShadow(ast.argument, reservedNames);
  }

  if (ast.type === "AssignmentPattern") {
    return findPatternShadow(ast.left, reservedNames);
  }

  for (const value of Object.values(ast)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const finding = findPatternShadow(child, reservedNames);
        if (finding) return finding;
      }
    } else {
      const finding = findPatternShadow(value, reservedNames);
      if (finding) return finding;
    }
  }
  return undefined;
}

function astLocation(node: AstNode, name: string): ReservedNameFinding {
  return {
    name,
    line: Math.max(1, (node.loc?.start.line ?? 2) - 1),
    column: (node.loc?.start.column ?? 0) + 1,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────

function installConsole(ctx: QuickJSAsyncContext, appendLog: (line: string) => void) {
  const console = ctx.newObject();
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const fn = ctx.newFunction(level, (...argHandles) => {
      const parts = argHandles.map((h) => {
        const value = ctx.dump(h);
        return typeof value === "string" ? value : safeStringify(value);
      });
      // Don't dispose argHandles — quickjs auto-frees them on callback return.
      appendLog(`[${level}] ${parts.join(" ")}`);
    });
    ctx.setProp(console, level, fn);
    fn.dispose();
  }
  ctx.setProp(ctx.global, "console", console);
  console.dispose();
}

function installHostApis(
  ctx: QuickJSAsyncContext,
  runtime: QuickJSAsyncRuntime,
  host: HostApi,
) {
  for (const [nsName, methods] of Object.entries(host)) {
    const ns = ctx.newObject();
    for (const [methodName, impl] of Object.entries(methods)) {
      const fn = ctx.newFunction(methodName, (...argHandles) => {
        const args = argHandles.map((h) => ctx.dump(h));
        // argHandles are auto-disposed on return; don't manually dispose.
        const deferred = ctx.newPromise();
        Promise.resolve()
          .then(() => impl(...args))
          .then(
            (value) => {
              // Host call may settle AFTER the outer script returned and the
              // context was disposed (script didn't await the promise). Guard
              // every handle op so fire-and-forget calls don't crash the Node
              // process with an unhandled rejection on a disposed runtime.
              if (!ctx.alive) return;
              try {
                const handle = ctx.newString(safeStringify(value));
                deferred.resolve(handle);
                handle.dispose();
              } catch {
                /* context torn down between the alive check and the write */
              }
            },
            (err) => {
              if (!ctx.alive) return;
              try {
                const msg = err instanceof Error ? err.message : String(err);
                const handle = ctx.newError(msg);
                deferred.reject(handle);
                handle.dispose();
              } catch {
                /* same: context disposed mid-settle */
              }
            },
          );
        // Drain QuickJS's pending-job queue whenever the host promise settles
        // so `await` inside the script actually resumes. Guarded for the same
        // fire-and-forget / disposal race as above.
        deferred.settled.then(() => {
          if (ctx.alive) {
            try { runtime.executePendingJobs(); } catch { /* disposed */ }
          }
        });
        return deferred.handle;
      });
      // Wrap the raw (JSON-string-returning) host fn with a JSON.parse shim so
      // scripts see real objects. The raw handle stays private to the IIFE.
      ctx.setProp(ns, `__raw_${methodName}`, fn);
      fn.dispose();
    }
    ctx.setProp(ctx.global, `__host_${nsName}`, ns);
    ns.dispose();
  }

  // Build the public namespace objects (e.g. `ads`) that unwrap JSON. Each
  // public method awaits the raw host call, parses the string, and returns
  // the resulting value.
  const setup = `
    (() => {
      const namespaces = ${JSON.stringify(
        Object.fromEntries(
          Object.entries(host).map(([ns, methods]) => [ns, Object.keys(methods)]),
        ),
      )};
      for (const [ns, methodNames] of Object.entries(namespaces)) {
        const rawNs = globalThis["__host_" + ns];
        const publicNs = {};
        for (const m of methodNames) {
          const raw = rawNs["__raw_" + m];
          publicNs[m] = async (...args) => {
            const s = await raw(...args);
            try { return JSON.parse(s); } catch { return s; }
          };
        }
        // NOT frozen here — bootstrap may extend with sub-namespaces. Each
        // sub-namespace (ads.queries, ads.helpers, ...) is frozen individually.
        globalThis[ns] = publicNs;
        delete globalThis["__host_" + ns];
      }
    })();
  `;
  const setupResult = ctx.evalCode(setup);
  if (setupResult.error) {
    const err = ctx.dump(setupResult.error);
    setupResult.error.dispose();
    throw new Error(`Sandbox setup failed: ${safeStringify(err)}`);
  }
  setupResult.value.dispose();
}

function runBootstrap(ctx: QuickJSAsyncContext, source: string) {
  const result = ctx.evalCode(source, "bootstrap.js");
  if (result.error) {
    const err = ctx.dump(result.error);
    result.error.dispose();
    throw new Error(`Sandbox bootstrap failed: ${safeStringify(err)}`);
  }
  result.value.dispose();
}

function normalizeVmError(err: unknown, timedOut: boolean): RunScriptResult["error"] {
  if (timedOut) return { message: "Script timed out" };
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const message = typeof e.message === "string" ? e.message : safeStringify(err);
    const name = typeof e.name === "string" ? e.name : undefined;
    const stack = typeof e.stack === "string" ? e.stack : undefined;
    const { line, column } = parseLineColFromStack(stack);
    return { message, name, stack, line, column };
  }
  return { message: typeof err === "string" ? err : safeStringify(err) };
}

function parseLineColFromStack(stack?: string): { line?: number; column?: number } {
  if (!stack) return {};
  // QuickJS stack frames look like:  at <anonymous> (script.js:12:5)
  // or:                              at Function (script.js:12)
  const match = stack.match(/script\.js:(\d+)(?::(\d+))?/);
  if (!match) return {};
  // The async IIFE wrapper adds 1 line before the user's code; subtract it so
  // reported line numbers match what the agent wrote.
  const rawLine = Number(match[1]);
  const line = rawLine > 1 ? rawLine - 1 : rawLine;
  const column = match[2] ? Number(match[2]) : undefined;
  return { line, column };
}

function capResult(
  value: unknown,
  maxBytes: number,
): { result: unknown; resultTruncated: boolean } {
  if (value === undefined) return { result: undefined, resultTruncated: false };
  const json = safeStringify(value);
  if (json.length <= maxBytes) return { result: value, resultTruncated: false };
  return {
    result: {
      __truncated: true,
      reason: `Return value exceeded ${maxBytes} bytes (got ${json.length}). Filter in-script before returning.`,
      preview: json.slice(0, Math.min(2_000, maxBytes)),
    },
    resultTruncated: true,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "function") return "[function]";
      if (typeof v === "undefined") return null;
      return v;
    }) ?? "null";
  } catch {
    return `"[unserializable: ${String(value).slice(0, 200)}]"`;
  }
}
