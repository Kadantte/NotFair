"use client";

import { motion } from "framer-motion";
import {
  Target,
  Layers,
  TrendingUp,
  BarChart3,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { AuditCTA, fadeInUp } from "@/components/marketing/audit-cta";

/* ─────────────────────────────────────────────────────── Data ──────────── */

const auditPasses = [
  {
    icon: AlertTriangle,
    name: "Stop Wasting",
    tag: "Pass 1",
    description:
      "Identifies non-converting keywords, irrelevant search terms, and structural waste — with exact dollar amounts so you know what to cut first.",
  },
  {
    icon: TrendingUp,
    name: "Capture More",
    tag: "Pass 2",
    description:
      "Finds budget-constrained campaigns that are winning auctions but running out of gas, plus converting search terms you haven't added as keywords yet.",
  },
  {
    icon: Layers,
    name: "Fix Fundamentals",
    tag: "Pass 3",
    description:
      "Surfaces structural issues — conversion tracking gaps, campaign organization, ad copy quality, and bidding strategy fit — that compound over time.",
  },
];

const pulseMetrics = [
  {
    icon: DollarSign,
    name: "Waste Rate",
    description:
      "What percentage of your spend goes to keywords and search terms with zero conversions. Lower is better.",
  },
  {
    icon: BarChart3,
    name: "Demand Captured",
    description:
      "How much of the available search demand you're actually showing up for on profitable campaigns. Higher is better.",
  },
  {
    icon: Target,
    name: "CPA",
    description:
      "Your cost per conversion. The audit tracks this over time so you can see the impact of changes.",
  },
];

const findings = [
  {
    label: "Search Term Waste",
    finding: "47 irrelevant search terms",
    impact: "$2,847/mo",
    color: "#C45D4A",
  },
  {
    label: "Keyword Performance",
    finding: "23 keywords with zero conversions",
    impact: "$1,200/mo wasted",
    color: "#D4882A",
  },
  {
    label: "Conversion Tracking",
    finding: "Conversion tracking not verified",
    impact: "Blind to results",
    color: "#C45D4A",
  },
  {
    label: "Impression Share",
    finding: "Impression share lost to budget: 34%",
    impact: "Ceiling on growth",
    color: "#D4882A",
  },
];

const howItWorks = [
  {
    num: "1",
    title: "Connect Google Ads",
    desc: "One-click OAuth. Read-only access — we can't make changes until you explicitly approve them. Takes 30 seconds.",
  },
  {
    num: "2",
    title: "AI runs the analysis",
    desc: "Our engine analyzes your campaigns, keywords, search terms, impression share, and conversion setup.",
  },
  {
    num: "3",
    title: "Get your fix list",
    desc: "You get 3 pulse metrics, a prioritized 3-pass action plan, and the exact dollar impact of each fix.",
  },
];

const mockPulse = [
  { label: "Waste Rate", value: "18%", color: "#D4882A" },
  { label: "Demand Captured", value: "42%", color: "#D4882A" },
  { label: "CPA", value: "$34.20", color: "#E8E4DD" },
];

/* ─────────────────────────────────────────────── Sub-components ────────── */

/* ─────────────────────────────────────────────────── Page ────────── */

export function GoogleAdsAuditPage() {
  const session = useSession();

  return (
    <div className="bg-[#1A1917] text-[#E8E4DD]">
      {/* ── Hero ── */}
      <section className="px-4 pb-20 pt-16 md:pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            {/* Left — copy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                Free · No credit card · 5 minutes
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
                Free Google Ads
                <br />
                Audit — know exactly
                <br />
                <span className="text-[#4CAF6E]">where money leaks.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#C4C0B6]">
                AI audits your account in 5 minutes. See your waste rate, find
                where money leaks, and get a 3-step fix list — free.
              </p>

              <div className="mt-8 flex flex-col items-start gap-3">
                <AuditCTA session={session} page="google-ads-audit" size="lg" />
                <p className="text-sm text-[#C4C0B6]">
                  Just connect to Google — no forms, no credit card, nothing to fill in.
                </p>
              </div>
            </motion.div>

            {/* Right — mock score card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
              className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 md:p-8"
            >
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.15em] text-[#C4C0B6]">
                Pulse Metrics
              </p>

              <div className="grid grid-cols-3 gap-3">
                {mockPulse.map((m) => (
                  <div key={m.label} className="rounded border border-[#3D3C36] bg-[#1A1917] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-[#C4C0B6]">{m.label}</p>
                    <p className="mt-1 font-mono-jb text-xl font-bold" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs text-[#C4C0B6]">Sample audit result</p>

              <div className="mt-6 border-t border-[#3D3C36] pt-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
                  <span className="text-sm text-[#C4C0B6]">
                    <span className="font-semibold text-[#C45D4A]">
                      $4,047/mo
                    </span>{" "}
                    in identified waste
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── What You Get ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-12"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              3 action passes
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              A prioritized fix list, not just a score.
            </h2>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-3">
            {auditPasses.map((pass, i) => {
              const Icon = pass.icon;
              return (
                <motion.div
                  key={pass.name}
                  variants={fadeInUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05 }}
                  className="flex flex-col gap-4 rounded-lg border border-[#3D3C36] bg-[#24231F] p-5 transition-colors hover:border-[#4CAF6E]/30 hover:bg-[#2E2D28]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#3D3C36] bg-[#2E2D28]">
                      <Icon className="h-4 w-4 text-[#4CAF6E]" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[#E8E4DD]">{pass.name}</span>
                      <span className="ml-2 rounded-full border border-[#3D3C36] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#C4C0B6]">
                        {pass.tag}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-[#C4C0B6]">{pass.description}</p>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mt-12"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              3 pulse metrics
            </p>
            <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-[#E8E4DD] md:text-3xl">
              Track progress over time.
            </h2>
          </motion.div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {pulseMetrics.map((pm, i) => {
              const Icon = pm.icon;
              return (
                <motion.div
                  key={pm.name}
                  variants={fadeInUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-4 rounded-lg border border-[#3D3C36] bg-[#24231F] p-5"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#3D3C36] bg-[#2E2D28]">
                    <Icon className="h-4 w-4 text-[#4CAF6E]" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-[#E8E4DD]">{pm.name}</span>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#C4C0B6]">{pm.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Sample Findings ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 md:grid-cols-2 md:gap-16">
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <h2 className="font-display text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
                What a typical audit finds.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
                Most accounts running Google Ads for 6+ months have accumulated
                significant waste. Here&apos;s what we commonly uncover in the first
                analysis.
              </p>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              {findings.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between border-b border-[#3D3C36] py-5 first:border-t"
                >
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#C4C0B6]">
                      {f.label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#E8E4DD]">
                      {f.finding}
                    </p>
                  </div>
                  <span
                    className="ml-4 shrink-0 font-mono-jb text-sm font-semibold"
                    style={{ color: f.color }}
                  >
                    {f.impact}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-12"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              How it works
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              From connect to insights in 5 minutes.
            </h2>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {howItWorks.map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                {/* Connector line on desktop */}
                {i < howItWorks.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute left-10 top-5 hidden h-px w-[calc(100%-40px)] bg-[#3D3C36] md:block"
                  />
                )}
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[#3D3C36] bg-[#24231F]">
                  <span className="font-mono-jb text-sm font-semibold text-[#4CAF6E]">
                    {step.num}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#E8E4DD]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between"
          >
            <div className="max-w-xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
                Get your free audit now.
              </h2>
              <p className="mt-3 text-base text-[#C4C0B6]">
                Takes 5 minutes. No changes made to your account. No credit card
                required.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3">
              <AuditCTA session={session} page="google-ads-audit" size="lg" />
              <p className="text-sm text-[#C4C0B6]">
                Just connect to Google — no forms, no credit card, nothing to fill in.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
