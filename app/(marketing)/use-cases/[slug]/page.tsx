import { notFound } from "next/navigation";
import { LongFormPage } from "@/components/marketing/long-form-page";
import {
  allUseCaseSlugs,
  getUseCasePage,
} from "@/lib/long-form-pages";
import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  buildMetadata,
  safeJsonLd,
} from "@/lib/seo";

export function generateStaticParams() {
  return allUseCaseSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getUseCasePage(slug);
  if (!page) return {};

  return buildMetadata({
    title: page.title,
    description: page.description,
    path: `/use-cases/${page.slug}`,
    keywords: page.keywords,
  });
}

export default async function UseCaseRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getUseCasePage(slug);
  if (!page) {
    notFound();
  }

  const faqJsonLd = buildFaqJsonLd(page.faq);
  const articleJsonLd = buildArticleJsonLd({
    path: `/use-cases/${page.slug}`,
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
