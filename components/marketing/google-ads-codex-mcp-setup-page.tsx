"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink, Terminal, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { CodexSetupSteps } from "@/components/codex-setup-steps";
import type { FaqItem } from "@/lib/seo";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";

const oneLiner = `codex mcp add ${MCP_CONNECTOR_NAME} --url ${MCP_SERVER_URL}`;

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What does the NotFair Codex MCP do once installed?",
    answer:
      "It exposes a set of MCP tools to Codex that let it read your Google Ads campaigns, search terms, and spend, and propose write actions you approve in chat. For the full capability overview see the Google Ads × Codex landing page at /google-ads-codex.",
  },
  {
    question: "How long does setup take?",
    answer:
      `Under a minute. Run a single \`codex mcp add ${MCP_CONNECTOR_NAME} --url ${MCP_SERVER_URL}\` command in your terminal — Codex walks you through the OAuth flow and registers the MCP automatically.`,
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. One terminal command sets everything up. There are no JSON config edits, no environment variables, and no scripts to run.",
  },
  {
    question: "Which terminals and shells does it work in?",
    answer:
      "Any shell that can run Node.js — bash, zsh, fish, PowerShell, and others. The Codex CLI itself is a Node.js process, so the NotFair MCP inherits full shell compatibility. If Codex runs, NotFair runs.",
  },
  {
    question: "Does it work with WSL on Windows?",
    answer:
      "Yes. Install the Codex CLI inside your WSL environment and run the same one-liner. The MCP server and OAuth flow work identically on WSL 1 and WSL 2. Native Windows (outside WSL) depends on Codex CLI's Windows support status.",
  },
  {
    question: "Can I use it inside an IDE like VS Code?",
    answer:
      "Codex is a terminal-first tool, but you can run it in any integrated terminal — VS Code's built-in terminal, JetBrains terminals, or any other IDE that embeds a shell. The NotFair MCP works wherever the Codex CLI runs.",
  },
];

const RELATED_LINKS = [
  {
    href: "/google-ads-codex",
    title: "Google Ads + OpenAI Codex",
    description:
      "Full overview of the Codex × Google Ads integration — capabilities, tools, and use cases.",
  },
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
    href: "/connect",
    title: "Connect Google Ads",
    description:
      "Connect your account and let Codex diagnose issues, recommend fixes, and draft approved campaign changes.",
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
              OAuth — Codex then has live access to diagnose and operate your Google Ads account.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#C4C0B6]">
              Looking for the full product overview? Start with{" "}
              <Link
                href="/google-ads-codex"
                prefetch
                className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
              >
                Codex Google Ads agent
              </Link>
              , then come back here for the install command.
            </p>
            <p className="mt-6 text-sm text-[#C4C0B6]">
              Free · No credit card · 1-minute setup
            </p>
          </motion.div>

          {/* ── Inline one-liner command card ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
            className="mx-auto mt-8 max-w-2xl"
          >
            <CommandCard command={oneLiner} />
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

      {/* ── First Prompts ── */}
      <section className="border-t border-[#3D3C36] px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-8"
          >
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              First prompts
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Move from setup to approved writes
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
              After the MCP is connected, start with a read-only diagnosis, then ask
              Codex to draft a specific change and show the diff before writing.
            </p>
          </motion.div>
          <div className="grid gap-3">
            {[
              "Audit my Google Ads account and rank fixes by impact.",
              "Find search terms I should add as negatives, but show me the diff before writing.",
              "Draft a new RSA for this ad group and wait for approval.",
              "Explain what changed before CPA spiked this week.",
            ].map((prompt) => (
              <div
                key={prompt}
                className="rounded-lg border border-[#3D3C36] bg-[#24231F] px-4 py-3"
              >
                <code className="text-sm leading-relaxed text-[#E8E4DD]">
                  {prompt}
                </code>
              </div>
            ))}
          </div>
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
                prefetch
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

/* ─────────────────────────────────────── helpers ────────────── */

function CommandCard({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    trackEvent("install_command_copied", {
      setup_tab: "codex",
      surface: "marketing",
      step: "codex_oneliner_hero",
    });
    setTimeout(() => setCopied(false), 2000);
  }, [command]);

  return (
    <div className="rounded-lg border border-[#3D3C36] bg-[#24231F]">
      <div className="flex items-center gap-2 border-b border-[#3D3C36] px-4 py-2.5">
        <Terminal className="h-3.5 w-3.5 text-[#4CAF6E]" />
        <span className="font-mono text-xs text-[#C4C0B6]">Terminal</span>
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <code className="truncate font-mono text-sm text-[#E8E4DD]">{command}</code>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-[#3D3C36] bg-[#2E2D28] px-3 py-1.5 text-sm text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
          aria-label={copied ? "Copied!" : "Copy command"}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-[#4CAF6E]" />
              <span className="text-[#4CAF6E]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

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
