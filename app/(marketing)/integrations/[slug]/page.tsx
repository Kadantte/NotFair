import { notFound } from "next/navigation";
import { IntegrationPage } from "@/components/marketing/integration-page";
import {
  allIntegrationSlugs,
  getIntegration,
} from "@/lib/integrations";
import {
  absoluteUrl,
  buildFaqJsonLd,
  buildMetadata,
  safeJsonLd,
  SITE_NAME,
} from "@/lib/seo";

export function generateStaticParams() {
  return allIntegrationSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getIntegration(slug);
  if (!page) return {};

  return buildMetadata({
    title: page.title,
    description: page.description,
    path: `/integrations/${page.slug}`,
    keywords: page.keywords,
  });
}

export default async function IntegrationRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getIntegration(slug);
  if (!page) {
    notFound();
  }

  const faqJsonLd = buildFaqJsonLd(page.faq);
  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Connect ${page.client} to Google Ads with ${SITE_NAME}`,
    description: page.description,
    step: page.setupSteps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
    })),
  };
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${SITE_NAME} Google Ads for ${page.client}`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "Web",
    description: page.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: absoluteUrl(`/integrations/${page.slug}`),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareJsonLd) }}
      />
      <IntegrationPage page={page} />
    </>
  );
}
