import { getEnv, getRequiredEnv } from "@/lib/env";

/**
 * True when running against Stripe test mode (dev environments).
 * Production builds (NODE_ENV=production) hit the live keys.
 */
export function isStripeTestMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

export type StripeMode = "test" | "live";

export function stripeMode(): StripeMode {
  return isStripeTestMode() ? "test" : "live";
}

function pick(testVar: string, liveVar: string, required = true): string | undefined {
  const name = isStripeTestMode() ? testVar : liveVar;
  return required ? getRequiredEnv(name) : getEnv(name);
}

export function getStripeSecretKey(): string {
  return pick("STRIPE_SECRET_KEY_TEST", "STRIPE_SECRET_KEY_LIVE")!;
}

export function getStripePublishableKey(): string {
  // Publishable key is also exposed via NEXT_PUBLIC_* for the client SDK,
  // but the server-side resolver lets API routes return it without leaking
  // the wrong-mode key.
  return pick("STRIPE_PUBLISHABLE_KEY_TEST", "STRIPE_PUBLISHABLE_KEY_LIVE")!;
}

export function getStripeWebhookSecret(): string {
  return pick("STRIPE_WEBHOOK_SECRET_TEST", "STRIPE_WEBHOOK_SECRET_LIVE")!;
}

export function getGrowthProductId(): string {
  return pick("STRIPE_GROWTH_PRODUCT_ID_TEST", "STRIPE_GROWTH_PRODUCT_ID_LIVE")!;
}

export function getGrowthMonthlyPriceId(): string {
  return pick("STRIPE_GROWTH_PRICE_MONTHLY_TEST", "STRIPE_GROWTH_PRICE_MONTHLY_LIVE")!;
}

export function getGrowthYearlyPriceId(): string {
  return pick("STRIPE_GROWTH_PRICE_YEARLY_TEST", "STRIPE_GROWTH_PRICE_YEARLY_LIVE")!;
}

/** Map a Stripe price ID back to {plan, interval}. */
export function resolvePrice(priceId: string): { plan: "growth"; interval: "month" | "year" } | null {
  if (priceId === getGrowthMonthlyPriceId()) return { plan: "growth", interval: "month" };
  if (priceId === getGrowthYearlyPriceId()) return { plan: "growth", interval: "year" };
  return null;
}
