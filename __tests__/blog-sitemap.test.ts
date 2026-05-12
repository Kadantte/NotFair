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

const fetchSitemapXml = async () => {
  const mod = await import("@/app/(marketing)/blog/sitemap.xml/route");
  const response = await mod.GET();
  return response.text();
};

describe("blog sitemap route", () => {
  it("shadows outrank article when slug collides with curated", async () => {
    getStaticArticlesMock.mockResolvedValue([
      { slug: "collide", created_at: "2026-02-01", updated_at: null },
      {
        slug: "outrank-only",
        created_at: "2026-02-02",
        updated_at: "2026-03-01",
      },
    ]);

    const xml = await fetchSitemapXml();
    const collideMatches = xml.match(/\/blog\/collide</g) ?? [];

    expect(collideMatches).toHaveLength(1);
    expect(xml).toContain("/blog/outrank-only<");
    expect(xml).toContain("/blog/curated-a<");
  });

  it("falls back to curated-only when outrank returns empty", async () => {
    getStaticArticlesMock.mockResolvedValue([]);

    const xml = await fetchSitemapXml();

    expect(xml).toContain("<loc>https://notfair.co/blog</loc>");
    expect(xml).toContain("/blog/curated-a<");
    expect(xml).not.toMatch(/outrank/i);
  });

  it("uses created_at as fallback when updated_at is null", async () => {
    getStaticArticlesMock.mockResolvedValue([
      { slug: "no-updated", created_at: "2026-02-01", updated_at: null },
    ]);

    const xml = await fetchSitemapXml();

    expect(xml).toMatch(
      /<loc>https:\/\/notfair\.co\/blog\/no-updated<\/loc><lastmod>2026-02-01/,
    );
  });

  it("always emits the blog index entry with priority 0.8", async () => {
    getStaticArticlesMock.mockResolvedValue([]);

    const xml = await fetchSitemapXml();

    expect(xml).toMatch(
      /<loc>https:\/\/notfair\.co\/blog<\/loc>[\s\S]*?<priority>0\.8<\/priority>/,
    );
  });

  it("serves application/xml with the sitemap urlset wrapper", async () => {
    getStaticArticlesMock.mockResolvedValue([]);

    const mod = await import("@/app/(marketing)/blog/sitemap.xml/route");
    const response = await mod.GET();

    expect(response.headers.get("content-type")).toMatch(/application\/xml/);
    const body = await response.text();
    expect(body).toMatch(/^<\?xml version="1\.0"/);
    expect(body).toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
  });
});
