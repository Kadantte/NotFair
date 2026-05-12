import type { MetadataRoute } from "next";

import { allBlogPosts, curatedBlogSlugs } from "@/lib/blog-posts";
import { SITE_URL } from "@/lib/seo";

import { BLOG_REVALIDATE_SECONDS } from "./_lib/constants";
import { filterUncuratedArticles, getStaticArticles } from "./_lib/outrank";

export const revalidate = BLOG_REVALIDATE_SECONDS;

const BLOG_INDEX_PRIORITY = 0.8;
const BLOG_ARTICLE_PRIORITY = 0.7;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const outrankArticles = filterUncuratedArticles(
    await getStaticArticles(),
    curatedBlogSlugs,
  );

  return [
    {
      url: new URL("/blog", SITE_URL).toString(),
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: BLOG_INDEX_PRIORITY,
    },
    ...allBlogPosts.map((post) => ({
      url: new URL(`/blog/${post.slug}`, SITE_URL).toString(),
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: BLOG_ARTICLE_PRIORITY,
    })),
    ...outrankArticles.map((article) => ({
      url: new URL(`/blog/${article.slug}`, SITE_URL).toString(),
      lastModified: new Date(article.updated_at || article.created_at),
      changeFrequency: "daily" as const,
      priority: BLOG_ARTICLE_PRIORITY,
    })),
  ];
}
