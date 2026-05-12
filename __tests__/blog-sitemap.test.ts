import { beforeEach, describe, expect, it, vi } from "vitest";

const getStaticArticlesMock = vi.fn();

vi.mock("@/lib/blog-posts", async () => {
  const allBlogPosts = [
    {
      slug: "curated-a",
      updatedAt: "2026-01-01",
      publishedAt: "2026-01-01",
    },
    {
      slug: "collide",
      updatedAt: "2026-01-02",
      publishedAt: "2026-01-02",
    },
  ];
  return {
    allBlogPosts,
    curatedBlogSlugs: new Set(allBlogPosts.map((p) => p.slug)),
  };
});

vi.mock("@/app/(marketing)/blog/_lib/outrank", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/(marketing)/blog/_lib/outrank")
  >("@/app/(marketing)/blog/_lib/outrank");
  return {
    ...actual,
    getStaticArticles: getStaticArticlesMock,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("blog sitemap", () => {
  it("shadows outrank article when slug collides with curated", async () => {
    getStaticArticlesMock.mockResolvedValue([
      { slug: "collide", created_at: "2026-02-01", updated_at: null },
      {
        slug: "outrank-only",
        created_at: "2026-02-02",
        updated_at: "2026-03-01",
      },
    ]);
    const mod = await import("@/app/(marketing)/blog/sitemap");
    const entries = await mod.default();
    const urls = entries.map((e) => e.url);

    expect(urls.filter((u) => u.endsWith("/blog/collide"))).toHaveLength(1);
    expect(urls.some((u) => u.endsWith("/blog/outrank-only"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/blog/curated-a"))).toBe(true);
  });

  it("falls back to curated-only when outrank returns empty", async () => {
    getStaticArticlesMock.mockResolvedValue([]);
    const mod = await import("@/app/(marketing)/blog/sitemap");
    const entries = await mod.default();

    expect(entries.some((e) => e.url.endsWith("/blog"))).toBe(true);
    expect(entries.some((e) => e.url.endsWith("/blog/curated-a"))).toBe(true);
    // No outrank-only entries when source is empty
    expect(entries.filter((e) => e.url.match(/outrank/i))).toHaveLength(0);
  });

  it("uses created_at as fallback when updated_at is null", async () => {
    getStaticArticlesMock.mockResolvedValue([
      { slug: "no-updated", created_at: "2026-02-01", updated_at: null },
    ]);
    const mod = await import("@/app/(marketing)/blog/sitemap");
    const entries = await mod.default();
    const entry = entries.find((e) => e.url.endsWith("/blog/no-updated"));

    expect(entry).toBeDefined();
    expect((entry?.lastModified as Date).toISOString()).toContain(
      "2026-02-01",
    );
  });

  it("always emits the blog index entry", async () => {
    getStaticArticlesMock.mockResolvedValue([]);
    const mod = await import("@/app/(marketing)/blog/sitemap");
    const entries = await mod.default();
    const indexEntry = entries.find((e) => e.url.endsWith("/blog"));

    expect(indexEntry).toBeDefined();
    expect(indexEntry?.priority).toBe(0.8);
  });
});
