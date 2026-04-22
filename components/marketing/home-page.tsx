"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUp,
  DollarSign,
  Eye,
  Globe,
  Layers,
  Shield,
  TrendingUp,
  ChevronDown,
  Scale,
  Home,
  Heart,
  Briefcase,
  Zap,
  UserCheck,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { fadeInUp, AuditCTA } from "@/components/marketing/audit-cta";
import { GitHubStarBadge } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { PricingSection, type PricingSectionProps } from "./pricing-cards";

/* ────────────────────────────── Components ─────────────────────── */

function ConnectClaudeCTA({
  session,
  label,
  returnTo = "/connect",
  position,
}: {
  session: { connected: boolean };
  label?: string;
  returnTo?: string;
  position: "hero" | "final";
}) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (loading) return;
    setLoading(true);
    trackEvent("cta_clicked", {
      page: "homepage",
      cta: "connect_claude",
      position,
      destination: returnTo,
      requires_auth: !session.connected,
    });
    if (session.connected) {
      window.location.assign(returnTo);
    } else {
      startGoogleConnect(returnTo);
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      className="h-12 rounded-full bg-[#4CAF6E] px-8 text-base font-semibold text-black transition-all hover:scale-[1.02] hover:bg-[#3D9A5C] disabled:opacity-70"
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
          Connecting...
        </span>
      ) : (
        <>
          {label ?? "Connect Google Ads to Claude"}
          {!label && <ArrowRight className="ml-2 h-5 w-5" />}
        </>
      )}
    </Button>
  );
}

type AudienceItem = {
  icon: typeof ArrowRight;
  title: string;
  desc: string;
};

function AudienceSection({
  eyebrow,
  heading,
  lede,
  items,
}: {
  eyebrow: string;
  heading: string;
  lede: string;
  items: AudienceItem[];
}) {
  return (
    <section className="px-4 pb-16">
      <motion.div
        className="container mx-auto max-w-5xl"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
      >
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
            {eyebrow}
          </p>
          <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#C4C0B6]">{lede}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <Icon className="h-5 w-5 text-[#4CAF6E]" />
                <h3 className="mt-4 text-lg font-semibold text-[#E8E4DD]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}

/* ────────────────────────────── Data ────────────────────────────── */

const stats = [
  { value: "15–25%", label: "of ad spend typically wasted" },
  { value: "70–90%", label: "cheaper than agencies" },
  { value: "24/7", label: "always-on monitoring" },
  { value: "<1 mo", label: "payback period" },
];

const steps = [
  {
    num: "1",
    title: "Connect your Google Ads",
    desc: "One-click OAuth. Read-only to start — no changes until you say so. Takes 30 seconds.",
  },
  {
    num: "2",
    title: "Get your free audit",
    desc: "AI analyzes your campaigns, keywords, and search terms. See exactly where money is being wasted.",
  },
  {
    num: "3",
    title: "Optimize with AI",
    desc: "Your AI agent recommends fixes, pauses wasteful keywords, adds negatives, and improves bids — with your approval.",
  },
];

const comparisonRows = [
  {
    dim: "Monthly cost",
    self: '"Free" (your time)',
    agency: "$1,500–$6,000",
    us: "Free – $99/mo",
  },
  {
    dim: "Your time",
    self: "10–15 hrs/month",
    agency: "2–4 hrs oversight",
    us: "30 min review/month",
  },
  {
    dim: "Expertise",
    self: "Trial and error",
    agency: "Junior analyst (often)",
    us: "Senior-level analysis, 24/7",
  },
  {
    dim: "Attention to your account",
    self: "Whenever you remember",
    agency: "2–4 hours per month",
    us: "Always-on monitoring",
  },
  {
    dim: "Transparency",
    self: "Full (you see everything)",
    agency: "Monthly PDF reports",
    us: "Full + AI explanations",
  },
  {
    dim: "Commitment",
    self: "None",
    agency: "Contract, 30-day notice",
    us: "Cancel anytime",
  },
  {
    dim: "Time to first value",
    self: "Days to weeks",
    agency: "30–60 day onboarding",
    us: "Free audit in 5 minutes",
  },
];

const verticals = [
  {
    icon: Scale,
    title: "Legal Services",
    spend: "$5K–$30K/mo · CPCs: $50–$200+",
    pain: "A single wasted click on \"personal injury lawyer\" costs $150+. Most solo attorneys self-manage because agency fees eat into already-tight margins.",
    hook: "\"Your AI agent saved you $4,200 in wasted clicks this month.\"",
    color: "#C4C0B6",
  },
  {
    icon: Home,
    title: "Home Services",
    spend: "$1K–$10K/mo · CPCs: $15–$80",
    pain: "HVAC, plumbing, roofing — owners run ads between jobs. They need leads, not a dashboard to learn.",
    hook: "\"Set it up once, your agent manages it while you're on the job.\"",
    color: "#4CAF6E",
  },
  {
    icon: Heart,
    title: "Healthcare & Dental",
    spend: "$2K–$15K/mo · CPCs: $20–$60",
    pain: "Office managers run ads with no PPC training. High patient lifetime value ($5K–$15K) means small CPA improvements produce outsized ROI.",
    hook: "\"3 fewer wasted clicks per day = 1 new patient per month.\"",
    color: "#C45D4A",
  },
  {
    icon: Briefcase,
    title: "Insurance",
    spend: "$3K–$20K/mo · CPCs: $30–$100",
    pain: "Independent agents compete fiercely on search. CPCs are brutal, and most don't have the sophistication to optimize beyond basic keywords.",
    hook: "\"Your agent caught 47 irrelevant search terms burning $2,100/mo.\"",
    color: "#D4882A",
  },
];

const examplePrompts = [
  "Pause keywords with no conversions this month",
  "Create a Search campaign for 'Austin Plumbing'",
  "Draft 5 ad headlines for a dental practice",
  "Show me search terms wasting money",
  "Analyze ROAS for the last 30 days",
  "What's my impression share on brand campaigns?",
  "Add negatives for irrelevant searches",
  "Launch a PMAX campaign for my store",
  "Which campaigns have the best CPA?",
  "Optimize bids on my top keywords",
];

const faqs = [
  {
    q: "Is my Google Ads data safe?",
    a: "Yes. We use Google's official OAuth to connect. Your credentials are never stored. You can revoke access at any time from your Google account settings.",
  },
  {
    q: "Will it make changes without my approval?",
    a: "Never. Every optimization is presented as a recommendation with a clear explanation. You review and approve before anything changes. You're always in control.",
  },
  {
    q: "How is this different from hiring an agency?",
    a: "Agencies typically assign a junior analyst who spends 2–4 hours per month on your account. AdsAgent monitors 24/7, catches issues in real-time, and costs 70–90% less. Plus you get full transparency into every change — no more black-box monthly PDFs.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. You connect your Google Ads account, and AdsAgent handles the rest. You interact with it through plain English conversation — just describe what you want in normal language.",
  },
  {
    q: "What if I already have an agency?",
    a: "Many customers start with a free audit to see what their agency might be missing. You can run AdsAgent alongside your agency, or use the audit results to have a more informed conversation with them.",
  },
  {
    q: "How quickly will I see results?",
    a: "The free audit shows wasted spend immediately. Most customers see measurable improvements within the first week — typically from cutting irrelevant search terms and pausing underperforming keywords.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#3D3C36]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-medium text-[#E8E4DD]">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#C4C0B6] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-relaxed text-[#C4C0B6]">{a}</p>
      )}
    </div>
  );
}

/* ────────────────────────────── Page ────────────────────────────── */

export function HomePage({
  githubStars = null,
  pricing,
}: {
  githubStars?: number | null;
  pricing: Omit<PricingSectionProps, "page">;
}) {
  const session = useSession();

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-4 pb-20 pt-6 md:pt-8">
        <div className="container mx-auto max-w-6xl">
          {/* Announcement banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mb-8 flex justify-center"
          >
            <a
              href="https://github.com/nowork-studio/toprank"
              target="_blank"
              rel="noreferrer"
              className="group relative inline-flex items-center gap-3 rounded-full px-5 py-2 text-sm transition-all"
              style={{ background: "linear-gradient(90deg, rgba(76,175,110,0.08), rgba(217,119,87,0.08), rgba(232,185,49,0.08))" }}
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  padding: "1px",
                  background: "linear-gradient(90deg, #4CAF6E, #D97757, #E8B931, #4CAF6E)",
                  backgroundSize: "200% 100%",
                  animation: "rainbow-slide 3s linear infinite",
                  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              />
              <span className="text-[#E8E4DD]">
                Open-source Claude Code skills for SEO, SEM &amp; Google Ads — live on GitHub
              </span>
              <GitHubStarBadge stars={githubStars} />
            </a>
          </motion.div>

          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            {/* Left — copy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                Google Ads MCP for Claude
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-6xl">
                Turn Claude into
                <br />
                your Google Ads
                <br />
                <span className="text-[#4CAF6E]">manager.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#C4C0B6]">
                Every Google Ads campaign deserves your best work.
                AdsAgent gives Claude the tools to analyze and execute
                across Google Ads, CRM, GA4, and Search Console.
              </p>

              <div className="mt-8 flex flex-col items-start gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ConnectClaudeCTA session={session} position="hero" />
                  <AuditCTA
                    session={session}
                    page="homepage"
                    position="hero"
                    variant="secondary"
                    disconnectedLabel="Run free audit"
                    connectedLabel="View your audit"
                  />
                </div>
                <div className="flex items-center gap-5 text-sm text-[#C4C0B6]">
                  <span>Free</span>
                  <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
                  <span>5 minutes</span>
                  <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
                  <span>No credit card</span>
                </div>
              </div>
            </motion.div>

            {/* Right — Claude chat mockup */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
            >
              <p className="mb-5 text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                Works in Cowork &amp; Claude Code
              </p>
              <div className="overflow-hidden rounded-2xl border border-[#3D3C36] bg-[#24231F] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]">
                {/* Top bar: model selector */}
                <div className="flex items-center border-b border-[#3D3C36] px-5 py-3.5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#3D3C36] bg-[#2E2D28] px-3 py-1.5 text-sm text-[#E8E4DD]">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[#D97757]">
                      <img src="/claude-icon.svg" alt="" className="h-2.5 w-2.5 brightness-0 invert" />
                    </span>
                    <span>Claude</span>
                    <ChevronDown className="h-3.5 w-3.5 text-[#C4C0B6]" />
                  </div>
                </div>

                {/* Headline */}
                <div className="px-8 pb-6 pt-10 text-center">
                  <h3 className="font-display text-2xl font-bold tracking-tight text-[#E8E4DD] md:text-3xl">
                    How can I help you run ads today?
                  </h3>
                </div>

                {/* Input */}
                <div className="px-6 pb-6">
                  <div className="rounded-xl border border-[#4D4C46] bg-[#1A1917] px-4 pb-3 pt-4 ring-1 ring-[#4D4C46]/40">
                    <p className="text-[#E8E4DD]">
                      Pause keywords with no conversions in the last 30 days
                      <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[1px] animate-[pulse_1s_ease-in-out_infinite] bg-[#E8E4DD] align-middle" />
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2.5 py-1 text-xs font-medium text-[#4CAF6E]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#4CAF6E]" />
                        AdsAgent
                      </div>
                      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8E4DD] text-[#1A1917] shadow-sm transition-all hover:scale-105 hover:bg-white">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-[#3D3C36]" />

                {/* Prompt chips */}
                <div className="flex gap-2 overflow-x-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {examplePrompts.map((prompt) => (
                    <button
                      key={prompt}
                      className="shrink-0 rounded-full border border-[#3D3C36] bg-[#2E2D28] px-3 py-1.5 text-xs whitespace-nowrap text-[#C4C0B6] transition-colors hover:border-[#4D4C46] hover:text-[#E8E4DD]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="px-4 pb-20">
        <motion.div
          className="container mx-auto max-w-5xl"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#3D3C36] bg-[#3D3C36] md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-[#24231F] px-4 py-6 text-center"
              >
                <div className="text-2xl font-bold text-[#E8E4DD] md:text-3xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-[#C4C0B6]">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── How it works ── */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              How it works
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              From connect to optimized in minutes
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.num}
                className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#4CAF6E] text-lg font-bold text-[#1A1917]">
                  {s.num}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-[#E8E4DD]">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Video demo ── */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Watch AdsAgent find $1,847 in wasted spend
            </h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#3D3C36]">
            <div
              className="relative w-full"
              style={{ paddingBottom: "56.25%" }}
            >
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube-nocookie.com/embed/_QM01o0N-TY"
                title="AdsAgent demo"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── What you get ── */}
      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Everything Claude needs to run real ads work.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[#C4C0B6]">
              Cross-system analysis, continuous monitoring, and execution — on one account or a hundred.
            </p>
          </div>
          <div className="divide-y divide-[#3D3C36] border-y border-[#3D3C36]">
            {[
              {
                icon: Layers,
                title: "Cross-system analysis",
                stat: "4+ sources",
                desc: "Claude reads Google Ads alongside your CRM, GA4, and Search Console — catching the search terms that convert on ads but never close downstream.",
              },
              {
                icon: Zap,
                title: "Executes, not just reports",
                stat: "Read + Write",
                desc: "Pause keywords, restructure campaigns, write RSAs, rebuild landing pages. Not a dashboard — an operator.",
              },
              {
                icon: TrendingUp,
                title: "Tireless monitoring",
                stat: "24/7",
                desc: "Claude watches for wasted spend, search term drift, and new opportunities around the clock — wins you'd miss between weekly check-ins.",
              },
              {
                icon: Briefcase,
                title: "Every account, same depth",
                stat: "∞",
                desc: "One account or a hundred. Apply your full playbook consistently — the marginal cost of deep analysis drops to near zero.",
              },
              {
                icon: Eye,
                title: "Full transparency & control",
                stat: "100%",
                desc: "Every change explained in plain English with before/after data. Nothing ships without your approval.",
              },
              {
                icon: Globe,
                title: "Wherever you use Claude",
                stat: "MCP",
                desc: "Claude.ai, Claude Code, Cursor, or any MCP-compatible client — your ads account goes where you go.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="grid items-center gap-4 py-6 md:grid-cols-[auto_1fr_auto]"
                >
                  <div className="flex items-center gap-4">
                    <Icon className="h-5 w-5 text-[#4CAF6E]" />
                    <h3 className="text-lg font-semibold text-[#E8E4DD]">
                      {item.title}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-[#C4C0B6] md:text-right">
                    {item.desc}
                  </p>
                  <span className="font-mono-jb text-2xl font-bold text-[#4CAF6E] md:w-20 md:text-right">
                    {item.stat}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <AudienceSection
        eyebrow="For agencies"
        heading="Your playbook, applied consistently to every client."
        lede="The hard part isn't knowing what to do — it's executing it the same way across a roster. Claude encodes your playbook and runs it on every account, every week."
        items={[
          {
            icon: Briefcase,
            title: "Scale your playbook",
            desc: "Audits, search-term reviews, weekly reports, QBR prep — encoded once, applied across your entire roster. Every client gets senior-level analysis, not templated output.",
          },
          {
            icon: DollarSign,
            title: "Smaller accounts become profitable",
            desc: "The marginal cost of deep work drops to near zero. Accounts that never justified weekly depth suddenly can — without adding headcount.",
          },
          {
            icon: Shield,
            title: "Raise the quality floor",
            desc: "Every client gets the playbook applied the same way — not whichever AM happens to be sharp that week. You stay in the loop on every change.",
          },
        ]}
      />

      <AudienceSection
        eyebrow="For small business owners"
        heading="The depth a top agency reserves for its biggest clients — on your account."
        lede="If you run your own ads, Claude makes the deep work no freelancer would touch at your spend finally viable."
        items={[
          {
            icon: Scale,
            title: "Work that never fit your budget",
            desc: "Proper account restructures, intent-aligned ad groups, custom landing pages — the work that actually moves Quality Score and CPA, now viable at any spend.",
          },
          {
            icon: Layers,
            title: "One brain across your whole stack",
            desc: "Claude sees Google Ads, CRM, GA4, and Search Console together. Spots the search terms converting on ads but never closing downstream — and fixes them.",
          },
          {
            icon: UserCheck,
            title: "You stay in the driver's seat",
            desc: "No retainer, no middleman, no misaligned incentives. Claude proposes and executes. You approve every change.",
          },
        ]}
      />

      {/* ── Comparison table ── */}
      <section className="px-4 pb-24">
        <motion.div
          className="container mx-auto max-w-5xl"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Why switch
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              How AdsAgent compares
            </h2>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#3D3C36]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#3D3C36] bg-[#24231F]">
                  <th className="px-5 py-4 font-medium text-[#C4C0B6]" />
                  <th className="px-5 py-4 font-medium text-[#C4C0B6]">
                    Self-Manage
                  </th>
                  <th className="px-5 py-4 font-medium text-[#C4C0B6]">
                    Agency
                  </th>
                  <th className="px-5 py-4 font-semibold text-[#4CAF6E]">
                    AdsAgent
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr
                    key={row.dim}
                    className="border-b border-[#3D3C36] last:border-0"
                  >
                    <td className="px-5 py-3.5 font-medium text-[#E8E4DD]">
                      {row.dim}
                    </td>
                    <td className="px-5 py-3.5 text-[#C4C0B6]">{row.self}</td>
                    <td className="px-5 py-3.5 text-[#C4C0B6]">
                      {row.agency}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[#4CAF6E]">
                      {row.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </section>

      {/* ── Verticals ── */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Built for your industry
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              High CPCs mean high waste. We find it.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
              The higher your cost per click, the more money you lose on
              irrelevant searches. AdsAgent is built for industries where
              every wasted click hurts.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {verticals.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.title}
                  className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" style={{ color: v.color }} />
                    <h3 className="text-lg font-semibold text-[#E8E4DD]">
                      {v.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#C4C0B6]">{v.spend}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                    {v.pain}
                  </p>
                  <p className="mt-3 text-sm font-medium italic text-[#4CAF6E]">
                    {v.hook}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <PricingSection {...pricing} page="homepage" />
          <p className="mt-6 text-sm text-[#C4C0B6]">
            Spending $50K+/mo?{" "}
            <Link
              href="mailto:tong@adsagent.org"
              onClick={() =>
                trackEvent("cta_clicked", {
                  page: "homepage",
                  cta: "high_spend_lead",
                  destination: "mailto:tong@adsagent.org",
                  requires_auth: false,
                })
              }
              className="inline-block py-2 font-medium text-[#4CAF6E] underline underline-offset-4 hover:text-[#3D9A5C]"
            >
              Let&rsquo;s talk
            </Link>
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-3xl">
          <div className="mb-10">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Common questions
            </h2>
          </div>

          <div>
            {faqs.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#E8E4DD] md:text-4xl">
            Let Claude manage your Google Ads.
          </h2>
          <p className="mt-4 text-lg text-[#C4C0B6]">
            Connect in 5 minutes. No credit card required.
          </p>
          <div className="mt-8 flex flex-col items-start gap-4">
            <ConnectClaudeCTA session={session} position="final" />
            <p className="max-w-md text-xs leading-relaxed text-[#C4C0B6]">
              By connecting Google Ads, you agree to our{" "}
              <Link
                href="/privacy"
                className="font-medium text-[#E8E4DD] underline underline-offset-4 hover:text-[#4CAF6E]"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                href="/terms"
                className="font-medium text-[#E8E4DD] underline underline-offset-4 hover:text-[#4CAF6E]"
              >
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
