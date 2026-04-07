import { HomePage } from "@/components/marketing/home-page";
import { buildHomepageJsonLd, buildFaqJsonLd, buildMetadata } from "@/lib/seo";
import { homepageFaq } from "@/lib/marketing-pages";

export const metadata = buildMetadata({
  title: "Google Ads MCP Server & Free Audit for Claude | AdsAgent",
  description:
    "AdsAgent is the Google Ads MCP server built for Claude. Connect your ad account to Claude Code or Claude Cowork and let AI manage your campaigns.",
  path: "/",
  keywords: [
    "Google Ads MCP server",
    "Google Ads MCP",
    "connect Google Ads to Claude",
    "Claude Google Ads",
    "AI Google Ads agent",
    "Claude Code Google Ads",
    "Google Ads AI optimization",
  ],
});

export default function Home() {
  const jsonLd = buildHomepageJsonLd();
  const faqJsonLd = buildFaqJsonLd(homepageFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HomePage />
    </>
  );
}
