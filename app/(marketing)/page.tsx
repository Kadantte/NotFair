import { HomePage } from "@/components/marketing/home-page";
import { buildHomepageJsonLd, buildFaqJsonLd, buildMetadata } from "@/lib/seo";
import { homepageFaq } from "@/lib/marketing-pages";
import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";

export const metadata = buildMetadata({
  title: "AI Google Ads Operator for Claude | AdsAgent",
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

export default async function Home() {
  const session = await getSession();
  const [jsonLd, faqJsonLd, subscription] = await Promise.all([
    Promise.resolve(buildHomepageJsonLd()),
    Promise.resolve(buildFaqJsonLd(homepageFaq)),
    session.connected && session.userId
      ? getUserSubscription(session.userId)
      : Promise.resolve(null),
  ]);

  const pricing = {
    connected: session.connected,
    email: session.connected ? session.googleEmail : null,
    currentPlan: subscription?.plan ?? "free",
    currentInterval: subscription?.interval ?? null,
    scheduledCancelAt: subscription?.scheduledCancelAt?.toISOString() ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    hasStripeCustomer: !!subscription?.stripeCustomerId,
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
      <HomePage pricing={pricing} />
    </>
  );
}
