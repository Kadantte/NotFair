import DOMPurify from "isomorphic-dompurify";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlogPostPage } from "@/components/marketing/blog-post";
import {
  allBlogPosts,
  curatedBlogSlugs,
  getBlogPost,
} from "@/lib/blog-posts";
import {
  buildBlogPostingJsonLd,
  buildFaqJsonLd,
  buildMetadata,
  safeJsonLd,
} from "@/lib/seo";

import styles from "../_components/ArticleContent.module.css";
import { formatDate } from "../_lib/format";
import {
  filterUncuratedArticles,
  getArticleSafe,
  getStaticArticles,
} from "../_lib/outrank";

// Must be a literal — see comment in app/(marketing)/blog/page.tsx.
export const revalidate = 86400;

type Props = {
  params: Promise<{ slug: string }>;
};

// Curated posts are SEO anchors — they must never be silently replaced if
// Outrank later publishes an article with a colliding slug. Curated always
// shadows Outrank, both here and at the route handler.
export async function generateStaticParams() {
  const outrankArticles = filterUncuratedArticles(
    await getStaticArticles(),
    curatedBlogSlugs,
  );
  return [
    ...allBlogPosts.map((p) => ({ slug: p.slug })),
    ...outrankArticles.map((a) => ({ slug: a.slug })),
  ];
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;

  const curated = getBlogPost(slug);
  if (curated) {
    return buildMetadata({
      title: curated.seoTitle,
      description: curated.description,
      path: `/blog/${curated.slug}`,
      keywords: curated.keywords,
    });
  }

  const article = await getArticleSafe(slug);
  if (article) {
    return buildMetadata({
      title: article.title,
      description: article.meta_description,
      path: `/blog/${article.slug}`,
    });
  }

  return {};
}

export default async function BlogPostRoute({ params }: Props) {
  const { slug } = await params;

  const curated = getBlogPost(slug);
  if (curated) {
    const blogJsonLd = buildBlogPostingJsonLd({
      slug: curated.slug,
      title: curated.title,
      description: curated.description,
      datePublished: curated.publishedAt,
      dateModified: curated.updatedAt,
      keywords: curated.keywords,
      authorName: curated.author.name,
    });
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(blogJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(buildFaqJsonLd(curated.faq)),
          }}
        />
        <BlogPostPage post={curated} />
      </>
    );
  }

  const article = await getArticleSafe(slug);
  if (!article) notFound();

  const articleJsonLd = buildBlogPostingJsonLd({
    slug: article.slug,
    title: article.title,
    description: article.meta_description,
    datePublished: article.created_at,
    dateModified: article.updated_at || article.created_at,
    imageUrl: article.image_url,
    keywords: article.tags,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
      />
      <main className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
        <Link
          href="/blog"
          prefetch
          className="inline-flex items-center rounded-full border border-[#3D3C36] bg-[#24231F] px-4 py-2 text-sm font-medium text-[#E8E4DD] transition-colors hover:border-[#4CAF6E]/40 hover:text-[#4CAF6E]"
        >
          ← Back to blog
        </Link>

        <article className="mt-10">
          <header className="mx-auto mb-10 max-w-4xl">
            {article.tags.length ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/blog/tag/${encodeURIComponent(tag)}`}
                    className="rounded-full border border-[#3D3C36] bg-[#2E2D28] px-3 py-1 text-xs font-medium text-[#C4C0B6] transition-colors hover:border-[#4CAF6E]/40 hover:text-[#4CAF6E]"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}
            <h1 className="text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-5xl">
              {article.title}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-[#C4C0B6] md:text-lg">
              {article.meta_description}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-medium text-[#C4C0B6]">
              <time dateTime={article.created_at}>
                {formatDate(article.created_at)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{article.reading_time_minutes} min read</span>
            </div>
          </header>

          {article.image_url ? (
            <div className="relative mx-auto mb-12 aspect-[16/9] max-w-4xl overflow-hidden rounded-lg border border-[#3D3C36] bg-[#24231F]">
              <Image
                src={article.image_url}
                alt={article.title}
                fill
                priority
                sizes="(min-width: 768px) 896px, 100vw"
                className="object-cover"
              />
            </div>
          ) : null}

          <div
            className={styles.articleContent}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(article.html, {
                USE_PROFILES: { html: true },
                FORBID_TAGS: ["style", "form", "input", "button", "textarea"],
                FORBID_ATTR: ["style"],
              }),
            }}
          />
        </article>
      </main>
    </>
  );
}
