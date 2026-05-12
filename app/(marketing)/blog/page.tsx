import {
  allBlogPostsSortedDesc,
  curatedBlogSlugs,
} from "@/lib/blog-posts";
import { buildMetadata } from "@/lib/seo";

import BlogCard from "./_components/BlogCard";
import Pagination from "./_components/Pagination";
import {
  BLOG_ARTICLES_PER_PAGE,
  BLOG_CURATED_LEAD_LIMIT,
  BLOG_REVALIDATE_SECONDS,
} from "./_lib/constants";
import { getPageParam } from "./_lib/format";
import { filterUncuratedArticles, getArticlesSafe } from "./_lib/outrank";
import {
  curatedBlogPostToCard,
  outrankArticleToCard,
} from "./_lib/blog-card";

export const revalidate = BLOG_REVALIDATE_SECONDS;

export const metadata = buildMetadata({
  title: "Blog — NotFair",
  description:
    "Guides and explainers on MCP, Google Ads automation, and AI-driven campaign management from the NotFair team.",
  path: "/blog",
  keywords: [
    "NotFair blog",
    "MCP guides",
    "Google Ads AI",
    "Google Ads MCP",
  ],
});

type Props = {
  searchParams: Promise<{
    page?: string;
  }>;
};

// Reduced page size keeps Outrank pagination internally consistent — page 1
// stays exactly PER_PAGE cards (curated lead + Outrank remainder) and page 2+
// land cleanly at Outrank API page boundaries with no skipped articles.
const curatedLead = allBlogPostsSortedDesc.slice(0, BLOG_CURATED_LEAD_LIMIT);
const OUTRANK_PER_PAGE = BLOG_ARTICLES_PER_PAGE - curatedLead.length;

export default async function BlogIndex({ searchParams }: Props) {
  const { page } = await searchParams;
  const currentPage = getPageParam(page);

  const { articles, total_pages } = await getArticlesSafe({
    page: currentPage,
    limit: OUTRANK_PER_PAGE,
  });
  const outrankArticles = filterUncuratedArticles(articles, curatedBlogSlugs);

  const showCurated = currentPage === 1 && curatedLead.length > 0;
  const hasContent = showCurated || outrankArticles.length > 0;

  return (
    <section className="px-4 pb-20 pt-24">
      <div className="container mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
            Blog
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-5xl">
            Guides and explainers
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
            Practical content on MCP, Google Ads automation, and building
            AI-driven ad workflows.
          </p>
        </div>

        {hasContent ? (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {showCurated
              ? curatedLead.map((post) => (
                  <BlogCard
                    key={`curated-${post.slug}`}
                    card={curatedBlogPostToCard(post)}
                  />
                ))
              : null}
            {outrankArticles.map((article) => (
              <BlogCard
                key={`outrank-${article.id}`}
                card={outrankArticleToCard(article)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F] p-10 text-center text-[#C4C0B6]">
            No articles found.
          </div>
        )}

        <Pagination
          basePath="/blog"
          currentPage={currentPage}
          totalPages={total_pages}
        />
      </div>
    </section>
  );
}
