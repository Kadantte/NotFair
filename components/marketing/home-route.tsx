import { Suspense } from "react";
import { HomePage } from "@/components/marketing/home-page";
import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";

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

export async function HomeRouteContent() {
  const session = await getSession();
  const [stars, subscription] = await Promise.all([
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
    <Suspense fallback={null}>
      <HomePage githubStars={stars} pricing={pricing} />
    </Suspense>
  );
}
