import { describe, expect, it } from "vitest";
import {
  formatDate,
  getPageParam,
} from "@/app/(marketing)/blog/_lib/format";
import { BLOG_DEFAULT_PAGE } from "@/app/(marketing)/blog/_lib/constants";

describe("getPageParam", () => {
  it.each<[label: string, input: string | string[] | undefined, expected: number]>([
    ["undefined", undefined, BLOG_DEFAULT_PAGE],
    ["empty string", "", BLOG_DEFAULT_PAGE],
    ["zero", "0", BLOG_DEFAULT_PAGE],
    ["negative", "-3", BLOG_DEFAULT_PAGE],
    ["NaN string", "abc", BLOG_DEFAULT_PAGE],
    ["valid", "5", 5],
    ["array form takes first", ["7", "9"], 7],
    ["array with NaN first", ["abc", "9"], BLOG_DEFAULT_PAGE],
    ["float truncates", "3.9", 3],
    ["leading whitespace", "  4", 4],
    ["scientific notation parses to int part", "1e3", 1],
  ])("returns %s → %s", (_label, input, expected) => {
    expect(getPageParam(input)).toBe(expected);
  });
});

describe("formatDate", () => {
  it("formats ISO date with long month", () => {
    expect(formatDate("2026-05-12T00:00:00Z")).toMatch(/May/);
  });

  it("returns the original string on invalid input instead of throwing", () => {
    expect(() => formatDate("not-a-date")).not.toThrow();
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("handles empty string without throwing", () => {
    expect(() => formatDate("")).not.toThrow();
  });
});
