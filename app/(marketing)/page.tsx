import { HomePage } from "@/components/marketing/home-page";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { allLandingPages, homepageFaq } from "@/lib/marketing-pages";
import { buildFaqJsonLd, buildHomepageJsonLd, buildMetadata } from "@/lib/seo";

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
  const jsonLd = [buildHomepageJsonLd(), buildFaqJsonLd(homepageFaq)].flat();
  const homepageLinks = allLandingPages.map((page) => ({
    href: `/${page.slug}`,
    title: page.title,
    description: page.description,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePage />
      <LandingLinksSection
        title="Explore common AdsAgent search intents"
        intro="These pages answer the most common high-intent questions teams have before they connect Google Ads to an AI workflow."
        links={homepageLinks}
      />
      <FaqSection
        title="Homepage FAQ"
        intro="Concise answers to the questions most buyers ask when they are evaluating AdsAgent."
        items={homepageFaq}
      />
    </>
  );
}
