import type { Metadata } from "next";

export const SITE_NAME = "AdsAgent";
export const SITE_URL = "https://adsagent.ai";
export const DEFAULT_OG_IMAGE = "/opengraph-image";
export const SITE_DESCRIPTION =
  "AdsAgent is an AI Google Ads agent and Google Ads MCP server that lets you connect Google Ads to Claude, ChatGPT-style MCP workflows, and OpenClaw.";
export const SITE_KEYWORDS = [
  "AI Google Ads agent",
  "Google Ads MCP",
  "Google Ads MCP server",
  "connect Google Ads to Claude",
  "connect Google Ads to ChatGPT",
  "connect Google Ads to OpenClaw",
  "Google Ads AI agent",
  "Google Ads automation",
  "Google Ads optimization",
  "Google Ads impact tracking",
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
    title,
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
        "Connect Google Ads to Claude, ChatGPT-style MCP clients, or OpenClaw so an AI agent can analyze campaigns, recommend optimizations, and track impact.",
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
