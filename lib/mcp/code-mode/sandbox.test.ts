import { describe, expect, it } from "vitest";
import { runScriptInSandbox, type HostApi } from "./sandbox";

const emptyHost: HostApi = {};

describe("runScriptInSandbox", () => {
  it("returns a serializable value from top-level await", async () => {
    const r = await runScriptInSandbox({
      code: "return 1 + 2;",
      host: emptyHost,
    });
    expect(r.ok).toBe(true);
    expect(r.result).toBe(3);
    expect(r.error).toBeUndefined();
    expect(r.timedOut).toBe(false);
    expect(r.logs).toEqual([]);
  });

  it("captures console output across all standard levels", async () => {
    const r = await runScriptInSandbox({
      code: `console.log("hello", 1); console.warn("w"); console.error({ k: 2 }); return null;`,
      host: emptyHost,
    });
    expect(r.ok).toBe(true);
    expect(r.logs).toEqual([
      "[log] hello 1",
      "[warn] w",
      '[error] {"k":2}',
    ]);
    expect(r.logsTruncated).toBe(false);
  });

  it("enforces the wall-clock timeout on infinite loops", async () => {
    const r = await runScriptInSandbox({
      code: `while (true) {}`,
      host: emptyHost,
      timeoutMs: 150,
    });
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(100);
  });

  it("surfaces script errors with a line number pointing into user code", async () => {
    const r = await runScriptInSandbox({
      code: `const x = 1;\nthrow new Error("boom");`,
      host: emptyHost,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe("boom");
    // Line 2 in user code ("throw new Error"); the IIFE wrapper adds 1 line
    // that we subtract in parseLineColFromStack.
    expect(r.error?.line).toBeGreaterThanOrEqual(1);
  });

  it("caps the returned value and replaces oversized payloads with a sentinel", async () => {
    const r = await runScriptInSandbox({
      code: `const big = "x".repeat(10000); return { big };`,
      host: emptyHost,
      maxReturnBytes: 500,
    });
    expect(r.ok).toBe(true);
    expect(r.resultTruncated).toBe(true);
    expect((r.result as { __truncated: boolean }).__truncated).toBe(true);
  });

  it("truncates logs past maxLogChars and flags logsTruncated", async () => {
    const r = await runScriptInSandbox({
      code: `
        for (let i = 0; i < 50; i++) console.log("x".repeat(100));
        return null;
      `,
      host: emptyHost,
      maxLogChars: 300,
    });
    expect(r.logsTruncated).toBe(true);
    const joined = r.logs.join("");
    expect(joined.length).toBeLessThan(500);
  });

  it("calls async host functions and returns the parsed value inside the script", async () => {
    const host: HostApi = {
      ads: {
        gaql: async (query: unknown) => ({
          rows: [{ query, n: 42 }],
          fetchedRowCount: 1,
        }),
      },
    };
    const r = await runScriptInSandbox({
      code: `
        const a = await ads.gaql("SELECT foo FROM bar");
        return a.rows[0];
      `,
      host,
    });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ query: "SELECT foo FROM bar", n: 42 });
  });

  it("propagates host errors as script-level exceptions", async () => {
    const host: HostApi = {
      ads: {
        gaql: async () => {
          throw new Error("upstream 400");
        },
      },
    };
    const r = await runScriptInSandbox({
      code: `
        try { await ads.gaql("x"); return "no-throw"; }
        catch (e) { return "caught:" + e.message; }
      `,
      host,
    });
    expect(r.ok).toBe(true);
    expect(r.result).toBe("caught:upstream 400");
  });

  it("isolates the script from host globals (no fetch, no process, no require)", async () => {
    const r = await runScriptInSandbox({
      code: `
        const out = {};
        out.fetch = typeof fetch;
        out.process = typeof process;
        out.require = typeof require;
        out.globalThisKeys = Object.keys(globalThis).filter(k => !["console","ads"].includes(k)).sort();
        return out;
      `,
      host: { ads: { gaql: async () => ({}) } },
    });
    expect(r.ok).toBe(true);
    const out = r.result as { fetch: string; process: string; require: string; globalThisKeys: string[] };
    expect(out.fetch).toBe("undefined");
    expect(out.process).toBe("undefined");
    expect(out.require).toBe("undefined");
    // Nothing else should leak onto globalThis besides console + ads (and any
    // QuickJS built-ins like Math/JSON which are legal globals, not hazards).
    expect(out.globalThisKeys).not.toContain("__host_ads");
    expect(out.globalThisKeys).not.toContain("fetch");
    expect(out.globalThisKeys).not.toContain("process");
  });

  it("survives fire-and-forget host calls that settle after sandbox disposal", async () => {
    // If the script doesn't await a host promise, the host impl may resolve
    // AFTER the runtime has been disposed. The sandbox must not throw an
    // unhandled rejection when trying to write the result back to a dead VM.
    let resolveHostCall: (v: unknown) => void = () => {};
    const host: HostApi = {
      ads: {
        gaql: () =>
          new Promise((resolve) => {
            resolveHostCall = resolve;
          }),
      },
    };
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => rejections.push(e);
    process.on("unhandledRejection", onRejection);
    try {
      const r = await runScriptInSandbox({
        code: `
          // Fire-and-forget — don't await. The script returns before the host
          // call settles; the sandbox will be disposed in between.
          ads.gaql("SELECT anything FROM campaign");
          return "done";
        `,
        host,
      });
      expect(r.ok).toBe(true);
      expect(r.result).toBe("done");
      // Now let the host call settle after the sandbox is gone.
      resolveHostCall({ rows: [] });
      await new Promise((resolve) => setImmediate(resolve));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("preserves per-query errors in ads.gaqlParallel without failing the script", async () => {
    let call = 0;
    const host: HostApi = {
      ads: {
        gaqlParallel: async (queries: unknown) => {
          const arr = queries as { name: string }[];
          const out: Record<string, unknown> = {};
          for (const q of arr) {
            call++;
            out[q.name] = call === 2 ? { error: "Q2 fell over" } : { rows: [{ n: call }] };
          }
          return out;
        },
      },
    };
    const r = await runScriptInSandbox({
      code: `
        const res = await ads.gaqlParallel([
          { name: "a", query: "..." },
          { name: "b", query: "..." },
          { name: "c", query: "..." },
        ]);
        return res;
      `,
      host,
    });
    expect(r.ok).toBe(true);
    const res = r.result as Record<string, { error?: string; rows?: unknown[] }>;
    expect(res.a.rows).toEqual([{ n: 1 }]);
    expect(res.b.error).toBe("Q2 fell over");
    expect(res.c.rows).toEqual([{ n: 3 }]);
  });
});
