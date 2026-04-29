import type { Metadata } from "next";
import { BRAND_NAME, BRAND_URL } from "@/lib/brand";

export const SITE_NAME = BRAND_NAME;
export const SITE_URL = BRAND_URL;
export const DEFAULT_OG_IMAGE = "/opengraph-image";
export const SITE_DESCRIPTION = `${BRAND_NAME} is the Google Ads execution layer for Claude. Connect your ad account, draft campaign edits in natural language, and approve every write before it reaches Google Ads.`;
export const SITE_KEYWORDS = [
  "Google Ads MCP server",
  "Google Ads MCP",
  "connect Google Ads to Claude",
  "Claude Google Ads",
  "AI Google Ads agent",
  "Google Ads AI agent",
  "Google Ads automation",
  "Google Ads optimization",
  "Claude Code Google Ads",
  "MCP server for Claude",
];

type MetadataInput = {
  title: string;
  description?: string;
  path?: string;
  keywords?: string[];
  category?: string;
  index?: boolean;
};

export function buildMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
  keywords = SITE_KEYWORDS,
  category = "marketing",
  index = true,
}: MetadataInput): Metadata {
  const canonical = new URL(path, SITE_URL).toString();

  return {
    title: { absolute: title },
    description,
    keywords,
    category,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          alt: `${SITE_NAME} logo`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    robots: {
      index,
      follow: true,
      googleBot: {
        index,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export function buildHomepageJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: new URL(DEFAULT_OG_IMAGE, SITE_URL).toString(),
      sameAs: [SITE_URL],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Google Ads Management Software",
      operatingSystem: "Web",
      description:
        "The Google Ads execution layer for Claude. Draft keyword, ad, budget, and negative changes in natural language, then approve every write before it reaches Google Ads.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      url: SITE_URL,
    },
  ];
}

export type FaqItem = {
  question: string;
  answer: string;
};

export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
