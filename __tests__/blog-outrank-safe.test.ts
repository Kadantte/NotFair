import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getArticlesMock = vi.fn();
const getArticleMock = vi.fn();
const getAllArticlesMock = vi.fn();
const getTagArticlesMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("outrank-next-js-blog", () => ({
  BlogClient: class {
    constructor(...args: unknown[]) {
      ctorMock(...args);
    }
    getArticles = getArticlesMock;
    getArticle = getArticleMock;
    getAllArticles = getAllArticlesMock;
    getTagArticles = getTagArticlesMock;
  },
}));

// Stub Next.js cache wrapper so the cached layer doesn't memoize mock results
// across test cases.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

const originalKey = process.env.OUTRANK_BLOG_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.OUTRANK_BLOG_API_KEY;
  } else {
    process.env.OUTRANK_BLOG_API_KEY = originalKey;
  }
});

describe("outrank safe wrappers — missing API key", () => {
  it("returns empty results without instantiating the client", async () => {
    delete process.env.OUTRANK_BLOG_API_KEY;
    const mod = await import("@/app/(marketing)/blog/_lib/outrank");

    expect(await mod.getStaticArticles()).toEqual([]);
    expect(await mod.getArticleSafe("any-slug")).toBeNull();
    expect(await mod.getArticlesSafe()).toMatchObject({
      articles: [],
      total: 0,
      total_pages: 0,
    });
    expect(ctorMock).not.toHaveBeenCalled();
    expect(getArticlesMock).not.toHaveBeenCalled();
  });
});

describe("outrank safe wrappers — runtime errors", () => {
  it("swallows BlogClient throws and returns empty fallbacks", async () => {
    process.env.OUTRANK_BLOG_API_KEY = "test-key";
    getArticlesMock.mockRejectedValue(new Error("network down"));
    getArticleMock.mockRejectedValue(new Error("network down"));
    getAllArticlesMock.mockRejectedValue(new Error("network down"));

    const mod = await import("@/app/(marketing)/blog/_lib/outrank");

    expect(await mod.getStaticArticles()).toEqual([]);
    expect(await mod.getArticleSafe("x")).toBeNull();
    expect(await mod.getArticlesSafe()).toMatchObject({
      articles: [],
      total: 0,
      total_pages: 0,
    });
  });

  it("passes through successful results", async () => {
    process.env.OUTRANK_BLOG_API_KEY = "test-key";
    const sampleArticles = [{ id: 1, slug: "a", tags: [] }];
    getArticlesMock.mockResolvedValue({
      articles: sampleArticles,
      total: 1,
      total_pages: 1,
      page: 1,
      limit: 12,
    });
    getArticleMock.mockResolvedValue(sampleArticles[0]);
    getAllArticlesMock.mockResolvedValue(sampleArticles);

    const mod = await import("@/app/(marketing)/blog/_lib/outrank");

    expect(await mod.getStaticArticles()).toEqual(sampleArticles);
    expect(await mod.getArticleSafe("a")).toEqual(sampleArticles[0]);
    expect((await mod.getArticlesSafe()).articles).toEqual(sampleArticles);
  });

  it("routes tag requests through getTagArticles", async () => {
    process.env.OUTRANK_BLOG_API_KEY = "test-key";
    getTagArticlesMock.mockResolvedValue({
      articles: [],
      total: 0,
      total_pages: 0,
      page: 1,
      limit: 12,
    });

    const mod = await import("@/app/(marketing)/blog/_lib/outrank");
    await mod.getArticlesSafe({ tag: "ads" });

    expect(getTagArticlesMock).toHaveBeenCalledWith("ads", 1, 12);
    expect(getArticlesMock).not.toHaveBeenCalled();
  });
});
