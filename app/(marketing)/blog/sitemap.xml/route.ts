import { allBlogPosts, curatedBlogSlugs } from "@/lib/blog-posts";
import { SITE_URL } from "@/lib/seo";

import { BLOG_REVALIDATE_SECONDS } from "../_lib/constants";
import { filterUncuratedArticles, getStaticArticles } from "../_lib/outrank";

// Next.js's nested `sitemap.ts` metadata convention loses routing precedence
// to a sibling dynamic `[slug]` segment in production — /blog/sitemap.xml
// matches `[slug]` and 404s. Explicit route handler bypasses the collision.
export const revalidate = BLOG_REVALIDATE_SECONDS;

const BLOG_INDEX_PRIORITY = "0.8";
const BLOG_ARTICLE_PRIORITY = "0.7";

type SitemapEntry = {
  loc: string;
  lastmod: string;
  changefreq: "daily" | "monthly";
  priority: string;
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const renderEntry = (entry: SitemapEntry): string =>
  `<url><loc>${escapeXml(entry.loc)}</loc><lastmod>${entry.lastmod}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`;

const toIso = (input: string | null | undefined): string => {
  const parsed = new Date(input ?? "");
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
};

export async function GET() {
  const outrankArticles = filterUncuratedArticles(
    await getStaticArticles(),
    curatedBlogSlugs,
  );

  const entries: SitemapEntry[] = [
    {
      loc: new URL("/blog", SITE_URL).toString(),
      lastmod: new Date().toISOString(),
      changefreq: "daily",
      priority: BLOG_INDEX_PRIORITY,
    },
    ...allBlogPosts.map((post) => ({
      loc: new URL(`/blog/${post.slug}`, SITE_URL).toString(),
      lastmod: toIso(post.updatedAt),
      changefreq: "monthly" as const,
      priority: BLOG_ARTICLE_PRIORITY,
    })),
    ...outrankArticles.map((article) => ({
      loc: new URL(`/blog/${article.slug}`, SITE_URL).toString(),
      lastmod: toIso(article.updated_at || article.created_at),
      changefreq: "daily" as const,
      priority: BLOG_ARTICLE_PRIORITY,
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(renderEntry).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=0, s-maxage=${BLOG_REVALIDATE_SECONDS}, stale-while-revalidate=${BLOG_REVALIDATE_SECONDS}`,
    },
  });
}
