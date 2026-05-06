"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Target,
  Layers,
  TrendingUp,
  BarChart3,
  DollarSign,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { AuditCTA, fadeInUp } from "@/components/marketing/audit-cta";
import { allVerticalAuditPages } from "@/lib/vertical-audit-pages";

/* ─────────────────────────────────────────────────────── Data ──────────── */

type CardCopy = {
  name: string;
  tag?: string;
  description: string;
};

type FindingCopy = {
  label: string;
  finding: string;
  impact: string;
};

type StepCopy = {
  num: string;
  title: string;
  desc: string;
};

type MockPulseCopy = {
  label: string;
  value: string;
};

const auditPassIcons = [AlertTriangle, TrendingUp, Layers];
const pulseMetricIcons = [DollarSign, BarChart3, Target];
const findingColors = ["#C45D4A", "#D4882A", "#C45D4A", "#D4882A"];
const mockPulseColors = ["#D4882A", "#D4882A", "#E8E4DD"];

/* ─────────────────────────────────────────────── Sub-components ────────── */

/* ─────────────────────────────────────────────────── Page ────────── */

export function GoogleAdsAuditPage() {
  const session = useSession();
  const t = useTranslations("GoogleAdsAuditPage");
  const auditPasses = (t.raw("auditPasses.items") as CardCopy[]).map((copy, index) => ({
    ...copy,
    icon: auditPassIcons[index],
  }));
  const pulseMetrics = (t.raw("pulseMetrics.items") as CardCopy[]).map((copy, index) => ({
    ...copy,
    icon: pulseMetricIcons[index],
  }));
  const findings = (t.raw("findings.items") as FindingCopy[]).map((copy, index) => ({
    ...copy,
    color: findingColors[index],
  }));
  const howItWorks = t.raw("howItWorks.items") as StepCopy[];
  const mockPulse = (t.raw("mockPulse.items") as MockPulseCopy[]).map((copy, index) => ({
    ...copy,
    color: mockPulseColors[index],
  }));

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
                {t("hero.eyebrow")}
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
                {t("hero.title.line1")}
                <br />
                {t("hero.title.line2")}
                <br />
                <span className="text-[#4CAF6E]">{t("hero.title.highlight")}</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#C4C0B6]">
                {t("hero.body")}
              </p>

              <div className="mt-8 flex flex-col items-start gap-3">
                <AuditCTA session={session} page="google-ads-audit" size="lg" />
                <p className="text-sm text-[#C4C0B6]">
                  {t("hero.note")}
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
                {t("sampleCard.title")}
              </p>

              <div className="grid grid-cols-3 gap-3">
                {mockPulse.map((m) => (
                  <div key={m.label} className="rounded border border-[#3D3C36] bg-[#1A1917] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-[#C4C0B6]">{m.label}</p>
                    <p className="mt-1 font-mono-jb text-xl font-bold" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs text-[#C4C0B6]">{t("sampleCard.caption")}</p>

              <div className="mt-6 border-t border-[#3D3C36] pt-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
                  <span className="text-sm text-[#C4C0B6]">
                    <span className="font-semibold text-[#C45D4A]">
                      $4,047/mo
                    </span>{" "}
                    {t("sampleCard.wasteSuffix")}
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
              {t("auditPasses.eyebrow")}
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              {t("auditPasses.title")}
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
              {t("pulseMetrics.eyebrow")}
            </p>
            <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-[#E8E4DD] md:text-3xl">
              {t("pulseMetrics.title")}
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
                {t("findings.title")}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
                {t("findings.body")}
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
              {t("howItWorks.eyebrow")}
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              {t("howItWorks.title")}
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

      {/* ── By industry ── */}
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
              {t("verticals.eyebrow")}
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              {t("verticals.title")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
              {t("verticals.body")}
            </p>
          </motion.div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allVerticalAuditPages.map((v) => (
              <Link
                key={v.slug}
                href={`/google-ads-audit/${v.slug}`}
                prefetch
                className="group flex items-start justify-between gap-3 rounded-lg border border-[#3D3C36] bg-[#24231F] p-5 transition-colors hover:border-[#4CAF6E]/40 hover:bg-[#2E2D28]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#E8E4DD]">
                    {v.industry}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#C4C0B6]">
                    {t("verticals.spendLabel")} {v.spendRange} · {t("verticals.cpcLabel")} {v.cpcRange}
                  </p>
                </div>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF6E] transition-transform group-hover:translate-x-0.5" />
              </Link>
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
                {t("finalCta.title")}
              </h2>
              <p className="mt-3 text-base text-[#C4C0B6]">
                {t("finalCta.body")}
              </p>
            </div>

            <div className="flex flex-col items-start gap-3">
              <AuditCTA session={session} page="google-ads-audit" size="lg" />
              <p className="text-sm text-[#C4C0B6]">
                {t("hero.note")}
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
