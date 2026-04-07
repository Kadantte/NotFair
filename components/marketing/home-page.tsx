"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  DollarSign,
  Clock,
  Eye,
  Shield,
  TrendingUp,
  Check,
  ChevronDown,
  Scale,
  Home,
  Heart,
  Briefcase,
  Search,
  BarChart3,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";

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
    us: "$149–$699",
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
    color: "#9B9689",
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

const pricingTiers = [
  {
    name: "Starter",
    spend: "$1K–$5K/mo ad spend",
    price: 149,
    savings: "90% cheaper than an agency",
    features: [
      "Full campaign audit",
      "Wasted spend detection",
      "Negative keyword management",
      "Weekly AI check-ins",
    ],
  },
  {
    name: "Growth",
    spend: "$5K–$15K/mo ad spend",
    price: 349,
    savings: "80% cheaper than an agency",
    popular: true,
    features: [
      "Everything in Starter",
      "Bid optimization",
      "Search term analysis",
      "A/B test setup",
      "Daily monitoring",
    ],
  },
  {
    name: "Pro",
    spend: "$15K–$50K/mo ad spend",
    price: 699,
    savings: "70% cheaper than an agency",
    features: [
      "Everything in Growth",
      "Multi-campaign strategy",
      "Competitor analysis",
      "Priority support",
      "Custom reporting",
    ],
  },
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

/* ────────────────────────────── Animation ────────────────────────────── */

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

/* ────────────────────────────── Helpers ────────────────────────────── */

function AuditCTA({ session }: { session: { connected: boolean } }) {
  const [loading, setLoading] = useState(false);

  function handleCTA() {
    if (loading) return;
    setLoading(true);
    if (session.connected) {
      window.location.assign("/connect");
    } else {
      startGoogleConnect("/connect");
    }
  }

  return (
    <Button
      size="lg"
      onClick={handleCTA}
      disabled={loading}
      className="h-14 w-full rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-[1.02] hover:bg-[#3D9A5C] disabled:opacity-70 md:w-auto"
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1A1917] border-t-transparent" />
          Connecting...
        </span>
      ) : (
        <>
          {session.connected ? "Go to Dashboard" : "Get Your Free Audit"}
          <ArrowRight className="ml-2 h-5 w-5" />
        </>
      )}
    </Button>
  );
}

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
          className={`h-5 w-5 shrink-0 text-[#9B9689] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-relaxed text-[#9B9689]">{a}</p>
      )}
    </div>
  );
}

/* ────────────────────────────── Page ────────────────────────────── */

export function HomePage() {
  const session = useSession();

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 md:pt-24">
        <div className="container mx-auto max-w-6xl">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            {/* Left — copy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                AI-powered Google Ads management
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-6xl">
                You&rsquo;re wasting
                <br />
                <span className="text-[#4CAF6E]">15–25%</span> of your
                <br />
                Google Ads budget.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#9B9689]">
                AdsAgent finds the wasted spend, cuts it, and optimizes
                what&rsquo;s left — for a fraction of what agencies charge.
                Get a free audit in 5&nbsp;minutes.
              </p>

              <div className="mt-8 flex flex-col items-start gap-4">
                <AuditCTA session={session} />
                <div className="flex items-center gap-5 text-sm text-[#9B9689]">
                  <span>Free</span>
                  <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
                  <span>5 minutes</span>
                  <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
                  <span>No credit card</span>
                </div>
              </div>
            </motion.div>

            {/* Right — mock audit card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
              className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 md:p-8"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#4CAF6E]">
                  Free Audit Preview
                </span>
                <span className="rounded-full border border-[#3D3C36] px-3 py-1 text-xs text-[#9B9689]">
                  Sample result
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#3D3C36] pb-4">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-[#C45D4A]" />
                    <span className="text-sm text-[#9B9689]">
                      Wasted spend found
                    </span>
                  </div>
                  <span className="text-xl font-bold text-[#C45D4A]">
                    $3,847/mo
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-[#3D3C36] pb-4">
                  <div className="flex items-center gap-3">
                    <Search className="h-5 w-5 text-[#D4882A]" />
                    <span className="text-sm text-[#9B9689]">
                      Irrelevant search terms
                    </span>
                  </div>
                  <span className="text-xl font-bold text-[#D4882A]">47</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#3D3C36] pb-4">
                  <div className="flex items-center gap-3">
                    <Ban className="h-5 w-5 text-[#D4882A]" />
                    <span className="text-sm text-[#9B9689]">
                      Underperforming keywords
                    </span>
                  </div>
                  <span className="text-xl font-bold text-[#D4882A]">23</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-5 w-5 text-[#4CAF6E]" />
                    <span className="text-sm text-[#9B9689]">
                      Optimization score
                    </span>
                  </div>
                  <span className="text-xl font-bold text-[#4CAF6E]">
                    62/100
                  </span>
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
                <div className="mt-1 text-xs uppercase tracking-wide text-[#9B9689]">
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
                <p className="mt-2 text-sm leading-relaxed text-[#9B9689]">
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

      {/* ── Conversation example ── */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Plain English, not dashboards
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Just tell it what you want
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
              No need to learn a complex dashboard. Describe what you need in
              normal language, and your AI agent handles the rest.
            </p>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6">
              <p className="font-mono-jb text-sm text-[#9B9689]">
                <span className="text-[#E8E4DD]">you &rarr;</span>{" "}
                &quot;Pause all keywords with CPA above $50 and less than 2
                conversions in the last 30 days&quot;
              </p>
              <div className="mt-3 border-l-2 border-[#4CAF6E] pl-4">
                <span className="text-[10px] font-medium uppercase tracking-widest text-[#4CAF6E]">Agent</span>
                <p className="mt-1 font-mono-jb text-sm text-[#9B9689]">
                  Found 23 keywords matching criteria. Pausing&hellip; done.
                  Estimated monthly savings: <span className="text-[#E8E4DD]">$1,847</span>.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6">
              <p className="font-mono-jb text-sm text-[#9B9689]">
                <span className="text-[#E8E4DD]">you &rarr;</span>{" "}
                &quot;Show me search terms that are wasting money&quot;
              </p>
              <div className="mt-3 border-l-2 border-[#4CAF6E] pl-4">
                <span className="text-[10px] font-medium uppercase tracking-widest text-[#4CAF6E]">Agent</span>
                <p className="mt-1 font-mono-jb text-sm text-[#9B9689]">
                  Found 47 irrelevant search terms costing $2,134/mo. Top
                  offenders: &quot;free legal advice&quot; ($340), &quot;law
                  school requirements&quot; ($215), &quot;legal aid
                  pro bono&quot; ($189). Want me to add these as negative
                  keywords?
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What you get ── */}
      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Agency-quality management. Without the agency.
            </h2>
          </div>
          <div className="divide-y divide-[#3D3C36] border-y border-[#3D3C36]">
            {[
              {
                icon: DollarSign,
                title: "Wasted spend recovery",
                stat: "15–25%",
                desc: "AI analyzes your search terms and keywords to find irrelevant clicks bleeding your budget.",
              },
              {
                icon: Eye,
                title: "Full transparency & control",
                stat: "100%",
                desc: "Every change is explained in plain English with before/after data. Nothing happens without your approval.",
              },
              {
                icon: Clock,
                title: "Always-on, not 2 hours a month",
                stat: "24/7",
                desc: "Agencies give your account 2–4 hours per month. Your AI agent monitors continuously.",
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
                  <p className="text-sm leading-relaxed text-[#9B9689] md:text-right">
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
                  <th className="px-5 py-4 font-medium text-[#9B9689]" />
                  <th className="px-5 py-4 font-medium text-[#9B9689]">
                    Self-Manage
                  </th>
                  <th className="px-5 py-4 font-medium text-[#9B9689]">
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
                    <td className="px-5 py-3.5 text-[#9B9689]">{row.self}</td>
                    <td className="px-5 py-3.5 text-[#9B9689]">
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
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
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
                  <p className="mt-1 text-xs text-[#9B9689]">{v.spend}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[#9B9689]">
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
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Pricing
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              A fraction of what agencies charge
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
              Start with a free audit. Upgrade when you see the results.
              Cancel anytime — no contracts.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-lg border p-6 ${
                  tier.popular
                    ? "border-[#4CAF6E] bg-[#24231F]"
                    : "border-[#3D3C36] bg-[#24231F]"
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-6 rounded-full bg-[#4CAF6E] px-3 py-1 text-xs font-semibold text-[#1A1917]">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  {tier.name}
                </h3>
                <p className="mt-1 text-xs text-[#9B9689]">{tier.spend}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#E8E4DD]">
                    ${tier.price}
                  </span>
                  <span className="text-sm text-[#9B9689]">/mo</span>
                </div>
                <p className="mt-1 text-xs font-medium text-[#4CAF6E]">
                  {tier.savings}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-[#9B9689]"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF6E]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <AuditCTA session={session} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-[#9B9689]">
            Spending $50K+/mo?{" "}
            <Link
              href="mailto:tong@adsagent.org"
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
            Find out how much you&rsquo;re wasting.
          </h2>
          <p className="mt-4 text-lg text-[#9B9689]">
            Free audit. 5 minutes. No credit card required.
          </p>
          <div className="mt-8 flex flex-col items-start gap-4">
            <AuditCTA session={session} />
            <p className="max-w-md text-xs leading-relaxed text-[#9B9689]">
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
