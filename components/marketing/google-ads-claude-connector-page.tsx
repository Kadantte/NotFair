"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { ConnectorSetupSteps } from "@/components/connector-setup-steps";
import type { FaqItem } from "@/lib/seo";

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is the Google Ads Claude Connector?",
    answer:
      "It's a custom MCP (Model Context Protocol) connector you add inside Claude Desktop, Claude.ai Web, or Claude Cowork. Once installed, Claude can read your Google Ads campaigns, keywords, search terms, spend, and ad copy in real time — then diagnose issues, recommend fixes, and propose changes you approve in chat.",
  },
  {
    question: "Where does this connector work?",
    answer:
      "Anywhere Claude supports remote custom connectors: Claude Desktop, Claude.ai on the web, and Claude Cowork. If you use Claude Code instead, NotFair ships as a plugin — see the Claude Code setup guide.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely point-and-click inside Claude Connectors. Open the Add custom connector flow, paste the NotFair server URL, click Add, and Claude opens a browser tab to sign you in — no Client ID or Secret to copy.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Open the Add custom connector flow in Claude, paste the NotFair server URL, click Add, and sign in with your Google Ads account in the browser tab Claude opens for you.",
  },
  {
    question: "Is the connector free?",
    answer:
      "Yes. Adding the NotFair connector and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my Google Ads account through the connector?",
    answer:
      "Only with your explicit approval. Claude can propose pausing campaigns, adjusting bids, adding negative keywords, or writing new ads — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
  {
    question: "What data does Claude see when the NotFair connector is enabled?",
    answer:
      "Live campaign performance, keyword bids and Quality Scores, search term reports, ad copy, spend, impression share, and conversion tracking status — pulled directly from the Google Ads API in real time.",
  },
];

const RELATED_LINKS = [
  {
    href: "/google-ads-claude",
    title: "Claude for Google Ads",
    description:
      "Overview of how NotFair connects Claude to your Google Ads account — works with Claude Desktop, Code, and Cowork.",
  },
  {
    href: "/google-ads-mcp-server",
    title: "Google Ads MCP Server",
    description:
      "Full reference for the NotFair MCP server — every read and write tool exposed to Claude and other MCP clients.",
  },
  {
    href: "/connect",
    title: "Connect Google Ads",
    description:
      "Connect your account and let Claude diagnose issues, recommend fixes, and draft approved campaign changes.",
  },
];

export function GoogleAdsClaudeConnectorPage() {
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
              Setup guide · Claude Desktop, Web &amp; Cowork
            </p>
            <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
              Google Ads Claude Connector
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Add NotFair as a custom MCP connector inside Claude Desktop,
              Claude.ai Web, or Claude Cowork in under 2 minutes. Once installed, Claude reads
              your Google Ads campaigns in real time and helps you diagnose,
              optimize, and manage them through chat.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <a
                href="https://claude.ai/settings/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#4CAF6E] px-6 py-3 text-base font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
              >
                Open Claude Connectors
                <ExternalLink className="h-4 w-4" />
              </a>
              <p className="text-sm text-[#C4C0B6]">
                Free · No credit card · 2-minute setup
              </p>
            </div>
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
              Add NotFair to Claude in 3 steps
            </h2>
            <p className="mt-3 text-sm text-[#C4C0B6]">
              Free · No credit card · No Client ID or Secret needed
            </p>
          </motion.div>

          <ConnectorSetupSteps surface="marketing" />
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
              Ready to install the connector?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
              Open Claude Connectors, paste the NotFair server URL, and click Add. Setup takes under 2 minutes — no Client ID or Secret needed.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <a
                href="https://claude.ai/settings/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackEvent("cta_clicked", {
                    page: "google-ads-claude-connector-setup-guide",
                    cta: "open_claude_connectors",
                    destination: "https://claude.ai/settings/connectors?modal=add-custom-connector",
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg bg-[#4CAF6E] px-6 py-3 text-base font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
              >
                Open Claude Connectors
                <ExternalLink className="h-4 w-4" />
              </a>
              <Link
                href="/google-ads-claude"
                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
              >
                Or use Claude Code instead
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqSection
        title="FAQ — Google Ads Claude Connector"
        intro="Everything you need to know about installing and using the NotFair custom connector inside Claude."
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
