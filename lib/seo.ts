import type { Metadata } from "next";

export const SITE_NAME = "AdsAgent";
export const SITE_URL = "https://adsagent.org";
export const DEFAULT_OG_IMAGE = "/opengraph-image";
export const SITE_DESCRIPTION =
  "AdsAgent is the Google Ads MCP server built for Claude. Connect your ad account to Claude Code or Claude Cowork and let AI analyze campaigns, optimize spend, and manage changes.";
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
        "The Google Ads MCP server built for Claude. Connect your ad account to Claude Code or Cowork and let AI analyze campaigns, optimize spend, and manage changes.",
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
