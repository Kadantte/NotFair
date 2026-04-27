import "server-only";

import { stripe } from "@/lib/stripe/client";
import { getGrowthProductId } from "@/lib/stripe/config";

const TRIAL_PERIOD_DAYS = 7;

/**
 * Stripe statuses that indicate the customer actually got onto the product
 * (or is currently being billed). `incomplete_expired` is excluded because
 * the subscription was created but the first payment never completed — the
 * customer never received service, so they're still trial-eligible.
 */
const CONSUMED_TRIAL_STATUSES: ReadonlySet<string> = new Set([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "paused",
]);

/**
 * Returns true if the customer has never had a Growth subscription that
 * counts as "consumed" — i.e. they're eligible for a 7-day trial. Stripe
 * is the source of truth; we don't store a local hasUsedTrial flag.
 */
export async function isGrowthTrialEligible(customerId: string): Promise<boolean> {
  const growthProductId = getGrowthProductId();

  // One customer's subscription history fits comfortably in a single page.
  const subs = await stripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  for (const sub of subs.data) {
    if (!CONSUMED_TRIAL_STATUSES.has(sub.status)) continue;
    const onGrowth = sub.items.data.some((item) => item.price.product === growthProductId);
    if (onGrowth) return false;
  }
  return true;
}

export { TRIAL_PERIOD_DAYS };
