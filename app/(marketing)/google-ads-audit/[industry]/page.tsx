import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildFaqJsonLd, buildMetadata, SITE_NAME, SITE_URL } from "@/lib/seo";
import {
  getVerticalAuditPage,
  verticalAuditPages,
} from "@/lib/vertical-audit-pages";
import { VerticalAuditPageView } from "@/components/marketing/vertical-audit-page";

export function generateStaticParams() {
  return Object.keys(verticalAuditPages).map((industry) => ({ industry }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>;
}): Promise<Metadata> {
  const { industry } = await params;
  const page = getVerticalAuditPage(industry);

  if (!page) {
    return {};
  }

  return buildMetadata({
    title: page.title,
    description: page.description,
    path: `/google-ads-audit/${page.slug}`,
    keywords: page.keywords,
  });
}

export default async function VerticalAuditRoute({
  params,
}: {
  params: Promise<{ industry: string }>;
}) {
  const { industry } = await params;
  const page = getVerticalAuditPage(industry);

  if (!page) {
    notFound();
  }

  const pageUrl = new URL(`/google-ads-audit/${page.slug}`, SITE_URL).toString();

  const faqJsonLd = buildFaqJsonLd(page.faq);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    mainEntityOfPage: pageUrl,
    url: pageUrl,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: new URL("/opengraph-image", SITE_URL).toString(),
      },
    },
    about: page.industry,
    datePublished: "2026-04-22",
    dateModified: "2026-04-22",
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Google Ads Audit",
        item: new URL("/google-ads-audit", SITE_URL).toString(),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: page.industry,
        item: pageUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <VerticalAuditPageView page={page} />
    </>
  );
}
