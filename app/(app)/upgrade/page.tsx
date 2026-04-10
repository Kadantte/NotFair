import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";
import { CheckoutStatusBanner, PricingSection } from "@/components/marketing/pricing-cards";

export const metadata = {
  title: "Upgrade — AdsAgent",
};

export default async function UpgradePage() {
  const session = await getSession();
  const subscription = session.connected && session.userId
    ? await getUserSubscription(session.userId)
    : null;

  return (
    <section className="flex min-h-0 h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
        <Suspense fallback={null}>
          <CheckoutStatusBanner />
        </Suspense>
        <PricingSection
          connected={session.connected}
          currentPlan={subscription?.plan ?? "free"}
          currentInterval={subscription?.interval ?? null}
          scheduledCancelAt={subscription?.scheduledCancelAt?.toISOString() ?? null}
          currentPeriodEnd={subscription?.currentPeriodEnd?.toISOString() ?? null}
          hasStripeCustomer={!!subscription?.stripeCustomerId}
          page="upgrade"
        />
      </div>
    </section>
  );
}
