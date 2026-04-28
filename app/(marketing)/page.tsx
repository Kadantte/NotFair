import { HomePage } from "@/components/marketing/home-page";
import { buildHomepageJsonLd, buildFaqJsonLd, buildMetadata } from "@/lib/seo";
import { homepageFaq } from "@/lib/marketing-pages";
import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";
import { isGrowthTrialEligible } from "@/lib/stripe/trial";

export const metadata = buildMetadata({
  title: "AI Google Ads Operator for Claude | NotFair",
  description:
    "Connect Google Ads to Claude. Ask what is working, what is wasting spend, and approve fixes across campaigns, keywords, budgets, and ads.",
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
  const session = await getSession();
  const [jsonLd, faqJsonLd, stars, subscription] = await Promise.all([
    Promise.resolve(buildHomepageJsonLd()),
    Promise.resolve(buildFaqJsonLd(homepageFaq)),
    getGitHubStars(),
    session.connected && session.userId
      ? getUserSubscription(session.userId)
      : Promise.resolve(null),
  ]);

  const trialEligible = subscription?.stripeCustomerId
    ? await isGrowthTrialEligible(subscription.stripeCustomerId)
    : true;

  const pricing = {
    connected: session.connected,
    email: session.connected ? session.googleEmail : null,
    currentPlan: subscription?.plan ?? "free",
    currentInterval: subscription?.interval ?? null,
    scheduledCancelAt: subscription?.scheduledCancelAt?.toISOString() ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    hasStripeCustomer: !!subscription?.stripeCustomerId,
    trialEligible,
  };

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
      <HomePage githubStars={stars} pricing={pricing} />
    </>
  );
}
