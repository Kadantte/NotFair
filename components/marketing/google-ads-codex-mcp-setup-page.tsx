"use client";

import { useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { CodexSetupSteps } from "@/components/codex-setup-steps";
import type { FaqItem } from "@/lib/seo";

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is the NotFair Codex MCP integration?",
    answer:
      "It's an MCP (Model Context Protocol) integration for OpenAI's Codex CLI. Once added, Codex can read your Google Ads campaigns, keywords, search terms, spend, and ad copy in real time — and propose changes you approve in chat.",
  },
  {
    question: "How is this different from the Claude setup guides?",
    answer:
      "Same backend, different client. The Codex CLI calls the NotFair MCP server using OpenAI's MCP support. The Claude Connector and Claude Code plugin call the same server from Anthropic's clients. Capabilities are identical.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under a minute. Run a single `codex mcp add notfair --url https://notfair.co/api/mcp` command in your terminal — Codex walks you through the OAuth flow and registers the MCP automatically.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. One terminal command sets everything up. There are no JSON config edits, no environment variables, and no scripts to run.",
  },
  {
    question: "Is the integration free?",
    answer:
      "Yes. Adding NotFair to Codex and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Codex actually change my Google Ads account?",
    answer:
      "Only with your explicit approval. Codex can propose pausing campaigns, adjusting bids, adding negative keywords, or writing new ads — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
];

const RELATED_LINKS = [
  {
    href: "/google-ads-claude-connector-setup-guide",
    title: "Google Ads Claude Connector",
    description:
      "If you use Claude.ai Web, Desktop, or Cowork, install NotFair as a custom MCP connector in under 2 minutes.",
  },
  {
    href: "/google-ads-claude-code-plugin-setup-guide",
    title: "Google Ads Claude Code Plugin",
    description:
      "For Claude Code in your terminal — install NotFair via the toprank plugin marketplace.",
  },
  {
    href: "/google-ads-audit",
    title: "Free Google Ads Audit",
    description:
      "Get a free AI audit of your Google Ads account — finds wasted spend and gives you a prioritized fix list in minutes.",
  },
];

export function GoogleAdsCodexMcpSetupPage() {
  const session = useSession();

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
              Setup guide · OpenAI Codex CLI
            </p>
            <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
              Google Ads Codex MCP
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Add NotFair to OpenAI&apos;s Codex CLI in under a minute. One
              terminal command wires up the MCP server and walks you through
              OAuth — Codex then has live access to your Google Ads account.
            </p>
            <p className="mt-6 text-sm text-[#C4C0B6]">
              Free · No credit card · 1-minute setup
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
              Add NotFair to Codex in 3 steps
            </h2>
          </motion.div>

          <CodexSetupSteps surface="marketing" />
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
              Ready to wire up Codex?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
              Sign in with Google to set up your NotFair account, then run the
              one-liner in your terminal. Setup takes under a minute.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <ConnectButton connected={session.connected} large />
              <Link
                href="/google-ads-claude-code-plugin-setup-guide"
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
        title="FAQ — NotFair for Codex"
        intro="Everything you need to know about installing and using the NotFair MCP inside OpenAI's Codex CLI."
        items={FAQ_ITEMS}
      />

      {/* ── Related Pages ── */}
      <LandingLinksSection
        title="Related guides"
        intro="Explore the rest of the NotFair setup options."
        links={RELATED_LINKS}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────── helpers ────────────── */

function ConnectButton({
  connected,
  large = false,
}: {
  connected: boolean;
  large?: boolean;
}) {
  const handleClick = useCallback(() => {
    trackEvent("cta_clicked", {
      page: "google-ads-codex-mcp-setup-guide",
      cta: connected ? "open_codex_setup" : "sign_in_with_google",
      destination: "/connect/codex",
      requires_auth: !connected,
    });
    startGoogleConnect("/connect/codex");
  }, [connected]);

  const sizeClass = large ? "h-12 px-6 text-base" : "h-11 px-5 text-sm";

  return (
    <Button
      onClick={handleClick}
      className={`${sizeClass} rounded-lg bg-[#4CAF6E] font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]`}
    >
      {connected ? (
        <>
          Open Codex setup <ExternalLink className="ml-1.5 h-4 w-4" />
        </>
      ) : (
        "Sign in with Google to continue"
      )}
    </Button>
  );
}
