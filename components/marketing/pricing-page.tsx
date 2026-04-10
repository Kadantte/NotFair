"use client";

import {
  CheckoutStatusBanner,
  PricingSection,
  type PricingSectionProps,
} from "./pricing-cards";

export function PricingPage(props: PricingSectionProps) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pt-2 pb-16 md:pt-3 md:pb-20">
      <CheckoutStatusBanner />
      <PricingSection {...props} />
    </div>
  );
}
