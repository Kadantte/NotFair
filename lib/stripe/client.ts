import Stripe from "stripe";
import { getStripeSecretKey } from "./config";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(getStripeSecretKey(), {
      // Pin a known API version so webhook payload shapes are stable.
      apiVersion: "2026-03-25.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

/** Reset cached client — for tests that swap env vars between cases. */
export function __resetStripeForTests() {
  _stripe = null;
}
