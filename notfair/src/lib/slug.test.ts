import { describe, expect, it } from "vitest";

import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases, hyphenates whitespace, and strips punctuation", () => {
    expect(slugify("My Cool Project!")).toEqual({ ok: true, slug: "my-cool-project" });
    expect(slugify("  spaced   out  ")).toEqual({ ok: true, slug: "spaced-out" });
  });

  it("normalizes accented characters to ASCII", () => {
    expect(slugify("Café Über")).toEqual({ ok: true, slug: "cafe-uber" });
  });

  it("collapses runs of separators and trims leading/trailing dashes", () => {
    expect(slugify("--a---b--")).toEqual({ ok: true, slug: "a-b" });
  });

  it("rejects empty input", () => {
    expect(slugify("   ")).toEqual({ ok: false, reason: "input is empty" });
  });

  it("rejects input with no usable characters", () => {
    expect(slugify("!!! ??? ***")).toEqual({
      ok: false,
      reason: "no valid characters",
    });
  });

  it("caps length and strips a dash left dangling by the cut", () => {
    const result = slugify("abcde fghij", 6);
    // "abcde-fghij" cut at 6 is "abcde-" → trailing dash removed.
    expect(result).toEqual({ ok: true, slug: "abcde" });
  });

  it("rejects reserved system names with a suggested variation", () => {
    const result = slugify("NotFair");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("reserved system name");
      expect(result.reason).toContain("notfair-team");
    }
  });
});

describe("isValidSlug", () => {
  it("accepts well-formed non-reserved slugs", () => {
    expect(isValidSlug("my-project-2")).toBe(true);
  });

  it("rejects malformed and reserved slugs", () => {
    expect(isValidSlug("Has Spaces")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("api")).toBe(false);
    expect(isValidSlug("agents")).toBe(false);
  });
});
