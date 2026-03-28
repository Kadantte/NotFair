import { HomePage } from "@/components/marketing/home-page";
import { buildHomepageJsonLd, buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "AI Google Ads Agent & Google Ads MCP Server",
  description:
    "AdsAgent lets you connect Google Ads to Claude, OpenClaw, and other MCP-compatible AI workflows so you can analyze campaigns, approve changes, and track impact.",
  path: "/",
  keywords: [
    "AI Google Ads agent",
    "Google Ads MCP",
    "Google Ads MCP server",
    "connect Google Ads to Claude",
    "connect Google Ads to OpenClaw",
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
