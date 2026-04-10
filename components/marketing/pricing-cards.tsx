"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";

export type PricingPage = "homepage" | "pricing" | "upgrade";

export function CheckoutStatusBanner() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  if (status === "success") {
    return (
      <div className="mb-8 rounded-md border border-[#4CAF6E]/40 bg-[#4CAF6E]/10 px-4 py-3 text-sm text-[#5DBE82]">
        Subscription succeeded.
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="mb-8 rounded-md border border-[#3D3C36] bg-[#24231F] px-4 py-3 text-sm text-[#C4C0B6]">
        Checkout cancelled. Nothing was charged.
      </div>
    );
  }
  return null;
}

export const FREE_FEATURES = [
  "300 AI operations per day",
  "Connect Google Ads to Claude, Cursor, and any MCP client",
  "Read campaign performance, search terms, and recommendations",
  "Make bid and budget edits with guardrails",
  "Community support",
];

export const GROWTH_FEATURES = [
  "Unlimited AI operations",
  "Everything in Free",
  "Priority support",
  "Early access to new features",
  "Cancel any time — no contracts",
];

export const PRICING = {
  freeMonthly: "$0",
  growthMonthly: "$99",
  growthYearly: "$950",
  growthYearlyMonthlyEquivalent: "$79",
};

type Interval = "month" | "year";

export interface PricingSectionProps {
  connected: boolean;
  currentPlan: string;
  currentInterval: "month" | "year" | null;
  scheduledCancelAt: string | null;
  currentPeriodEnd: string | null;
  hasStripeCustomer: boolean;
  page: PricingPage;
}

export function PricingSection(props: PricingSectionProps) {
  return (
    <div>
      <PricingHeader />
      <PricingCards {...props} />
      <p className="mt-12 max-w-2xl text-sm text-[#C4C0B6]">
        Prices in USD. Billed via Stripe. Cancel anytime from the billing portal — your access continues until the end of the current period.
      </p>
    </div>
  );
}

export function PricingHeader() {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
        Pricing
      </p>
      <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
        A fraction of what agencies charge
      </h2>
      <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
        Start with a free audit. Upgrade when you see the results. Cancel anytime — no contracts.
      </p>
    </div>
  );
}

export function PricingCards({
  connected,
  currentPlan,
  currentInterval,
  scheduledCancelAt,
  currentPeriodEnd,
  hasStripeCustomer,
  page,
}: PricingSectionProps) {
  const [interval, setInterval] = useState<Interval>("year");
  const [loading, setLoading] = useState<null | "checkout" | "portal">(null);
  const [error, setError] = useState<string | null>(null);

  const isOnGrowth = currentPlan === "growth";

  async function handleCheckout() {
    setError(null);
    trackEvent("pricing_cta_clicked", {
      page,
      plan: "growth",
      interval,
      action: connected ? (isOnGrowth ? "switch_interval" : "upgrade") : "signin_then_upgrade",
    });
    if (!connected) {
      startGoogleConnect("/pricing");
      return;
    }
    setLoading("checkout");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(null);
    }
  }

  async function handlePortal() {
    setError(null);
    trackEvent("pricing_cta_clicked", {
      page,
      plan: "growth",
      interval,
      action: "manage",
    });
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Portal failed");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal failed");
      setLoading(null);
    }
  }

  return (
    <div className="mt-10">
      {error && (
        <div className="mb-6 rounded-md border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
          {error}
        </div>
      )}

      {/* Interval toggle */}
      <div className="inline-flex rounded-full border border-[#3D3C36] bg-[#24231F] p-1">
        <button
          type="button"
          onClick={() => setInterval("year")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            interval === "year"
              ? "bg-[#4CAF6E] text-[#1A1917]"
              : "text-[#C4C0B6] hover:text-[#E8E4DD]"
          }`}
        >
          Yearly
          <span
            className={`ml-2 font-mono text-[10px] uppercase tracking-wider ${
              interval === "year" ? "text-[#1A1917]" : "text-[#5DBE82]"
            }`}
          >
            save 20%
          </span>
        </button>
        <button
          type="button"
          onClick={() => setInterval("month")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            interval === "month"
              ? "bg-[#4CAF6E] text-[#1A1917]"
              : "text-[#C4C0B6] hover:text-[#E8E4DD]"
          }`}
        >
          Monthly
        </button>
      </div>

      {/* Plan cards */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-lg border border-[#3D3C36] bg-[#24231F] p-8">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-2xl font-semibold text-[#E8E4DD]">Free</h3>
            <span className="font-mono text-xs uppercase tracking-wider text-[#C4C0B6]">
              starter
            </span>
          </div>
          <p className="mt-2 text-sm text-[#C4C0B6]">Kick the tires risk-free.</p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="font-display text-5xl font-bold text-[#E8E4DD]">
              {PRICING.freeMonthly}
            </span>
            <span className="text-sm text-[#C4C0B6]">/forever</span>
          </div>
          <ul className="mt-8 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-[#E8E4DD]">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#4CAF6E]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            {connected ? (
              <Link
                href="/audit"
                onClick={() =>
                  trackEvent("pricing_cta_clicked", {
                    page,
                    plan: "free",
                    interval,
                    action: "open_audit",
                  })
                }
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#3D3C36] bg-transparent px-5 text-sm font-medium text-[#E8E4DD] transition-colors hover:bg-[#2E2D28]"
              >
                Get Started
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  trackEvent("pricing_cta_clicked", {
                    page,
                    plan: "free",
                    interval,
                    action: "signin",
                  });
                  startGoogleConnect("/connect");
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#3D3C36] bg-transparent px-5 text-sm font-medium text-[#E8E4DD] transition-colors hover:bg-[#2E2D28]"
              >
                Get started free
              </button>
            )}
          </div>
        </div>

        {/* Growth */}
        <div className="relative flex flex-col rounded-lg border border-[#4CAF6E] bg-gradient-to-b from-[#24231F] to-[#1F1E1A] p-8 shadow-[0_0_0_1px_rgba(76,175,110,0.15)]">
          <div className="absolute -top-3 left-8 rounded-full bg-[#4CAF6E] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#1A1917]">
            Most popular
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-2xl font-semibold text-[#E8E4DD]">Growth</h3>
            <span className="font-mono text-xs uppercase tracking-wider text-[#4CAF6E]">
              unlimited
            </span>
          </div>
          <p className="mt-2 text-sm text-[#C4C0B6]">For serious advertisers.</p>
          <div className="mt-6 flex items-baseline gap-1">
            {interval === "month" ? (
              <>
                <span className="font-display text-5xl font-bold text-[#E8E4DD]">
                  {PRICING.growthMonthly}
                </span>
                <span className="text-sm text-[#C4C0B6]">/month</span>
              </>
            ) : (
              <>
                <span className="font-display text-5xl font-bold text-[#E8E4DD]">
                  {PRICING.growthYearlyMonthlyEquivalent}
                </span>
                <span className="text-sm text-[#C4C0B6]">/month</span>
                <span className="ml-2 text-sm text-[#C4C0B6]">
                  {PRICING.growthYearly}/year
                </span>
              </>
            )}
          </div>
          <ul className="mt-8 space-y-3">
            {GROWTH_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-[#E8E4DD]">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#4CAF6E]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            {isOnGrowth && hasStripeCustomer ? (
              <button
                type="button"
                onClick={handlePortal}
                disabled={loading !== null}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#4CAF6E] px-5 text-sm font-semibold text-[#1A1917] transition-colors hover:bg-[#3D9A5C] disabled:opacity-60"
              >
                {loading === "portal" ? "Opening portal…" : "Manage subscription"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckout}
                disabled={loading !== null}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#4CAF6E] px-5 text-sm font-semibold text-[#1A1917] transition-colors hover:bg-[#3D9A5C] disabled:opacity-60"
              >
                {loading === "checkout" ? (
                  "Redirecting…"
                ) : (
                  <>
                    {connected ? "Upgrade to Growth" : "Get Started"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </button>
            )}
            {isOnGrowth && scheduledCancelAt && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-md border border-[#D4882A]/40 bg-[#D4882A]/10 px-3 py-2 text-center">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#D4882A]">
                  Scheduled cancel
                </span>
                <span className="text-sm font-semibold text-[#E8E4DD]">
                  {new Date(scheduledCancelAt).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
            {isOnGrowth && !scheduledCancelAt && currentPeriodEnd && (
              <p className="mt-3 text-center font-mono text-[11px] text-[#C4C0B6]">
                Renews {currentInterval ?? ""} on {new Date(currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
