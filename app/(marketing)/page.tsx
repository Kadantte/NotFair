import { HomePage } from "@/components/marketing/home-page";
import { buildHomepageJsonLd, buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Google Ads MCP Server for Claude | AdsAgent",
  description:
    "AdsAgent is the Google Ads MCP server built for Claude. Connect your ad account to Claude Code or Claude for Work and let AI manage your campaigns.",
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePage />
    </>
  );
}
