"use client";

import { motion } from "framer-motion";
import Link from "next/link";
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

const tools = [
  {
    name: "listCampaigns",
    category: "Read",
    description: "Pull live campaign performance, spend, and status",
  },
  {
    name: "getKeywords",
    category: "Read",
    description: "Inspect keyword bids, Quality Scores, and impressions",
  },
  {
    name: "getSearchTermReport",
    category: "Read",
    description: "Find irrelevant queries burning budget with no conversions",
  },
  {
    name: "getCampaignPerformance",
    category: "Read",
    description: "Deep-dive into campaign metrics over any date range",
  },
  {
    name: "updateBid",
    category: "Write",
    description: "Adjust a keyword bid — reviewable before it applies",
  },
  {
    name: "pauseCampaign",
    category: "Write",
    description: "Pause an underperforming campaign through Claude",
  },
  {
    name: "addNegativeKeyword",
    category: "Write",
    description: "Block a wasted search term at the campaign or account level",
  },
  {
    name: "createAd",
    category: "Write",
    description: "Write and launch new ad copy through natural conversation",
  },
];

const steps = [
  {
    num: "1",
    title: "Add AdsAgent to your MCP config",
    desc: "Paste the config snippet into Claude Desktop, Claude Code, or Claude Cowork. One entry, no API keys needed at this step.",
  },
  {
    num: "2",
    title: "Connect your Google Ads account",
    desc: "OAuth in one click at adsagent.org. Read permissions only until you approve a specific change — your account stays safe.",
  },
  {
    num: "3",
    title: "Ask Claude anything about your campaigns",
    desc: 'Try: "Which campaigns are wasting the most money?" Claude pulls live data and answers with specifics — no CSV exports, no copy-paste.',
  },
];

const capabilities = [
  {
    icon: MessageSquare,
    title: "Campaign audits in natural language",
    body: "Ask Claude to audit your account. It checks campaign structure, keyword health, search term quality, impression share, and ad copy — then gives you a prioritized fix list.",
  },
  {
    icon: Zap,
    title: "Find wasted spend in seconds",
    body: 'In testing, accounts running for 6+ months typically have $1,000–5,000/month in identifiable waste. Asking "what\'s wasting budget?" surfaces it immediately.',
  },
  {
    icon: Eye,
    title: "Every change is reviewable",
    body: "AdsAgent never commits a change without your explicit approval. Claude shows you what it wants to do, you say yes or no. Human always in control.",
  },
  {
    icon: Terminal,
    title: "Works where you already work",
    body: "Claude Desktop for solo marketers. Claude Code for developers managing campaigns. Claude Cowork for teams. One MCP config, all three clients.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How do I use Claude for Google Ads with AdsAgent?",
    answer:
      "Add AdsAgent to your MCP config (one JSON snippet), connect your Google Ads account via OAuth at adsagent.org, and Claude immediately gains live access to your campaigns. You can then ask Claude to audit your account, find wasted spend, adjust bids, write ad copy, or pause underperformers — all in natural conversation.",
  },
  {
    question: "Does AdsAgent work with Claude Desktop, Claude Code, and Claude Cowork?",
    answer:
      "Yes. AdsAgent is a standard MCP server, so it works with any MCP-compatible Claude client. Add the same config snippet to Claude Desktop settings, your Claude Code MCP config, or Claude Cowork — it works identically in all three.",
  },
  {
    question: "What Google Ads data can Claude see through AdsAgent?",
    answer:
      "Claude gets live access to campaign performance, keyword bids and Quality Scores, search term reports, ad copy, spend data, impression share, and conversion tracking status. It reads your actual account data in real time — no exports or manual uploads needed.",
  },
  {
    question: "Can Claude make changes to my Google Ads account?",
    answer:
      "Yes, but only with your explicit approval at each step. Claude can propose bid changes, pause campaigns, add negative keywords, and write new ads — but every action is shown to you before it executes. You review and confirm. AdsAgent also logs every change so you can track impact.",
  },
  {
    question: "Is this an official Google or Anthropic integration?",
    answer:
      "AdsAgent is an independent product built on Anthropic's open Model Context Protocol (MCP) standard and the Google Ads API. It is not an official Google product. MCP is the open standard Anthropic created for connecting AI to external tools — any developer can build MCP servers, and AdsAgent is one focused entirely on Google Ads.",
  },
  {
    question: "What does setup actually take?",
    answer:
      "Under 2 minutes. Paste one JSON snippet into your MCP config, open adsagent.org, click Connect Google Ads, complete the OAuth flow. That's it — Claude can now access your campaigns.",
  },
  {
    question: "Do I need to know how to code to use this?",
    answer:
      "No coding required. Editing a JSON config file is the most technical step — it's copying and pasting one snippet. The rest is standard Google OAuth and talking to Claude in plain English.",
  },
];

const RELATED_LINKS = [
  {
    href: "/google-ads-audit",
    title: "Free Google Ads Audit",
    description:
      "Get a free AI audit of your Google Ads account — finds wasted spend and gives you a prioritized fix list.",
  },
  {
    href: "/google-ads-mcp-server",
    title: "Google Ads MCP Server",
    description:
      "Learn how AdsAgent's MCP server exposes your Google Ads data and actions to any MCP-compatible AI client.",
  },
  {
    href: "/",
    title: "AdsAgent Home",
    description:
      "The AI-powered Google Ads agent — connect your account and let Claude manage campaigns through conversation.",
  },
];

/* ─────────────────────────────────────────────────────── Page ──────────── */

export function GoogleAdsClaudePage() {
  const session = useSession();

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
                Google Ads MCP Server
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[52px]">
                Use Claude for
                <br />
                Google Ads —
                <br />
                <span className="text-[#4CAF6E]">live data, 2-minute setup.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#C4C0B6]">
                AdsAgent is a Google Ads MCP server for Claude. Connect once and
                Claude gets live access to your campaigns, keywords, spend, and
                ad copy — then helps you audit, optimize, and manage through
                natural conversation.
              </p>

              <div className="mt-8 flex flex-col items-start gap-3">
                <AuditCTA
                  session={session}
                  page="google-ads-claude"
                  size="lg"
                  disconnectedLabel="Connect Google Ads to Claude"
                  connectedLabel="Open Your Account"
                />
                <p className="text-sm text-[#C4C0B6]">
                  Free audit included. No credit card required.
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
                  Step 1
                </span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-sm leading-relaxed text-[#E8E4DD]">
                <code>{MCP_CONFIG}</code>
              </pre>
              <div className="border-t border-[#3D3C36] px-5 py-3">
                <p className="text-xs text-[#C4C0B6]">
                  Works in{" "}
                  <span className="text-[#E8E4DD]">Claude Desktop</span>,{" "}
                  <span className="text-[#E8E4DD]">Claude Code</span>, and{" "}
                  <span className="text-[#E8E4DD]">Claude Cowork</span>.
                  Then connect your Google Ads account at{" "}
                  <Link
                    href="/"
                    className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                  >
                    adsagent.org
                  </Link>
                  .
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
              How it works
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Connect Google Ads to Claude in 2 minutes.
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
              What you get
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Claude AI for Google Ads — what it actually does.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              Once connected, Claude has live access to your account. No more
              exporting CSVs, copying tables into chat, or working from
              screenshots. Ask a question, get a specific answer backed by
              real data.
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
              MCP tools exposed
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              What Claude can read and change.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              AdsAgent exposes a focused set of MCP tools. Read tools give
              Claude live account context. Write tools let Claude propose
              changes — each requiring your explicit approval before execution.
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
                    Tool
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-[#C4C0B6]">
                    Type
                  </th>
                  <th className="hidden px-5 py-3.5 text-left font-medium text-[#C4C0B6] sm:table-cell">
                    What it does
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
                          tool.category === "Read"
                            ? "border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 text-[#4CAF6E]"
                            : "border border-[#D4882A]/30 bg-[#D4882A]/10 text-[#D4882A]"
                        }`}
                      >
                        {tool.category}
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
            Full tool reference at{" "}
            <Link
              href="/google-ads-mcp-server"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              /google-ads-mcp-server
            </Link>
            .
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
                Free · No credit card
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-[#E8E4DD] md:text-3xl">
                Free audit when you connect.
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                Connect your Google Ads account and Claude immediately runs a
                free audit — surfacing wasted spend, missed opportunities, and
                structural issues with a prioritized fix list.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <AuditCTA
                session={session}
                page="google-ads-claude"
                size="lg"
                disconnectedLabel="Get Free Audit"
                connectedLabel="View Your Audit"
              />
              <Link
                href="/google-ads-audit"
                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
              >
                Learn about the audit
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqSection
        title="FAQ — Google Ads and Claude"
        intro="Common questions from MCP builders and marketers setting up the Claude AI Google Ads workflow."
        items={FAQ_ITEMS}
      />

      {/* ── Related Pages ── */}
      <LandingLinksSection
        title="Related pages"
        intro="Explore the full AdsAgent workflow for Google Ads and Claude."
        links={RELATED_LINKS}
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
                Connect Google Ads to Claude — now.
              </h2>
              <p className="mt-3 text-base text-[#C4C0B6]">
                2-minute setup. Free audit included. Human in control of every
                change.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <AuditCTA
                session={session}
                page="google-ads-claude"
                size="lg"
                disconnectedLabel="Connect Google Ads to Claude"
                connectedLabel="Open Your Account"
              />
              <p className="text-sm text-[#C4C0B6]">
                Paste one config snippet. OAuth. Done.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
