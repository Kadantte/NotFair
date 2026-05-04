import { Suspense } from "react";
import { HomePage } from "@/components/marketing/home-page";
import { buildHomepageJsonLd, buildFaqJsonLd, buildMetadata } from "@/lib/seo";
import { homepageFaq } from "@/lib/marketing-pages";
import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";

export const metadata = buildMetadata({
  title: "Find and Fix Google Ads Issues from Claude | NotFair",
  description:
    "Give Claude live Google Ads access to diagnose issues, recommend fixes, and execute keyword, ad, budget, and negative changes only after approval.",
  path: "/",
  keywords: [
    "find Google Ads issues with Claude",
    "run Google Ads from Claude",
    "Claude Google Ads",
    "Google Ads MCP",
    "AI Google Ads operator",
    "Google Ads campaign automation",
    "Google Ads approval workflow",
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
      <Suspense fallback={null}>
        <HomePage githubStars={stars} pricing={pricing} />
      </Suspense>
    </>
  );
}
