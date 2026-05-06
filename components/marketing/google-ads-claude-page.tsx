"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Terminal, Eye, Zap, MessageSquare } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { AuditCTA, fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import type { FaqItem } from "@/lib/seo";

/* ─────────────────────────────────────────────────────── Data ──────────── */

const MCP_CONFIG = `{
  "mcpServers": {
    "adsagent": {
      "command": "npx",
      "args": ["-y", "@adsagent/mcp"]
    }
  }
}`;

type ToolCopy = {
  name: string;
  category: "read" | "write";
  description: string;
};

type StepCopy = {
  num: string;
  title: string;
  desc: string;
};

type CapabilityCopy = {
  title: string;
  body: string;
};

const capabilityIcons = [MessageSquare, Zap, Eye, Terminal];

const RELATED_LINKS = [
  { href: "/google-ads-audit", key: "audit" },
  { href: "/google-ads-mcp-server", key: "mcpServer" },
  { href: "/", key: "home" },
];

/* ─────────────────────────────────────────────────────── Page ──────────── */

export function GoogleAdsClaudePage() {
  const session = useSession();
  const t = useTranslations("GoogleAdsClaudePage");
  const tools = t.raw("tools.items") as ToolCopy[];
  const steps = t.raw("steps.items") as StepCopy[];
  const capabilities = (t.raw("capabilities.items") as CapabilityCopy[]).map((copy, index) => ({
    ...copy,
    icon: capabilityIcons[index],
  }));
  const faqItems = t.raw("faq.items") as FaqItem[];
  const relatedLinks = RELATED_LINKS.map(({ href, key }) => ({
    href,
    title: t(`related.links.${key}.title`),
    description: t(`related.links.${key}.description`),
  }));

  return (
    <div className="bg-[#1A1917] text-[#E8E4DD]">

      {/* ── Hero ── */}
      <section className="px-4 pb-20 pt-16 md:pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-start gap-12 md:grid-cols-2 md:gap-16">

            {/* Left — copy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                {t("hero.eyebrow")}
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[52px]">
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
                <AuditCTA
                  session={session}
                  page="google-ads-claude"
                  size="lg"
                  disconnectedLabel={t("hero.disconnectedLabel")}
                  connectedLabel={t("hero.connectedLabel")}
                />
                <p className="text-sm text-[#C4C0B6]">
                  {t("hero.note")}
                </p>
              </div>
            </motion.div>

            {/* Right — MCP config snippet (visible immediately, above the fold) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
              className="rounded-lg border border-[#3D3C36] bg-[#24231F]"
            >
              <div className="flex items-center gap-2 border-b border-[#3D3C36] px-5 py-3">
                <Terminal className="h-4 w-4 text-[#4CAF6E]" />
                <span className="font-mono text-xs text-[#C4C0B6]">
                  claude_desktop_config.json
                </span>
                <span className="ml-auto rounded border border-[#3D3C36] px-1.5 py-0.5 font-mono text-[10px] text-[#C4C0B6]">
                  {t("configCard.step")}
                </span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-sm leading-relaxed text-[#E8E4DD]">
                <code>{MCP_CONFIG}</code>
              </pre>
              <div className="border-t border-[#3D3C36] px-5 py-3">
                <p className="text-xs text-[#C4C0B6]">
                  {t("configCard.worksIn")}{" "}
                  <span className="text-[#E8E4DD]">Claude Desktop</span>,{" "}
                  <span className="text-[#E8E4DD]">Claude Code</span>, and{" "}
                  <span className="text-[#E8E4DD]">Claude Cowork</span>.
                  {" "}{t("configCard.thenConnect")}{" "}
                  <Link
                    href="/"
                    className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                  >
                    notfair.co
                  </Link>
                  {t("configCard.suffix")}
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
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
              {t("steps.eyebrow")}
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              {t("steps.title")}
            </h2>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                {i < steps.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute left-10 top-5 hidden h-px w-[calc(100%-40px)] bg-[#3D3C36] md:block"
                  />
                )}
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[#3D3C36] bg-[#24231F]">
                  <span className="font-mono text-sm font-semibold text-[#4CAF6E]">
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

      {/* ── What Claude Can Do ── */}
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
              {t("capabilities.eyebrow")}
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              {t("capabilities.title")}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              {t("capabilities.body")}
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon;
              return (
                <motion.div
                  key={cap.title}
                  variants={fadeInUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 transition-colors hover:border-[#4CAF6E]/30 hover:bg-[#2E2D28]"
                >
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded border border-[#3D3C36] bg-[#2E2D28]">
                    <Icon className="h-4 w-4 text-[#4CAF6E]" />
                  </div>
                  <h3 className="text-base font-semibold text-[#E8E4DD]">
                    {cap.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                    {cap.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── MCP Tools Table ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-10"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              {t("tools.eyebrow")}
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              {t("tools.title")}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              {t("tools.body")}
            </p>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            className="overflow-hidden rounded-lg border border-[#3D3C36]"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#3D3C36] bg-[#24231F]">
                  <th className="px-5 py-3.5 text-left font-medium text-[#C4C0B6]">
                    {t("tools.columns.tool")}
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-[#C4C0B6]">
                    {t("tools.columns.type")}
                  </th>
                  <th className="hidden px-5 py-3.5 text-left font-medium text-[#C4C0B6] sm:table-cell">
                    {t("tools.columns.description")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool, i) => (
                  <tr
                    key={tool.name}
                    className={`border-b border-[#3D3C36] last:border-0 ${
                      i % 2 === 0 ? "bg-[#1A1917]" : "bg-[#24231F]"
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <code className="font-mono text-xs text-[#E8E4DD]">
                        {tool.name}
                      </code>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          tool.category === "read"
                            ? "border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 text-[#4CAF6E]"
                            : "border border-[#D4882A]/30 bg-[#D4882A]/10 text-[#D4882A]"
                        }`}
                      >
                        {t(`tools.categories.${tool.category}`)}
                      </span>
                    </td>
                    <td className="hidden px-5 py-3.5 text-[#C4C0B6] sm:table-cell">
                      {tool.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <motion.p
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            className="mt-4 text-sm text-[#C4C0B6]"
          >
            {t("tools.referencePrefix")}{" "}
            <Link
              href="/google-ads-mcp-server"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              /google-ads-mcp-server
            </Link>
            {t("tools.referenceSuffix")}
          </motion.p>
        </div>
      </section>

      {/* ── Free Audit CTA Band ── */}
      <section className="border-t border-[#3D3C36] px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="flex flex-col gap-8 rounded-lg border border-[#3D3C36] bg-[#24231F] p-8 md:flex-row md:items-center md:justify-between"
          >
            <div className="max-w-xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                {t("auditCta.eyebrow")}
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-[#E8E4DD] md:text-3xl">
                {t("auditCta.title")}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                {t("auditCta.body")}
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <AuditCTA
                session={session}
                page="google-ads-claude"
                size="lg"
                disconnectedLabel={t("auditCta.disconnectedLabel")}
                connectedLabel={t("auditCta.connectedLabel")}
              />
              <Link
                href="/google-ads-audit"
                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
              >
                {t("auditCta.secondary")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqSection
        title={t("faq.title")}
        intro={t("faq.intro")}
        items={faqItems}
      />

      {/* ── Related Pages ── */}
      <LandingLinksSection
        title={t("related.title")}
        intro={t("related.intro")}
        links={relatedLinks}
      />

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
              <AuditCTA
                session={session}
                page="google-ads-claude"
                size="lg"
                disconnectedLabel={t("hero.disconnectedLabel")}
                connectedLabel={t("hero.connectedLabel")}
              />
              <p className="text-sm text-[#C4C0B6]">
                {t("finalCta.note")}
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
