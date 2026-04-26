"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, ExternalLink, Key, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import type { FaqItem } from "@/lib/seo";

const MARKETPLACE_CMD = "/plugin marketplace add nowork-studio/toprank";
const INSTALL_CMD = "/plugin install toprank@nowork-studio";
const ADS_CMD = "/ads";

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is the AdsAgent Claude Code plugin?",
    answer:
      "It's a Claude Code plugin (distributed through the toprank marketplace) that gives Claude Code live access to your Google Ads account. Once installed, /ads connects Claude to your campaigns, keywords, search terms, and spend so you can audit and optimize through chat in your terminal.",
  },
  {
    question: "How is this different from the Claude Connector?",
    answer:
      "The plugin is for Claude Code — Anthropic's terminal-based coding agent. The Claude Connector is for Claude.ai Web and Claude Cowork. Both surfaces use the same AdsAgent backend, so the data and capabilities are identical; the install flow is just different.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Sign in with Google to get your API key, run two slash commands inside Claude Code to add the marketplace and install the plugin, then run /ads and paste your key when prompted.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely slash-command driven inside Claude Code. You'll paste two commands and one API key — no JSON config edits, no environment variables, no scripts.",
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
      "Pre-made Google Ads and SEO skills that teach Claude how to audit, optimize, and manage campaigns — plus slash commands like /ads. Skills are reusable workflows that pair with the AdsAgent MCP tools to give Claude domain expertise out of the box.",
  },
];

const RELATED_LINKS = [
  {
    href: "/google-ads-claude-connector-setup-guide",
    title: "Google Ads Claude Connector",
    description:
      "If you use Claude.ai Web or Claude Cowork instead of Claude Code, install AdsAgent as a custom MCP connector in under 2 minutes.",
  },
  {
    href: "/google-ads-claude",
    title: "Claude for Google Ads",
    description:
      "Overview of how AdsAgent connects Claude to your Google Ads account — works with Claude Code, Claude Web, and Claude Cowork.",
  },
  {
    href: "/google-ads-audit",
    title: "Free Google Ads Audit",
    description:
      "Get a free AI audit of your Google Ads account — finds wasted spend and gives you a prioritized fix list in minutes.",
  },
];

export function GoogleAdsClaudeCodePluginSetupPage() {
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
              Setup guide · Claude Code plugin
            </p>
            <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
              Google Ads Claude Code Plugin
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Install the AdsAgent plugin in Claude Code in under 2 minutes.
              Claude reads your Google Ads campaigns in real time and helps you
              audit, optimize, and manage them — right from your terminal.
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
              Add AdsAgent to Claude Code in 5 steps
            </h2>
          </motion.div>

          <div className="space-y-10">
            {/* Step 1 */}
            <div id="step-1" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={1} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Open Claude Code
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Open a terminal and start{" "}
                  <a
                    href="https://docs.claude.com/en/docs/claude-code"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                  >
                    Claude Code
                  </a>
                  . If you don&apos;t have it installed, follow Anthropic&apos;s
                  install guide first.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div id="step-2" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={2} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Add the toprank marketplace
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  In Claude Code, run this slash command to register the{" "}
                  <a
                    href="https://github.com/nowork-studio/toprank"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                  >
                    toprank
                  </a>{" "}
                  plugin marketplace:
                </p>
                <CommandBlock
                  command={MARKETPLACE_CMD}
                  trackingStep="marketplace_add"
                />
              </div>
            </div>

            {/* Step 3 */}
            <div id="step-3" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={3} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Install the plugin
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Install the AdsAgent plugin from the toprank marketplace. It
                  ships with pre-made Google Ads and SEO skills that teach
                  Claude how to audit and optimize your campaigns.
                </p>
                <CommandBlock
                  command={INSTALL_CMD}
                  trackingStep="plugin_install"
                />
              </div>
            </div>

            {/* Step 4 */}
            <div id="step-4" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={4} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Run /ads
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Restart Claude Code, then run:
                </p>
                <CommandBlock command={ADS_CMD} trackingStep="ads_command" />
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Claude will ask for your AdsAgent API key — grab it in the
                  next step.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div id="step-5" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={5} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Get your AdsAgent API key
                </h3>
              </div>
              <div className="ml-11 space-y-4">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Sign in with your Google Ads account to generate your personal
                  API key, then paste it into Claude Code when prompted.
                </p>
                <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/5 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10">
                      <Key className="h-4 w-4 text-[#4CAF6E]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#E8E4DD]">
                        {session.connected
                          ? "Open your API key page"
                          : "Sign in to generate your API key"}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">
                        {session.connected
                          ? "Open your AdsAgent setup page to copy your API key."
                          : "Sign in with Google. We'll redirect you to the setup page where you can copy your API key."}
                      </p>
                      <div className="mt-4">
                        <ConnectButton connected={session.connected} />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Once Claude has your key, try a prompt like{" "}
                  <em className="text-[#E8E4DD]">
                    &ldquo;Audit my connected Google Ads account and tell me
                    the 3 biggest optimization opportunities.&rdquo;
                  </em>{" "}
                  Claude will call AdsAgent tools to read your account and
                  respond with specific, data-backed insights.
                </p>
              </div>
            </div>
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
              Ready to install the plugin?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
              Sign in with Google to grab your API key, then run two slash
              commands in Claude Code. Setup takes under 2 minutes.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <ConnectButton connected={session.connected} large />
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
        title="FAQ — AdsAgent for Claude Code"
        intro="Everything you need to know about installing and using the AdsAgent plugin inside Claude Code."
        items={FAQ_ITEMS}
      />

      {/* ── Related Pages ── */}
      <LandingLinksSection
        title="Related guides"
        intro="Explore the rest of the AdsAgent + Claude workflow."
        links={RELATED_LINKS}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────── helpers ────────────── */

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-sm font-semibold text-[#4CAF6E]">
      {n}
    </span>
  );
}

function CommandBlock({
  command,
  trackingStep,
}: {
  command: string;
  trackingStep: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    trackEvent("install_command_copied", {
      setup_tab: "claude-code",
      surface: "marketing",
      step: trackingStep,
    });
    setTimeout(() => setCopied(false), 2000);
  }, [command, trackingStep]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5">
        <Terminal className="h-4 w-4 shrink-0 text-[#4CAF6E]" />
        <code className="truncate font-mono text-sm text-[#E8E4DD]">
          {command}
        </code>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#3D3C36] bg-[#24231F] px-3 py-2.5 text-sm text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
        aria-label={`Copy ${command}`}
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
      page: "google-ads-claude-code-plugin-setup-guide",
      cta: connected ? "open_api_key_page" : "sign_in_with_google",
      destination: "/connect/claude-code/manual",
      requires_auth: !connected,
    });
    startGoogleConnect("/connect/claude-code/manual");
  }, [connected]);

  const sizeClass = large ? "h-12 px-6 text-base" : "h-11 px-5 text-sm";

  return (
    <Button
      onClick={handleClick}
      className={`${sizeClass} rounded-lg bg-[#4CAF6E] font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]`}
    >
      {connected ? (
        <>
          Open API key page <ExternalLink className="ml-1.5 h-4 w-4" />
        </>
      ) : (
        "Sign in with Google to continue"
      )}
    </Button>
  );
}
