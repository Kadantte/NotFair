import { describe, expect, it } from "vitest";
import { typedResult, errorResult } from "./types";

describe("typedResult", () => {
  it("puts an object into structuredContent and generates a field-count summary", () => {
    const result = typedResult({ a: 1, b: 2 });
    expect(result.structuredContent).toEqual({ a: 1, b: 2 });
    expect(result.content).toEqual([{ type: "text", text: "2 fields" }]);
  });

  it("singularises the field count when there is one key", () => {
    const result = typedResult({ a: 1 });
    expect(result.content[0]).toEqual({ type: "text", text: "1 field" });
  });

  it("wraps arrays as { items } and summarises with item count", () => {
    const result = typedResult([1, 2, 3]);
    expect(result.structuredContent).toEqual({ items: [1, 2, 3] });
    expect(result.content[0]).toEqual({ type: "text", text: "3 items" });
  });

  it("singularises the item count for a single-element array", () => {
    const result = typedResult([42]);
    expect(result.content[0]).toEqual({ type: "text", text: "1 item" });
  });

  it("omits structuredContent when value is null and summarises as 'null'", () => {
    const result = typedResult(null);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "null" });
  });

  it("omits structuredContent when value is undefined", () => {
    const result = typedResult(undefined);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "null" });
  });

  it("wraps primitives as { value }", () => {
    const result = typedResult(7);
    expect(result.structuredContent).toEqual({ value: 7 });
    expect(result.content[0]).toEqual({ type: "text", text: "7" });
  });

  it("uses an explicit summary when provided", () => {
    const result = typedResult({ foo: "bar" }, "5 campaigns loaded");
    expect(result.content[0]).toEqual({ type: "text", text: "5 campaigns loaded" });
    expect(result.structuredContent).toEqual({ foo: "bar" });
  });

  it("uses the explicit summary even for arrays and primitives", () => {
    expect(typedResult([1, 2], "custom").content[0]).toEqual({
      type: "text",
      text: "custom",
    });
    expect(typedResult(null, "empty").content[0]).toEqual({
      type: "text",
      text: "empty",
    });
  });

  it("preserves nested object shape without coercion", () => {
    const payload = { total: 10, items: [{ id: "1" }, { id: "2" }] };
    const result = typedResult(payload);
    expect(result.structuredContent).toBe(payload);
  });

  it("is generic at the type level — caller controls T", () => {
    interface Sample {
      count: number;
    }
    const result = typedResult<Sample>({ count: 3 });
    // Runtime assertion that mirrors the type contract.
    expect((result.structuredContent as unknown as Sample).count).toBe(3);
  });
});

describe("errorResult", () => {
  it("marks isError and surfaces the message", () => {
    const result = errorResult(new Error("boom"));
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "boom" });
  });
});
