import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";
import { PricingPage } from "@/components/marketing/pricing-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "NotFair Pricing — Google Ads AI Agent Plans",
  description:
    "NotFair pricing for solo operators and teams using AI agents to diagnose Google Ads, connect MCP clients, and approve campaign changes safely.",
  path: "/pricing",
  keywords: [
    "NotFair pricing",
    "Google Ads AI agent pricing",
    "Google Ads MCP pricing",
    "AI Google Ads tool pricing",
  ],
});

export default async function Pricing() {
  const session = await getSession();
  const subscription = session.connected && session.userId
    ? await getUserSubscription(session.userId)
    : null;

  return (
    <PricingPage
      connected={session.connected}
      email={session.connected ? session.googleEmail : null}
      currentPlan={subscription?.plan ?? "free"}
      currentInterval={subscription?.interval ?? null}
      scheduledCancelAt={subscription?.scheduledCancelAt?.toISOString() ?? null}
      currentPeriodEnd={subscription?.currentPeriodEnd?.toISOString() ?? null}
      hasStripeCustomer={!!subscription?.stripeCustomerId}
    />
  );
}
