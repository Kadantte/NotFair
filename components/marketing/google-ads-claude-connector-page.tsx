"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import type { FaqItem } from "@/lib/seo";

const SERVER_URL = "https://notfair.co/api/mcp";

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is the Google Ads Claude Connector?",
    answer:
      "It's a custom MCP (Model Context Protocol) connector you add inside Claude.ai Web or Claude Cowork. Once installed, Claude can read your Google Ads campaigns, keywords, search terms, spend, and ad copy in real time — and propose changes you approve in chat.",
  },
  {
    question: "Where does this connector work?",
    answer:
      "Anywhere you use Claude.ai with custom connector support: Claude.ai on the web and Claude Cowork. If you use Claude Code instead, NotFair ships as a plugin — see the Claude Code setup guide.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely point-and-click inside claude.ai/customize/connectors. You sign in with Google to generate your Client ID and Secret, paste them into Claude's custom connector dialog, and click Add.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Open the Connectors page in Claude, paste the NotFair server URL, sign in with your Google Ads account to generate credentials, paste them into Claude, and you're done.",
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
    href: "/google-ads-audit",
    title: "Free Google Ads Audit",
    description:
      "Get a free AI audit of your Google Ads account — finds wasted spend and gives you a prioritized fix list in minutes.",
  },
];

export function GoogleAdsClaudeConnectorPage() {
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
              Setup guide · Claude.ai Web &amp; Claude Cowork
            </p>
            <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
              Google Ads Claude Connector
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Add NotFair as a custom MCP connector inside Claude.ai Web or
              Claude Cowork in under 2 minutes. Once installed, Claude reads
              your Google Ads campaigns in real time and helps you audit,
              optimize, and manage them through chat.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <a
                href="https://claude.ai/customize/connectors"
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
              Add NotFair to Claude in 5 steps
            </h2>
          </motion.div>

          <div className="space-y-10">
            {/* Step 1 */}
            <div id="step-1" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={1} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Open Claude Connectors
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Go to{" "}
                  <a
                    href="https://claude.ai/customize/connectors"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                  >
                    claude.ai/customize/connectors
                  </a>{" "}
                  and click the <strong className="text-[#E8E4DD]">+</strong> icon,
                  then choose{" "}
                  <strong className="text-[#E8E4DD]">Add custom connector</strong>.
                </p>
                <SetupScreenshot
                  src="/connector-setup/01-add.png"
                  alt="Click the plus icon in Connectors and choose Add custom connector"
                />
              </div>
            </div>

            {/* Step 2 */}
            <div id="step-2" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={2} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Configure the connector
                </h3>
              </div>
              <div className="ml-11 space-y-4">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Fill in the connector form:
                </p>
                <StaticField label="Name" value="NotFair" />
                <StaticField label="Remote MCP Server URL" value={SERVER_URL} />

                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Expand <strong className="text-[#E8E4DD]">Advanced Settings</strong>.
                  You&apos;ll need a <strong className="text-[#E8E4DD]">Client ID</strong>{" "}
                  and <strong className="text-[#E8E4DD]">Client Secret</strong> — sign in
                  with your Google Ads account to generate them:
                </p>

                <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/5 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10">
                      <Key className="h-4 w-4 text-[#4CAF6E]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#E8E4DD]">
                        {session.connected
                          ? "Get your Client ID & Secret"
                          : "Sign in to generate your Client ID & Secret"}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">
                        {session.connected
                          ? "Open your NotFair connector setup page to copy your credentials."
                          : "Sign in with Google. We'll redirect you to the connector setup page where you can generate and copy your credentials."}
                      </p>
                      <div className="mt-4">
                        <ConnectButton connected={session.connected} />
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Paste the Client ID and Client Secret into Claude&apos;s
                  Advanced Settings fields.
                </p>

                <SetupScreenshot
                  src="/connector-setup/02-configure.png"
                  alt="Add custom connector dialog with Name, Remote MCP Server URL, Client ID and Client Secret filled in under Advanced settings"
                />
              </div>
            </div>

            {/* Step 3 */}
            <div id="step-3" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={3} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Add the connector
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Click <strong className="text-[#E8E4DD]">Add</strong>. The{" "}
                  <strong className="text-[#E8E4DD]">NotFair</strong> connector will
                  appear in your Connectors list with all available tools.
                </p>
                <SetupScreenshot
                  src="/connector-setup/03-saved.png"
                  alt="NotFair connector saved and listed under Connectors with its tool permissions"
                />
              </div>
            </div>

            {/* Step 4 */}
            <div id="step-4" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={4} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Enable NotFair in a chat
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Open a new chat on{" "}
                  <strong className="text-[#E8E4DD]">claude.ai</strong>, click the{" "}
                  <strong className="text-[#E8E4DD]">+</strong> button, go to{" "}
                  <strong className="text-[#E8E4DD]">Connectors</strong>, and toggle{" "}
                  <strong className="text-[#E8E4DD]">NotFair</strong> on.
                </p>
                <SetupScreenshot
                  src="/connector-setup/04-enable-in-chat.png"
                  alt="In a Claude chat, open the + menu and toggle the NotFair connector on"
                />
              </div>
            </div>

            {/* Step 5 */}
            <div id="step-5" className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <StepNumber n={5} />
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  Ask Claude about your ads
                </h3>
              </div>
              <div className="ml-11 space-y-3">
                <p className="text-base leading-relaxed text-[#C4C0B6]">
                  Try a prompt like{" "}
                  <em className="text-[#E8E4DD]">
                    &ldquo;Audit my connected Google Ads account and tell me
                    the 3 biggest optimization opportunities.&rdquo;
                  </em>{" "}
                  Claude will call NotFair tools to read your account and
                  respond with specific, data-backed insights.
                </p>
                <SetupScreenshot
                  src="/connector-setup/05-use-in-chat.png"
                  alt="Claude using the NotFair connector to audit a Google Ads account in a chat"
                />
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
              Ready to install the connector?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
              Sign in with Google to grab your Client ID and Secret, then paste
              them into Claude. Setup takes under 2 minutes.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <ConnectButton connected={session.connected} large />
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
        intro="Everything you need to know about installing and using the NotFair custom connector inside Claude.ai."
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

/* ─────────────────────────────────────────────────── helpers ────────────── */

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-sm font-semibold text-[#4CAF6E]">
      {n}
    </span>
  );
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-[#C4C0B6]/80">
        {label}
      </p>
      <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/90">
        {value}
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
      page: "google-ads-claude-connector-setup-guide",
      cta: connected ? "open_connector_setup" : "sign_in_with_google",
      destination: "/connect/claude-connector",
      requires_auth: !connected,
    });
    startGoogleConnect("/connect/claude-connector");
  }, [connected]);

  const sizeClass = large ? "h-12 px-6 text-base" : "h-11 px-5 text-sm";

  return (
    <Button
      onClick={handleClick}
      className={`${sizeClass} rounded-lg bg-[#4CAF6E] font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]`}
    >
      {connected ? "Open connector setup" : "Sign in with Google to continue"}
    </Button>
  );
}

function SetupScreenshot({ src, alt }: { src: string; alt: string }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  function handleExpand() {
    setExpanded(true);
    const file = src.split("/").pop() ?? src;
    const image = file.replace(/\.[^.]+$/, "").replace(/-/g, "_");
    trackEvent("connector_screenshot_expanded", { image, surface: "marketing" });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleExpand}
        className="group block w-full overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917] transition hover:border-[#4CAF6E]/60"
        aria-label={`Expand image: ${alt}`}
      >
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={750}
          className="h-auto w-full transition-transform duration-200 group-hover:scale-[1.01]"
          unoptimized
        />
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 rounded-full bg-[#24231F] px-3 py-1.5 text-sm text-[#E8E4DD] shadow-md hover:bg-[#2E2D28]"
          >
            Close
          </button>
          <Image
            src={src}
            alt={alt}
            width={2400}
            height={1500}
            className="max-h-[90vh] w-auto max-w-[95vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            unoptimized
          />
        </div>
      )}
    </>
  );
}
