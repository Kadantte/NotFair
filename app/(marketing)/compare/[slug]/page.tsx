import { notFound } from "next/navigation";
import { LongFormPage } from "@/components/marketing/long-form-page";
import {
  allCompareSlugs,
  getComparePage,
} from "@/lib/long-form-pages";
import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  buildMetadata,
  safeJsonLd,
} from "@/lib/seo";

export function generateStaticParams() {
  return allCompareSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getComparePage(slug);
  if (!page) return {};

  return buildMetadata({
    title: page.title,
    description: page.description,
    path: `/compare/${page.slug}`,
    keywords: page.keywords,
  });
}

export default async function CompareRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getComparePage(slug);
  if (!page) {
    notFound();
  }

  const faqJsonLd = buildFaqJsonLd(page.faq);
  const articleJsonLd = buildArticleJsonLd({
    path: `/compare/${page.slug}`,
    headline: page.heroTitle,
    description: page.description,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
      />
      <LongFormPage page={page} />
    </>
  );
}
