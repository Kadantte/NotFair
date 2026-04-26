import { describe, expect, it } from "vitest";
import { typedResult, errorResult } from "./types";

describe("typedResult", () => {
  it("serialises an object into text as pretty JSON", () => {
    const result = typedResult({ a: 1, b: 2 });
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ a: 1, b: 2 }, null, 2) },
    ]);
  });

  it("serialises arrays as JSON arrays in text", () => {
    const result = typedResult([1, 2, 3]);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify([1, 2, 3], null, 2),
    });
  });

  it("renders null and undefined as 'null'", () => {
    expect(typedResult(null).content[0]).toEqual({ type: "text", text: "null" });
    expect(typedResult(undefined).content[0]).toEqual({ type: "text", text: "null" });
  });

  it("renders primitives directly as their string form", () => {
    expect(typedResult(7).content[0]).toEqual({ type: "text", text: "7" });
    expect(typedResult(true).content[0]).toEqual({ type: "text", text: "true" });
    expect(typedResult("hi").content[0]).toEqual({ type: "text", text: "hi" });
  });

  it("uses an explicit summary when provided, ignoring the value", () => {
    const result = typedResult({ foo: "bar" }, "5 campaigns loaded");
    expect(result.content[0]).toEqual({ type: "text", text: "5 campaigns loaded" });
    expect(result.structuredContent).toBeUndefined();
  });

  it("uses the explicit summary for arrays and null too", () => {
    expect(typedResult([1, 2], "custom").content[0]).toEqual({ type: "text", text: "custom" });
    expect(typedResult(null, "empty").content[0]).toEqual({ type: "text", text: "empty" });
  });

  it("preserves nested object shape in the JSON dump", () => {
    const payload = { total: 10, items: [{ id: "1" }, { id: "2" }] };
    const result = typedResult(payload);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify(payload, null, 2),
    });
  });

  it("is generic at the type level — caller controls T", () => {
    interface Sample {
      count: number;
    }
    const result = typedResult<Sample>({ count: 3 });
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ count: 3 }, null, 2),
    });
  });
});

describe("errorResult", () => {
  it("marks isError and surfaces the message", () => {
    const result = errorResult(new Error("boom"));
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "boom" });
  });
});
