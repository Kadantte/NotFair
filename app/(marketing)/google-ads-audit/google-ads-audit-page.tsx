"use client";

import { motion } from "framer-motion";
import {
  Target,
  Search,
  Layers,
  FileText,
  TrendingUp,
  BarChart3,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { AuditCTA, fadeInUp } from "@/components/marketing/audit-cta";

/* ─────────────────────────────────────────────────────── Data ──────────── */

const dimensions = [
  {
    icon: Target,
    name: "Conversion Tracking",
    weight: "20% of score",
    description:
      "Verifies your conversion actions fire correctly and cover all key events — purchases, calls, form fills.",
  },
  {
    icon: Search,
    name: "Keyword Health",
    weight: "20% of score",
    description:
      "Flags low Quality Scores, zero-impression keywords, and outlier CPCs draining budget with no returns.",
  },
  {
    icon: Layers,
    name: "Campaign Structure",
    weight: "15% of score",
    description:
      "Reviews ad group counts, theme separation, and campaign organization for efficiency and manageability.",
  },
  {
    icon: FileText,
    name: "Search Term Quality",
    weight: "15% of score",
    description:
      "Identifies irrelevant queries your ads are showing for — the single biggest source of wasted spend.",
  },
  {
    icon: BarChart3,
    name: "Ad Copy",
    weight: "10% of score",
    description:
      "Evaluates RSA asset strength, headline variety, and whether you're leveraging all available ad slots.",
  },
  {
    icon: TrendingUp,
    name: "Impression Share",
    weight: "10% of score",
    description:
      "Measures budget-lost and rank-lost impression share so you know whether you're hitting your growth ceiling.",
  },
  {
    icon: DollarSign,
    name: "Spend Efficiency",
    weight: "10% of score",
    description:
      "Analyzes CPA trends, cost per click outliers, and spend distribution across campaigns and keywords.",
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
    desc: "Our engine checks all 7 dimensions across your campaigns, keywords, search terms, and conversion setup.",
  },
  {
    num: "3",
    title: "Get your score + fix list",
    desc: "You receive an overall score, a breakdown by dimension, and a prioritized list of exactly what to fix first.",
  },
];

const mockDimensions = [
  { name: "Conversion Tracking", score: 2, max: 5, color: "#C45D4A" },
  { name: "Keyword Health", score: 3, max: 5, color: "#D4882A" },
  { name: "Search Term Quality", score: 2, max: 5, color: "#C45D4A" },
  { name: "Ad Copy", score: 4, max: 5, color: "#4CAF6E" },
];

/* ─────────────────────────────────────────────── Sub-components ────────── */

function ScoreBar({
  name,
  score,
  max,
  color,
}: {
  name: string;
  score: number;
  max: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#9B9689]">{name}</span>
        <span
          className="font-mono-jb text-xs font-semibold"
          style={{ color }}
        >
          {score}/{max}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#3D3C36]">
        <div
          className="h-full rounded-full"
          style={{ width: `${(score / max) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

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
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#9B9689]">
                AI analyzes 7 dimensions of your account in 5 minutes. See your
                score, find wasted spend, and get a prioritized fix list — free.
              </p>

              <div className="mt-8 flex flex-col items-start gap-3">
                <AuditCTA session={session} page="google-ads-audit" size="lg" />
                <p className="text-sm text-[#9B9689]">
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
              <div className="mb-1 flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9B9689]">
                    Account Score
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-5xl font-bold text-[#E8E4DD]">
                      62
                    </span>
                    <span className="text-xl text-[#9B9689]">/100</span>
                  </div>
                </div>
                <span className="rounded border border-[#D4882A]/30 bg-[#D4882A]/10 px-2.5 py-1 text-xs font-medium text-[#D4882A]">
                  Needs Work
                </span>
              </div>

              <p className="mb-5 text-xs text-[#9B9689]">Sample audit result</p>

              <div className="space-y-4">
                {mockDimensions.map((d) => (
                  <ScoreBar key={d.name} {...d} />
                ))}
              </div>

              <div className="mt-6 border-t border-[#3D3C36] pt-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
                  <span className="text-sm text-[#9B9689]">
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

      {/* ── 7 Dimensions ── */}
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
              7 dimensions
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              A complete picture of your account&apos;s health.
            </h2>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            {dimensions.map((dim, i) => {
              const Icon = dim.icon;
              return (
                <motion.div
                  key={dim.name}
                  variants={fadeInUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-4 rounded-lg border border-[#3D3C36] bg-[#24231F] p-5 transition-colors hover:border-[#4CAF6E]/30 hover:bg-[#2E2D28]"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#3D3C36] bg-[#2E2D28]">
                    <Icon className="h-4 w-4 text-[#4CAF6E]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[#E8E4DD]">
                        {dim.name}
                      </span>
                      <span className="rounded-full border border-[#3D3C36] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#9B9689]">
                        {dim.weight}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#9B9689]">
                      {dim.description}
                    </p>
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
              <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
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
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B9689]">
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
                <p className="mt-2 text-sm leading-relaxed text-[#9B9689]">
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
              <p className="mt-3 text-base text-[#9B9689]">
                Takes 5 minutes. No changes made to your account. No credit card
                required.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3">
              <AuditCTA session={session} page="google-ads-audit" size="lg" />
              <p className="text-sm text-[#9B9689]">
                Just connect to Google — no forms, no credit card, nothing to fill in.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
