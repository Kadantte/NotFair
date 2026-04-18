import { describe, it, expect } from "vitest";
import { withMcpTelemetry, getTelemetry } from "@/lib/mcp/telemetry";

class FakeServer {
  public captured: Array<{ name: string; handler: (args: unknown) => Promise<unknown> }> = [];
  registerTool(
    name: string,
    _config: unknown,
    handler: (args: unknown) => Promise<unknown>,
  ): unknown {
    this.captured.push({ name, handler });
    return undefined;
  }
}

describe("withMcpTelemetry", () => {
  it("wraps registered handlers so they see a telemetry context with toolName + args", async () => {
    const server = withMcpTelemetry(new FakeServer());
    let seen: ReturnType<typeof getTelemetry> | undefined;
    server.registerTool("listCampaigns", {}, async (args) => {
      seen = getTelemetry();
      return args;
    });

    const result = await server.captured[0].handler({ limit: 10 });
    expect(result).toEqual({ limit: 10 });
    expect(seen?.toolName).toBe("listCampaigns");
    expect(seen?.args).toEqual({ limit: 10 });
    expect(seen?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof seen?.startedAt).toBe("number");
  });

  it("is idempotent — double-wrapping does not nest contexts", async () => {
    const server = withMcpTelemetry(withMcpTelemetry(new FakeServer()));
    let count = 0;
    server.registerTool("t", {}, async () => {
      if (getTelemetry()) count++;
      return null;
    });
    await server.captured[0].handler({});
    expect(count).toBe(1);
  });

  it("returns undefined from getTelemetry when called outside a handler", () => {
    expect(getTelemetry()).toBeUndefined();
  });

  it("isolates contexts between concurrent tool calls", async () => {
    const server = withMcpTelemetry(new FakeServer());
    const seen: string[] = [];
    server.registerTool("a", {}, async () => {
      await new Promise((r) => setTimeout(r, 10));
      seen.push(getTelemetry()?.toolName ?? "");
      return null;
    });
    server.registerTool("b", {}, async () => {
      seen.push(getTelemetry()?.toolName ?? "");
      return null;
    });
    await Promise.all([
      server.captured[0].handler({}),
      server.captured[1].handler({}),
    ]);
    expect(seen.sort()).toEqual(["a", "b"]);
  });
});
