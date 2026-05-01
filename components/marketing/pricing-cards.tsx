"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { submitManagedInquiry } from "@/app/actions";

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
  "7-day free trial — then upgrade to continue",
  "No credit card required",
  "Connect Google Ads to Claude, Cursor, and any MCP client",
  "Diagnose account issues and draft campaign changes",
  "Preview bid, budget, keyword, and ad edits before approval",
  "Community support",
];

export const GROWTH_FEATURES = [
  "Unlimited Google Ads operations",
  "Everything in Free",
  "Approval-gated writes for campaign changes",
  "Bulk keyword, ad, budget, and script workflows",
  "Latest OpenAI and Anthropic model support in chat (GPT-5.4, Claude Opus 4.7)",
  "Cancel any time — no contracts",
];

export const MANAGED_FEATURES = [
  "Everything in Growth",
  "Dedicated ads strategist",
  "Weekly & monthly performance reports",
  "Campaign strategy & optimization",
  "Custom audience & keyword research",
  "Priority Slack/email support",
  "Cancel any time — no contracts",
];

export const PRICING = {
  freeMonthly: "$0",
  growthMonthly: "$99",
  growthYearly: "$950",
  growthYearlyMonthlyEquivalent: "$79",
  managedMonthly: "$499",
};

type Interval = "month" | "year";

export interface PricingSectionProps {
  connected: boolean;
  email?: string | null;
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
        Upgrade when Claude becomes your ads strategist and operator.
      </h2>
      <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
        Built for people who want AI to find issues and turn approved recommendations into campaign changes.
      </p>
    </div>
  );
}

export function PricingCards({
  connected,
  email,
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

  // Managed plan modal state
  const [managedOpen, setManagedOpen] = useState(false);
  const [managedName, setManagedName] = useState("");
  const [managedEmail, setManagedEmail] = useState("");
  const [managedMessage, setManagedMessage] = useState("");
  const [managedSending, setManagedSending] = useState(false);
  const [managedSent, setManagedSent] = useState(false);

  const isOnGrowth = currentPlan === "growth";

  function openManagedModal() {
    trackEvent("pricing_cta_clicked", {
      page,
      plan: "managed",
      interval,
      action: "claim_spot",
    });
    setManagedOpen(true);
  }

  async function handleManagedSubmit() {
    const submitEmail = connected && email ? email : managedEmail;
    if (!submitEmail.trim() || managedSending) return;
    setManagedSending(true);
    try {
      await submitManagedInquiry({
        name: managedName.trim() || undefined,
        email: submitEmail.trim(),
        message: managedMessage.trim() || undefined,
      });
      trackEvent("managed_inquiry_submitted", { email: submitEmail.trim() });
      setManagedSent(true);
      setTimeout(() => {
        setManagedOpen(false);
        setManagedSent(false);
        setManagedName("");
        setManagedEmail("");
        setManagedMessage("");
      }, 2000);
    } catch {
      // close gracefully
    } finally {
      setManagedSending(false);
    }
  }

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
      <div className="mt-10 grid gap-6 sm:grid-cols-2" suppressHydrationWarning>
        {/* Free */}
        <div className="flex flex-col rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 sm:p-7 lg:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h3 className="font-display text-2xl font-semibold text-[#E8E4DD]">Free</h3>
            <span className="font-mono text-xs uppercase tracking-wider text-[#C4C0B6]">
              starter
            </span>
          </div>
          <p className="mt-2 text-sm text-[#C4C0B6]">Start with live account context.</p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-1 gap-y-1">
            <span className="font-display text-4xl font-bold text-[#E8E4DD] sm:text-5xl">
              {PRICING.freeMonthly}
            </span>
            <span className="text-sm text-[#C4C0B6]">/forever</span>
          </div>
          <ul className="mt-8 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-[#E8E4DD]">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#4CAF6E]" />
                <span suppressHydrationWarning>{f}</span>
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
            <p className="mt-3 text-center font-mono text-[11px] text-[#C4C0B6]">
              No credit card required
            </p>
          </div>
        </div>

        {/* Growth */}
        <div className="relative flex flex-col rounded-lg border border-[#4CAF6E] bg-gradient-to-b from-[#24231F] to-[#1F1E1A] p-6 sm:p-7 lg:p-8 shadow-[0_0_0_1px_rgba(76,175,110,0.15)]">
          <div className="absolute -top-3 left-6 rounded-full bg-[#4CAF6E] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#1A1917] sm:left-7 lg:left-8">
            Most popular
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h3 className="font-display text-2xl font-semibold text-[#E8E4DD]">Growth</h3>
            <span className="font-mono text-xs uppercase tracking-wider text-[#4CAF6E]">
              unlimited
            </span>
          </div>
          <p className="mt-2 text-sm text-[#C4C0B6]">For operators making real campaign changes.</p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-1 gap-y-1">
            {interval === "month" ? (
              <>
                <span className="font-display text-4xl font-bold text-[#E8E4DD] sm:text-5xl">
                  {PRICING.growthMonthly}
                </span>
                <span className="text-sm text-[#C4C0B6]">/month</span>
              </>
            ) : (
              <>
                <span className="font-display text-4xl font-bold text-[#E8E4DD] sm:text-5xl">
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
                <span suppressHydrationWarning>{f}</span>
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

        {/* Managed */}
        <div className="relative hidden flex-col rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 sm:p-7 lg:p-8">
          <div className="absolute -top-3 right-6 rounded-full bg-[#C45D4A] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_2px_8px_rgba(196,93,74,0.4)] sm:right-7 lg:right-8">
            Limited time · 50% off
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h3 className="font-display text-2xl font-semibold text-[#E8E4DD]">Managed</h3>
            <span className="font-mono text-xs uppercase tracking-wider text-[#D4882A]">
              done-for-you
            </span>
          </div>
          <p className="mt-2 text-sm text-[#C4C0B6]">We run your ads. You run your business.</p>
          <div className="mt-3 rounded-md border border-[#D4882A]/30 bg-[#D4882A]/10 px-3 py-2 text-sm font-medium text-[#D4882A]">
            <span className="font-bold">50 spots</span> left — price doubles after
          </div>
          <div className="mt-6">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-2xl font-medium text-[#C4C0B6] line-through">5%</span>
              <span className="font-display text-4xl font-bold text-[#E8E4DD] sm:text-5xl">
                2.5%
              </span>
              <span className="text-sm text-[#C4C0B6]">of ad spend</span>
            </div>
            <p className="mt-2 text-sm text-[#C4C0B6]">
              Starting from <span className="text-base text-[#C4C0B6] line-through">$999</span>{" "}
              <span className="text-base font-semibold text-[#E8E4DD]">{PRICING.managedMonthly}/mo</span>
            </p>
            <div className="mt-3 rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#4CAF6E]">
                Guaranteed
              </p>
              <p className="mt-1 text-xs font-medium text-[#5DBE82]">
                5% improvement to your ads ROI — or you don&apos;t pay.
              </p>
            </div>
          </div>
          <ul className="mt-8 space-y-3">
            {MANAGED_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-[#E8E4DD]">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#D4882A]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            <button
              type="button"
              onClick={openManagedModal}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#D4882A] px-5 text-sm font-semibold text-[#1A1917] transition-colors hover:bg-[#C07A22]"
            >
              Claim your spot
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Managed plan inquiry modal */}
      <Dialog
        open={managedOpen}
        onOpenChange={(v) => {
          setManagedOpen(v);
          if (!v) {
            setManagedSent(false);
            setManagedName("");
            setManagedEmail("");
            setManagedMessage("");
          }
        }}
      >
        <DialogContent className="border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-[#E8E4DD]">
              Claim your managed spot
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[#C4C0B6]">
              {connected && email
                ? `Our ads expert will reach out to you at ${email}.`
                : "Leave your details and our ads expert will reach out."}
            </DialogDescription>
          </DialogHeader>

          {managedSent ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <span className="text-[14px] font-medium text-[#4CAF6E]">
                We&apos;ll be in touch soon!
              </span>
            </div>
          ) : connected && email ? (
            <div className="space-y-4">
              <textarea
                value={managedMessage}
                onChange={(e) => setManagedMessage(e.target.value)}
                placeholder="Anything you'd like us to know? (optional)"
                rows={3}
                className="w-full resize-none rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5 text-[14px] text-[#E8E4DD] placeholder-[#C4C0B6]/50 outline-none transition focus:border-[#4CAF6E]/50"
                autoFocus
              />
              <button
                type="button"
                onClick={handleManagedSubmit}
                disabled={managedSending}
                className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#D4882A] px-5 text-sm font-semibold text-[#1A1917] transition-colors hover:bg-[#C07A22] disabled:opacity-60"
              >
                {managedSending ? "Sending..." : "Submit"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={managedName}
                onChange={(e) => setManagedName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5 text-[14px] text-[#E8E4DD] placeholder-[#C4C0B6]/50 outline-none transition focus:border-[#4CAF6E]/50"
                autoFocus
              />
              <input
                type="email"
                value={managedEmail}
                onChange={(e) => setManagedEmail(e.target.value)}
                placeholder="Your email"
                className="w-full rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5 text-[14px] text-[#E8E4DD] placeholder-[#C4C0B6]/50 outline-none transition focus:border-[#4CAF6E]/50"
              />
              <textarea
                value={managedMessage}
                onChange={(e) => setManagedMessage(e.target.value)}
                placeholder="Tell us about your ads (optional)"
                rows={3}
                className="w-full resize-none rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5 text-[14px] text-[#E8E4DD] placeholder-[#C4C0B6]/50 outline-none transition focus:border-[#4CAF6E]/50"
              />
              <button
                type="button"
                onClick={handleManagedSubmit}
                disabled={!managedEmail.trim() || managedSending}
                className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#D4882A] px-5 text-sm font-semibold text-[#1A1917] transition-colors hover:bg-[#C07A22] disabled:opacity-60"
              >
                {managedSending ? "Sending..." : "Submit"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
