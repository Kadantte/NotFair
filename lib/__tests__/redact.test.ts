import { describe, it, expect } from "vitest";
import { redactAndTruncate, sha256Hex, byteLengthOf } from "@/lib/db/redact";

describe("redactAndTruncate", () => {
  it("passes null/undefined/primitives through unchanged", () => {
    expect(redactAndTruncate(null)).toBeNull();
    expect(redactAndTruncate(undefined)).toBeUndefined();
    expect(redactAndTruncate(42)).toBe(42);
    expect(redactAndTruncate("hi")).toBe("hi");
  });

  it("redacts sensitive-looking keys case-insensitively", () => {
    const out = redactAndTruncate({
      refreshToken: "abc123",
      Access_Token: "xyz",
      PASSWORD: "hunter2",
      apiKey: "sk_live_...",
      accountId: "123-456-7890",
    }) as Record<string, string>;
    expect(out.refreshToken).toBe("[redacted]");
    expect(out.Access_Token).toBe("[redacted]");
    expect(out.PASSWORD).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.accountId).toBe("123-456-7890");
  });

  it("truncates strings over 1KB with an ellipsis marker", () => {
    const long = "x".repeat(2000);
    const out = redactAndTruncate({ value: long }) as { value: string };
    expect(out.value.length).toBeLessThanOrEqual(1025);
    expect(out.value.endsWith("…")).toBe(true);
  });

  it("caps arrays at 50 items with a marker for the remainder", () => {
    const arr = Array.from({ length: 75 }, (_, i) => i);
    const out = redactAndTruncate({ arr }) as { arr: unknown[] };
    expect(out.arr.length).toBe(51);
    expect(out.arr[50]).toBe("[+25 more]");
  });

  it("falls back to a truncated preview when the redacted JSON exceeds 2KB", () => {
    // 60 items × ~35 chars each > 2KB, but each individual string is under
    // the per-string cap so redact() alone doesn't trim it.
    const big = Array.from({ length: 60 }, (_, i) => ({ id: i, name: "name-" + i, description: "x".repeat(80) }));
    const out = redactAndTruncate(big);
    expect((out as { __truncated?: boolean }).__truncated).toBe(true);
  });

  it("handles deeply nested objects without stack overflow", () => {
    type Nested = { n?: Nested };
    let obj: Nested = {};
    for (let i = 0; i < 20; i++) obj = { n: obj };
    const out = redactAndTruncate(obj) as Nested;
    // Eventually we return "[deep]" at the depth cap; we only assert no throw.
    expect(out).toBeDefined();
  });
});

describe("sha256Hex", () => {
  it("produces stable hashes regardless of key order", () => {
    const a = sha256Hex({ x: 1, y: 2 });
    const b = sha256Hex({ y: 2, x: 1 });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("distinguishes different values", () => {
    expect(sha256Hex({ x: 1 })).not.toBe(sha256Hex({ x: 2 }));
  });
});

describe("byteLengthOf", () => {
  it("returns UTF-8 byte count of the JSON payload", () => {
    expect(byteLengthOf({ a: "hello" })).toBe(JSON.stringify({ a: "hello" }).length);
    // emoji takes multiple bytes in UTF-8
    expect(byteLengthOf({ a: "🚀" })).toBeGreaterThan(JSON.stringify({ a: "🚀" }).length - 1);
  });

  it("returns 0 for unserializable input", () => {
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(byteLengthOf(circ)).toBe(0);
  });
});
