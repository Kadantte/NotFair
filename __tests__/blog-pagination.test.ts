import { describe, expect, it } from "vitest";
import {
  getPageHref,
  getPaginationItems,
} from "@/app/(marketing)/blog/_lib/pagination";

const shape = (items: ReturnType<typeof getPaginationItems>) =>
  items.map((i) => (i.type === "page" ? i.page : i.key));

describe("getPaginationItems", () => {
  it("returns [1] for single page (component still renders nothing)", () => {
    expect(shape(getPaginationItems(1, 1))).toEqual([1]);
  });

  it("returns [1, 2] for two pages", () => {
    expect(shape(getPaginationItems(1, 2))).toEqual([1, 2]);
  });

  it("shows all pages for small range", () => {
    expect(shape(getPaginationItems(2, 3))).toEqual([1, 2, 3]);
  });

  it("inserts only end ellipsis when current near start", () => {
    expect(shape(getPaginationItems(2, 10))).toEqual([
      1,
      2,
      3,
      "end-ellipsis",
      10,
    ]);
  });

  it("inserts only start ellipsis when current near end", () => {
    expect(shape(getPaginationItems(9, 10))).toEqual([
      1,
      "start-ellipsis",
      8,
      9,
      10,
    ]);
  });

  it("inserts both ellipses when current is in middle", () => {
    expect(shape(getPaginationItems(5, 10))).toEqual([
      1,
      "start-ellipsis",
      4,
      5,
      6,
      "end-ellipsis",
      10,
    ]);
  });

  it("uses distinct keys for start vs end ellipsis (no React duplicate-key warning)", () => {
    const items = getPaginationItems(5, 10);
    const keys = items
      .filter((i) => i.type === "ellipsis")
      .map((i) => (i.type === "ellipsis" ? i.key : ""));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getPageHref", () => {
  it("omits query for default page", () => {
    expect(getPageHref("/blog", 1)).toBe("/blog");
  });

  it("appends ?page=N for non-default page", () => {
    expect(getPageHref("/blog", 3)).toBe("/blog?page=3");
  });

  it("preserves nested base paths", () => {
    expect(getPageHref("/blog/tag/foo", 2)).toBe("/blog/tag/foo?page=2");
  });
});
