import { unstable_cache } from "next/cache";
import { BlogClient, type Article } from "outrank-next-js-blog";

import { getEnv, getRequiredEnv } from "@/lib/env";

import {
  BLOG_ARTICLES_PER_PAGE,
  BLOG_DEFAULT_PAGE,
  BLOG_REVALIDATE_SECONDS,
  BLOG_SITEMAP_PAGE_SIZE,
} from "./constants";

type GetArticlesParams = {
  page?: number;
  limit?: number;
  tag?: string;
};

const OUTRANK_API_BASE_URL = "https://outrank.so";

let client: BlogClient | null = null;
const getClient = () =>
  (client ??= new BlogClient(getRequiredEnv("OUTRANK_BLOG_API_KEY"), {
    baseUrl: OUTRANK_API_BASE_URL,
  }));

const isOutrankConfigured = () => Boolean(getEnv("OUTRANK_BLOG_API_KEY"));

const getArticlesByParams = unstable_cache(
  async (page: number, limit: number, tag: string) => {
    const c = getClient();
    return tag ? c.getTagArticles(tag, page, limit) : c.getArticles(page, limit);
  },
  ["outrank-blog-articles"],
  { revalidate: BLOG_REVALIDATE_SECONDS },
);

const getArticleCached = unstable_cache(
  async (slug: string): Promise<Article | null> => getClient().getArticle(slug),
  ["outrank-blog-article"],
  { revalidate: BLOG_REVALIDATE_SECONDS },
);

const getAllArticlesCached = unstable_cache(
  async (): Promise<Article[]> =>
    getClient().getAllArticles(BLOG_SITEMAP_PAGE_SIZE),
  ["outrank-blog-all-articles"],
  { revalidate: BLOG_REVALIDATE_SECONDS },
);

// Outrank is optional infrastructure: a missing key or unreachable API must
// never break the blog — curated posts still render and the sitemap still
// emits curated entries.
const withOutrankFallback = async <T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> => {
  if (!isOutrankConfigured()) return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

export const getStaticArticles = (): Promise<Article[]> =>
  withOutrankFallback(getAllArticlesCached, []);

export const getArticleSafe = (slug: string): Promise<Article | null> =>
  withOutrankFallback(() => getArticleCached(slug), null);

export const getArticlesSafe = ({
  page = BLOG_DEFAULT_PAGE,
  limit = BLOG_ARTICLES_PER_PAGE,
  tag,
}: GetArticlesParams = {}) =>
  withOutrankFallback(() => getArticlesByParams(page, limit, tag || ""), {
    articles: [],
    total: 0,
    total_pages: 0,
    page,
    limit,
  });

export const filterUncuratedArticles = <T extends { slug: string }>(
  articles: T[],
  curatedSlugs: ReadonlySet<string>,
): T[] => articles.filter((a) => !curatedSlugs.has(a.slug));
