"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Target,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { AuditCTA, fadeInUp } from "@/components/marketing/audit-cta";
import type { VerticalAuditPage } from "@/lib/vertical-audit-pages";
import { allVerticalAuditPages } from "@/lib/vertical-audit-pages";

const howItWorks = [
  {
    num: "1",
    title: "Connect Google Ads",
    desc: "One-click OAuth. Read-only access — we can't make changes until you explicitly approve them. Takes 30 seconds.",
  },
  {
    num: "2",
    title: "AI analyzes your account",
    desc: "Our engine benchmarks your account against the patterns that matter in your industry — not a generic checklist.",
  },
  {
    num: "3",
    title: "Get your industry fix list",
    desc: "You get 3 pulse metrics, a prioritized 3-pass action plan, and exact dollar impact for each fix — tuned for your vertical.",
  },
];

export function VerticalAuditPageView({ page }: { page: VerticalAuditPage }) {
  const session = useSession();

  const otherVerticals = allVerticalAuditPages.filter((p) => p.slug !== page.slug);

  return (
    <div className="bg-[#1A1917] text-[#E8E4DD]">
      {/* ── Hero ── */}
      <section className="px-4 pb-16 pt-16 md:pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                {page.heroEyebrow}
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[52px]">
                {page.heroTitle}
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#C4C0B6]">
                {page.heroDescription}
              </p>

              <div className="mt-8 flex flex-col items-start gap-3">
                <AuditCTA session={session} page="google-ads-audit" size="lg" />
                <p className="text-sm text-[#C4C0B6]">
                  Free · 5 min · No credit card · Read-only OAuth
                </p>
              </div>
            </motion.div>

            {/* Right — industry snapshot card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
              className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 md:p-8"
            >
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.15em] text-[#C4C0B6]">
                {page.industryShort} Snapshot
              </p>

              <div className="grid grid-cols-1 gap-3">
                <SnapshotStat
                  icon={DollarSign}
                  label="Typical monthly spend"
                  value={page.spendRange}
                  color="#E8E4DD"
                />
                <SnapshotStat
                  icon={Target}
                  label="Typical CPC range"
                  value={page.cpcRange}
                  color="#E8E4DD"
                />
                <SnapshotStat
                  icon={AlertTriangle}
                  label="Typical monthly waste"
                  value={page.typicalWaste}
                  color="#C45D4A"
                />
              </div>

              <div className="mt-6 border-t border-[#3D3C36] pt-5">
                <p className="text-xs leading-relaxed text-[#C4C0B6]">
                  Benchmarks from hundreds of audited {page.industryShort.toLowerCase()} accounts.
                  Your results will be specific to your account once connected.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Industry pain points ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-12 max-w-3xl"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              What this audit catches in {page.industryShort.toLowerCase()}
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              The leaks specific to {page.industry.toLowerCase()}.
            </h2>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-3">
            {page.industryPainPoints.map((p, i) => (
              <motion.div
                key={p.title}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-col gap-3 rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 transition-colors hover:border-[#4CAF6E]/30 hover:bg-[#2E2D28]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded border border-[#3D3C36] bg-[#2E2D28]">
                  <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
                </div>
                <h3 className="text-base font-semibold leading-snug text-[#E8E4DD]">
                  {p.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#C4C0B6]">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Example findings ── */}
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
                What a {page.industryShort.toLowerCase()} audit typically finds.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
                {page.exampleSavings}
              </p>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              {page.auditFindings.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between border-b border-[#3D3C36] py-5 first:border-t"
                >
                  <div className="min-w-0 pr-4">
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

      {/* ── Industry-specific checks ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-10 max-w-3xl"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              {page.industryShort}-specific checks
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              What we check that a generic audit won't.
            </h2>
          </motion.div>

          <ul className="grid gap-3 md:grid-cols-2">
            {page.industrySpecificChecks.map((check) => (
              <li
                key={check}
                className="flex items-start gap-3 rounded-lg border border-[#3D3C36] bg-[#24231F] p-4"
              >
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF6E]" />
                <span className="text-sm leading-relaxed text-[#E8E4DD]">{check}</span>
              </li>
            ))}
          </ul>
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

      {/* ── FAQ ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-10"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              FAQ
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Common questions from {page.industry.toLowerCase()}.
            </h2>
          </motion.div>

          <div className="grid gap-4">
            {page.faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-lg border border-[#3D3C36] bg-[#24231F] p-5 open:bg-[#2E2D28]"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-medium text-[#E8E4DD]">
                  <span>{item.question}</span>
                  <span
                    aria-hidden
                    className="font-mono-jb text-sm text-[#4CAF6E] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                  {item.answer}
                </p>
              </details>
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
                Get your free {page.industryShort.toLowerCase()} audit now.
              </h2>
              <p className="mt-3 text-base text-[#C4C0B6]">
                Takes 5 minutes. No changes made to your account. No credit card required.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3">
              <AuditCTA session={session} page="google-ads-audit" size="lg" />
              <p className="text-sm text-[#C4C0B6]">
                Just connect to Google — no forms, nothing to fill in.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Related verticals ── */}
      <section className="border-t border-[#3D3C36] px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[#E8E4DD] md:text-3xl">
              Audits for other industries
            </h2>
            <Link
              href="/google-ads-audit"
              prefetch
              className="inline-flex items-center gap-1 text-sm text-[#4CAF6E] hover:underline"
            >
              All audits
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherVerticals.map((v) => (
              <Link
                key={v.slug}
                href={`/google-ads-audit/${v.slug}`}
                prefetch
                className="group flex items-center justify-between rounded-lg border border-[#3D3C36] bg-[#24231F] p-4 transition-colors hover:border-[#4CAF6E]/40 hover:bg-[#2E2D28]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#E8E4DD]">
                    Google Ads audit for {v.industry}
                  </p>
                  <p className="mt-1 text-xs text-[#C4C0B6]">
                    {v.spendRange} · CPC {v.cpcRange}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-[#4CAF6E] transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>

          <div className="mt-8">
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
              Looking for the general{" "}
              <Link
                href="/google-ads-audit"
                prefetch
                className="text-[#4CAF6E] hover:underline"
              >
                Google Ads audit
              </Link>
              ? It covers waste rate, demand captured, and CPA for any account.
              <TrendingUp className="ml-1 inline h-3 w-3" />
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function SnapshotStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded border border-[#3D3C36] bg-[#1A1917] p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#3D3C36] bg-[#2E2D28]">
        <Icon className="h-4 w-4 text-[#4CAF6E]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-[#C4C0B6]">{label}</p>
        <p
          className="mt-0.5 font-mono-jb text-base font-semibold"
          style={{ color }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
