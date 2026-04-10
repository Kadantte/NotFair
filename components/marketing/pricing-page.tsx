"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { startGoogleConnect } from "@/lib/google-oauth";

type Interval = "month" | "year";

interface Props {
  connected: boolean;
  currentPlan: string;
  currentInterval: "month" | "year" | null;
  /** ISO timestamp at which the subscription is scheduled to cancel, if any. */
  scheduledCancelAt: string | null;
  currentPeriodEnd: string | null;
  hasStripeCustomer: boolean;
}

const FREE_FEATURES = [
  "300 AI operations per day",
  "Connect Google Ads to Claude, Cursor, and any MCP client",
  "Read campaign performance, search terms, and recommendations",
  "Make bid and budget edits with guardrails",
  "Community support",
];

const GROWTH_FEATURES = [
  "Unlimited AI operations",
  "Everything in Free",
  "Priority support",
  "Early access to new features",
  "Cancel any time — no contracts",
];

export function PricingPage({
  connected,
  currentPlan,
  currentInterval,
  scheduledCancelAt,
  currentPeriodEnd,
  hasStripeCustomer,
}: Props) {
  const [interval, setInterval] = useState<Interval>("month");
  const [loading, setLoading] = useState<null | "checkout" | "portal">(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  const isOnGrowth = currentPlan === "growth";

  async function handleCheckout() {
    setError(null);
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

  const monthlyDisplay = "$99";
  const yearlyDisplay = "$950";
  const yearlyMonthlyEquivalent = "$79";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pt-2 pb-16 md:pt-3 md:pb-20">
      {/* Header */}
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold leading-tight text-[#E8E4DD] md:text-5xl">
          Built for founders who run their own ads.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-[#9B9689] md:text-lg">
          Start free. Upgrade when your AI agent stops asking for permission and starts running the account.
        </p>
      </div>

      {/* Status banners */}
      {status === "success" && (
        <div className="mt-8 rounded-md border border-[#4CAF6E]/40 bg-[#4CAF6E]/10 px-4 py-3 text-sm text-[#5DBE82]">
          Subscription confirmed. It can take a few seconds for your account to update.
        </div>
      )}
      {status === "cancelled" && (
        <div className="mt-8 rounded-md border border-[#3D3C36] bg-[#24231F] px-4 py-3 text-sm text-[#9B9689]">
          Checkout cancelled. Nothing was charged.
        </div>
      )}
      {error && (
        <div className="mt-8 rounded-md border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
          {error}
        </div>
      )}

      {/* Interval toggle */}
      <div className="mt-12 inline-flex rounded-full border border-[#3D3C36] bg-[#24231F] p-1">
        <button
          type="button"
          onClick={() => setInterval("month")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            interval === "month"
              ? "bg-[#4CAF6E] text-[#1A1917]"
              : "text-[#9B9689] hover:text-[#E8E4DD]"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("year")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            interval === "year"
              ? "bg-[#4CAF6E] text-[#1A1917]"
              : "text-[#9B9689] hover:text-[#E8E4DD]"
          }`}
        >
          Yearly
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[#5DBE82]">save 20%</span>
        </button>
      </div>

      {/* Plan cards */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold text-[#E8E4DD]">Free</h2>
            <span className="font-mono text-xs uppercase tracking-wider text-[#9B9689]">starter</span>
          </div>
          <p className="mt-2 text-sm text-[#9B9689]">For solo founders kicking the tires.</p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="font-display text-5xl font-bold text-[#E8E4DD]">$0</span>
            <span className="text-sm text-[#9B9689]">/forever</span>
          </div>
          <ul className="mt-8 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-[#E8E4DD]">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#4CAF6E]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            {connected ? (
              <Link
                href="/dashboard"
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#3D3C36] bg-transparent px-5 text-sm font-medium text-[#E8E4DD] transition-colors hover:bg-[#2E2D28]"
              >
                {isOnGrowth ? "Go to dashboard" : "Current plan"}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => startGoogleConnect("/connect")}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#3D3C36] bg-transparent px-5 text-sm font-medium text-[#E8E4DD] transition-colors hover:bg-[#2E2D28]"
              >
                Get started free
              </button>
            )}
          </div>
        </div>

        {/* Growth */}
        <div className="relative rounded-lg border border-[#4CAF6E] bg-gradient-to-b from-[#24231F] to-[#1F1E1A] p-8 shadow-[0_0_0_1px_rgba(76,175,110,0.15)]">
          <div className="absolute -top-3 left-8 rounded-full bg-[#4CAF6E] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#1A1917]">
            Most popular
          </div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold text-[#E8E4DD]">Growth</h2>
            <span className="font-mono text-xs uppercase tracking-wider text-[#4CAF6E]">unlimited</span>
          </div>
          <p className="mt-2 text-sm text-[#9B9689]">For founders who let the agent do the work.</p>
          <div className="mt-6 flex items-baseline gap-1">
            {interval === "month" ? (
              <>
                <span className="font-display text-5xl font-bold text-[#E8E4DD]">{monthlyDisplay}</span>
                <span className="text-sm text-[#9B9689]">/month</span>
              </>
            ) : (
              <>
                <span className="font-display text-5xl font-bold text-[#E8E4DD]">{yearlyDisplay}</span>
                <span className="text-sm text-[#9B9689]">/year</span>
                <span className="ml-2 font-mono text-xs text-[#5DBE82]">≈ {yearlyMonthlyEquivalent}/mo</span>
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
          <div className="mt-8">
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
                    {connected ? `Upgrade to Growth` : "Sign in to upgrade"}
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
              <p className="mt-3 text-center font-mono text-[11px] text-[#9B9689]">
                Renews {currentInterval ?? ""} on {new Date(currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footnote */}
      <p className="mt-12 max-w-2xl text-sm text-[#9B9689]">
        Prices in USD. Billed via Stripe. Cancel anytime from the billing portal — your access continues until the end of the current period.
      </p>

    </div>
  );
}
