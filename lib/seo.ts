import type { Metadata } from "next";
import { BRAND_NAME, BRAND_URL } from "@/lib/brand";

export const SITE_NAME = BRAND_NAME;
export const SITE_URL = BRAND_URL;
export const DEFAULT_OG_IMAGE = "/opengraph-image";
export const SITE_DESCRIPTION = `${BRAND_NAME} is the Google Ads diagnosis and execution layer for Claude. Connect your ad account, find issues, draft fixes in natural language, and approve every write before it reaches Google Ads.`;
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
        "The Google Ads diagnosis and execution layer for Claude. Find account issues, draft keyword, ad, budget, and negative fixes in natural language, then approve every write before it reaches Google Ads.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      url: SITE_URL,
    },
  ];
}

export type BlogPostingJsonLdInput = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  imageUrl?: string | null;
  keywords?: string[];
  authorName?: string;
};

export function buildBlogPostingJsonLd(input: BlogPostingJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    author: {
      "@type": "Organization",
      name: input.authorName ?? SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": new URL(`/blog/${input.slug}`, SITE_URL).toString(),
    },
    ...(input.keywords?.length
      ? { keywords: input.keywords.join(", ") }
      : {}),
  };
}

export type FaqItem = {
  question: string;
  answer: string;
};

// JSON.stringify does NOT escape `</` — any attacker-controlled string field
// containing `</script>` would close the <script type="application/ld+json">
// block and let arbitrary HTML follow. Escape `<` to `<` (and U+2028/2029
// for legacy JSON-in-HTML safety) at every JSON-LD render site.
const JSON_LD_LINE_SEPARATORS = new RegExp("[\\u2028\\u2029]", "g");
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(JSON_LD_LINE_SEPARATORS, (ch) =>
      ch.charCodeAt(0) === 0x2028 ? "\\u2028" : "\\u2029",
    );
}

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
