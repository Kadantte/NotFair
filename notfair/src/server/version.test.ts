import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _resetLatestCache,
  getLatestVersion,
  isSemverGreater,
} from "@/server/version";

afterEach(() => {
  _resetLatestCache();
  vi.unstubAllGlobals();
});

describe("getLatestVersion", () => {
  it("queries the lowercase npm package name (the registry is case-sensitive)", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const latest = await getLatestVersion(true);
    expect(latest).toBe("9.9.9");
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://registry.npmjs.org/notfair/latest",
    );
  });

  it("returns null on registry errors instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await getLatestVersion(true)).toBeNull();
  });
});

describe("isSemverGreater", () => {
  it("orders by major.minor.patch and ignores pre-release suffixes", () => {
    expect(isSemverGreater("0.9.7", "0.9.6")).toBe(true);
    expect(isSemverGreater("0.10.0", "0.9.9")).toBe(true);
    expect(isSemverGreater("1.0.0", "0.99.99")).toBe(true);
    expect(isSemverGreater("0.9.6", "0.9.6")).toBe(false);
    expect(isSemverGreater("0.9.5", "0.9.6")).toBe(false);
    expect(isSemverGreater("0.9.7-beta.1", "0.9.6")).toBe(true);
  });
});
