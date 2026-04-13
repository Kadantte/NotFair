import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";
import { PricingPage } from "@/components/marketing/pricing-page";

export const metadata = {
  title: "Pricing — AdsAgent",
  description: "Plans for solo founders and growing teams. Connect Google Ads to your AI tools, then ship campaigns faster.",
};

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
