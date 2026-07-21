import { describe, expect, it } from "vitest";

import { labelFromArgs } from "./label-args";

describe("labelFromArgs", () => {
  it("returns undefined for absent or empty args", () => {
    expect(labelFromArgs(undefined)).toBeUndefined();
    expect(labelFromArgs(null)).toBeUndefined();
    expect(labelFromArgs({})).toBeUndefined();
  });

  it("prefers a well-known string key over the k=v digest", () => {
    expect(labelFromArgs({ campaign_id: 1, query: "SELECT 1" })).toBe("SELECT 1");
  });

  it("respects the priority order of string keys (file_path before url)", () => {
    expect(labelFromArgs({ url: "https://x.test", file_path: "/tmp/a.txt" })).toBe(
      "/tmp/a.txt",
    );
  });

  it("takes only the first line of a multi-line value and trims it", () => {
    expect(labelFromArgs({ sql: "  SELECT *\nFROM t  " })).toBe("SELECT *");
  });

  it("clips long values to 160 chars with an ellipsis", () => {
    const label = labelFromArgs({ command: "x".repeat(200) })!;
    expect(label).toHaveLength(160);
    expect(label.endsWith("…")).toBe(true);
    expect(label.slice(0, 159)).toBe("x".repeat(159));
  });

  it("skips whitespace-only string keys and falls through to the digest", () => {
    expect(labelFromArgs({ query: "   ", limit: 5 })).toBe("limit=5");
  });

  it("builds a k=v digest from primitive args", () => {
    expect(
      labelFromArgs({ campaign_id: 12345, dry_run: true, note: "hi" }),
    ).toBe("campaign_id=12345  dry_run=true  note=hi");
  });

  it("skips null/undefined and non-primitive values in the digest", () => {
    expect(
      labelFromArgs({ a: null, b: undefined, c: { nested: 1 }, d: [1], e: 7 }),
    ).toBe("e=7");
  });

  it("stops the digest after four parts", () => {
    const label = labelFromArgs({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    expect(label).toBe("a=1  b=2  c=3  d=4");
  });

  it("clips individual digest string values to 40 chars", () => {
    const label = labelFromArgs({ note: "y".repeat(50) })!;
    expect(label).toBe(`note=${"y".repeat(39)}…`);
  });

  it("returns undefined when args hold only non-labelable values", () => {
    expect(labelFromArgs({ a: null, b: { x: 1 }, c: "  " })).toBeUndefined();
  });
});
