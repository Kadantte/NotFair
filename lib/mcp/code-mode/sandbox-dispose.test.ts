import { afterEach, describe, expect, it, vi } from "vitest";

function handle(dumpValue?: unknown) {
  return {
    __dump: dumpValue,
    alive: true,
    dispose: vi.fn(),
  };
}

describe("runScriptInSandbox cleanup", () => {
  afterEach(() => {
    vi.doUnmock("quickjs-emscripten");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not let QuickJS dispose failures replace a successful script result", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const resultHandle = handle(1);

    vi.doMock("quickjs-emscripten", () => ({
      newAsyncContext: vi.fn(async () => ({
        alive: true,
        runtime: {
          setInterruptHandler: vi.fn(),
          executePendingJobs: vi.fn(),
        },
        global: handle(),
        newObject: () => handle(),
        newFunction: () => handle(),
        setProp: vi.fn(),
        evalCode: () => ({ value: handle() }),
        evalCodeAsync: async () => ({ value: handle() }),
        resolvePromise: async () => ({ value: resultHandle }),
        dump: (h: { __dump?: unknown }) => h.__dump,
        dispose: () => {
          throw new TypeError("a is not a function");
        },
      })),
    }));

    const { runScriptInSandbox } = await import("./sandbox");
    const result = await runScriptInSandbox({ code: "return 1;", host: {} });

    expect(result).toMatchObject({
      ok: true,
      result: 1,
      resultTruncated: false,
      timedOut: false,
    });
    expect(warn).toHaveBeenCalledWith(
      "[runScript] QuickJS context dispose failed",
      expect.any(TypeError),
    );
  });
});
