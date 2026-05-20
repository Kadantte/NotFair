import { notFound } from "next/navigation";
import { VerticalAuditPageView } from "@/components/marketing/vertical-audit-page";
import { buildFaqJsonLd, buildMetadata } from "@/lib/seo";
import {
  allVerticalAuditPages,
  getVerticalAuditPage,
} from "@/lib/vertical-audit-pages";

export function generateStaticParams() {
  return allVerticalAuditPages.map((page) => ({ industry: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>;
}) {
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

  const faqJsonLd = buildFaqJsonLd(page.faq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <VerticalAuditPageView page={page} />
    </>
  );
}
