import { notFound } from "next/navigation";
import { LandingPage } from "@/components/marketing/landing-page";
import { getLandingPage, landingPages } from "@/lib/marketing-pages";
import { buildFaqJsonLd, buildMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return Object.keys(landingPages).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getLandingPage(slug);

  if (!page) {
    return {};
  }

  return buildMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
    keywords: page.keywords,
    index: page.index !== false,
  });
}

export default async function MarketingLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getLandingPage(slug);

  if (!page) {
    notFound();
  }

  const faqJsonLd = buildFaqJsonLd(page.faq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingPage page={page} />
    </>
  );
}
