import { describe, expect, it } from "vitest";
import { filterUncuratedArticles } from "@/app/(marketing)/blog/_lib/outrank";

type Article = { slug: string; id: number };

const articles: Article[] = [
  { slug: "collide", id: 1 },
  { slug: "unique-a", id: 2 },
  { slug: "unique-b", id: 3 },
];

describe("filterUncuratedArticles", () => {
  it("drops articles whose slug is in the curated set", () => {
    const result = filterUncuratedArticles(articles, new Set(["collide"]));
    expect(result.map((a) => a.slug)).toEqual(["unique-a", "unique-b"]);
  });

  it("returns all articles when no slug collides", () => {
    const result = filterUncuratedArticles(articles, new Set(["other"]));
    expect(result).toHaveLength(3);
  });

  it("returns all articles when curated set is empty", () => {
    expect(filterUncuratedArticles(articles, new Set())).toHaveLength(3);
  });

  it("returns empty when input is empty", () => {
    expect(filterUncuratedArticles([], new Set(["x"]))).toEqual([]);
  });

  it("drops every article when all slugs collide", () => {
    const allSlugs = new Set(articles.map((a) => a.slug));
    expect(filterUncuratedArticles(articles, allSlugs)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const before = [...articles];
    filterUncuratedArticles(articles, new Set(["collide"]));
    expect(articles).toEqual(before);
  });
});
