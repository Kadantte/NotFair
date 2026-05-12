import type { Metadata } from "next";

import BlogCard from "../../_components/BlogCard";
import Pagination from "../../_components/Pagination";
import { outrankArticleToCard } from "../../_lib/blog-card";
import { BLOG_ARTICLES_PER_PAGE } from "../../_lib/constants";
import { getPageParam } from "../../_lib/format";
import { getArticlesSafe, getStaticArticles } from "../../_lib/outrank";

// Must be a literal — see comment in app/(marketing)/blog/page.tsx.
export const revalidate = 60;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export const generateStaticParams = async () => {
  const articles = await getStaticArticles();
  const tags = new Set(articles.flatMap((article) => article.tags));
  return Array.from(tags).map((tag) => ({
    slug: encodeURIComponent(tag),
  }));
};

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { slug } = await params;
  const tag = decodeURIComponent(slug);

  return {
    title: `#${tag} — NotFair Blog`,
    description: `Articles tagged with ${tag}.`,
  };
};

export default async function TagPage({ params, searchParams }: Props) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const currentPage = getPageParam(resolvedSearchParams.page);
  const tag = decodeURIComponent(slug);

  const { articles, total, total_pages } = await getArticlesSafe({
    page: currentPage,
    limit: BLOG_ARTICLES_PER_PAGE,
    tag,
  });

  return (
    <section className="px-4 pb-20 pt-24">
      <div className="container mx-auto max-w-5xl">
        <header className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
            Tag
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-5xl">
            #{tag}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
            {total} {total === 1 ? "article" : "articles"}
          </p>
        </header>

        {articles.length ? (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <BlogCard
                key={article.id}
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
          basePath={`/blog/tag/${encodeURIComponent(tag)}`}
          currentPage={currentPage}
          totalPages={total_pages}
        />
      </div>
    </section>
  );
}
