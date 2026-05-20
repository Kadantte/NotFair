"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { ClaudeCodePluginSteps } from "@/components/claude-code-plugin-steps";
import type { FaqItem } from "@/lib/seo";

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is the NotFair Claude Code plugin?",
    answer:
      "It's a Claude Code plugin (distributed through the toprank marketplace) that gives Claude Code live access to your Google Ads account. Once installed, /ads connects Claude to your campaigns, keywords, search terms, and spend so you can diagnose issues, recommend fixes, and optimize through chat in your terminal.",
  },
  {
    question: "How is this different from the Claude Connector?",
    answer:
      "The plugin is for Claude Code — Anthropic's terminal-based coding agent. The Claude Connector is for Claude.ai Web and Claude Cowork. Both surfaces use the same NotFair backend, so the data and capabilities are identical; the install flow is just different.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Run three slash commands inside Claude Code to add the marketplace, install the plugin, and reload, then run /ads — Claude will open your browser to sign in with Google. No API key to copy.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely slash-command driven inside Claude Code. You'll paste a few commands — no JSON config edits, no environment variables, no scripts, no API keys.",
  },
  {
    question: "Is the plugin free?",
    answer:
      "Yes. Installing the toprank plugin and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my Google Ads account through the plugin?",
    answer:
      "Only with your explicit approval. Claude can propose pausing campaigns, adjusting bids, adding negative keywords, or writing new ads — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
  {
    question: "What does toprank ship with the plugin?",
    answer:
      "Pre-made Google Ads and SEO skills that teach Claude how to diagnose, optimize, and manage campaigns — plus slash commands like /ads. Skills are reusable workflows that pair with the NotFair MCP tools to give Claude domain expertise out of the box.",
  },
];

const RELATED_LINKS = [
  {
    href: "/google-ads-claude-connector-setup-guide",
    title: "Google Ads Claude Connector",
    description:
      "If you use Claude.ai Web or Claude Cowork instead of Claude Code, install NotFair as a custom MCP connector in under 2 minutes.",
  },
  {
    href: "/google-ads-claude",
    title: "Claude for Google Ads",
    description:
      "Overview of how NotFair connects Claude to your Google Ads account — works with Claude Code, Claude Web, and Claude Cowork.",
  },
  {
    href: "/connect-google-ads-to-claude",
    title: "Connect Google Ads to Claude",
    description:
      "Use the public Claude connection page before moving into the authenticated Google Ads setup flow.",
  },
];

export function GoogleAdsClaudeCodePluginSetupPage() {
  return (
    <div className="bg-[#1A1917] text-[#E8E4DD]">
      {/* ── Hero ── */}
      <section className="px-4 pb-16 pt-16 md:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Setup guide · Claude Code plugin
            </p>
            <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
              Google Ads Claude Code Plugin
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Install the NotFair plugin in Claude Code in under 2 minutes.
              Claude reads your Google Ads campaigns in real time and helps you
              diagnose, optimize, and manage them — right from your terminal.
            </p>
            <p className="mt-6 text-sm text-[#C4C0B6]">
              Free · No credit card · 2-minute setup
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Setup Steps ── */}
      <section className="border-t border-[#3D3C36] px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-10 text-center"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              How to install
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Add NotFair to Claude Code in 4 steps
            </h2>
            <p className="mt-3 text-sm text-[#C4C0B6]">
              Free · No credit card · No API key to copy
            </p>
          </motion.div>

          <ClaudeCodePluginSteps surface="marketing" />
        </div>
      </section>

      {/* ── CTA Band ── */}
      <section className="border-t border-[#3D3C36] px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-8 text-center"
          >
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[#E8E4DD] md:text-3xl">
              Ready to install the plugin?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
              Run three slash commands in Claude Code, then{" "}
              <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-sm text-[#4CAF6E]">/ads</code>{" "}
              to sign in. Setup takes under 2 minutes — no API key.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link
                href="/connect/claude-code"
                className="inline-flex items-center gap-2 rounded-lg bg-[#4CAF6E] px-6 py-3 text-base font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
                onClick={() =>
                  trackEvent("cta_clicked", {
                    page: "google-ads-claude-code-plugin-setup-guide",
                    cta: "open_in_app_setup",
                    destination: "/connect/claude-code",
                  })
                }
              >
                Open in-app setup
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/google-ads-claude-connector-setup-guide"
                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
              >
                Or use the Claude Web / Cowork connector
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqSection
        title="FAQ — NotFair for Claude Code"
        intro="Everything you need to know about installing and using the NotFair plugin inside Claude Code."
        items={FAQ_ITEMS}
      />

      {/* ── Related Pages ── */}
      <LandingLinksSection
        title="Related guides"
        intro="Explore the rest of the NotFair + Claude workflow."
        links={RELATED_LINKS}
      />
    </div>
  );
}

