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

async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/nowork-studio/toprank", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.stargazers_count ?? null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const [jsonLd, faqJsonLd, stars] = await Promise.all([
    Promise.resolve(buildHomepageJsonLd()),
    Promise.resolve(buildFaqJsonLd(homepageFaq)),
    getGitHubStars(),
  ]);

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
      <HomePage githubStars={stars} />
    </>
  );
}
