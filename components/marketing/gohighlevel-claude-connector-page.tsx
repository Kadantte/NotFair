"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { ConnectorSetupSteps } from "@/components/connector-setup-steps";
import { GHL_MCP_CONNECTOR_NAME, GHL_MCP_SERVER_URL } from "@/lib/brand";
import type { FaqItem } from "@/lib/seo";

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is the GoHighLevel Claude Connector?",
    answer:
      "It's a custom MCP (Model Context Protocol) connector you add inside Claude Desktop, Claude.ai Web, or Claude Cowork. Once installed, Claude can read your HighLevel CRM in real time — contacts, conversations, opportunities, calendars, users, custom fields, forms, workflows, invoices, payments, products, and locations — then summarize, diagnose, and answer questions over your live pipeline.",
  },
  {
    question: "Does the connector work with agency accounts and sub-accounts?",
    answer:
      "Yes. NotFair supports both Company-level (agency) and Location-level (sub-account) HighLevel installs. Connect the agency once and NotFair fans out per-location tokens automatically; or connect a single sub-account if you only manage one location.",
  },
  {
    question: "Where does this connector work?",
    answer:
      "Anywhere Claude supports remote custom connectors: Claude Desktop, Claude.ai on the web, and Claude Cowork. If you use Claude Code or Codex, NotFair also exposes the same MCP server you can wire up with a personal access token issued from the connect page.",
  },
  {
    question: "Do I need a HighLevel agency account?",
    answer:
      "No. Either an agency account or a sub-account works. The connector authenticates via the standard HighLevel Marketplace OAuth flow with read-only scopes for CRM records, calendars, users, custom fields, intake forms, surveys, workflows, invoices, payments, products, and related metadata.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely point-and-click inside Claude Connectors. Open the Add custom connector flow, paste the NotFair GoHighLevel server URL, click Add, and Claude opens a browser tab to sign you in to HighLevel — no Client ID or Secret to copy.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Open the Add custom connector flow in Claude, paste the NotFair GoHighLevel server URL, click Add, then approve the install in HighLevel and pick which agency or location NotFair should access.",
  },
  {
    question: "Is the connector free?",
    answer:
      "Yes. Adding the NotFair GoHighLevel connector is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my HighLevel data through the connector?",
    answer:
      "No — the current release is read-only by design. Claude can read CRM, calendar, intake, workflow, and revenue context to answer questions and surface insights, but it cannot create, edit, or delete records. Mutation tools are on the roadmap and will be gated by explicit human approval when they ship.",
  },
  {
    question: "Can I revoke access later?",
    answer:
      "Yes. From the connect page you can disconnect any individual HighLevel location or the whole agency. That immediately revokes the Claude OAuth token plus any personal access tokens you minted, and HighLevel's UNINSTALL webhook does the same automatically if you remove the app from inside HighLevel.",
  },
  {
    question: "What data does Claude see when the connector is enabled?",
    answer:
      "Live HighLevel data scoped to the locations you connect: locations, contacts, conversations and message history, opportunities by pipeline, calendars and events, users, custom fields, tags, tasks, forms, surveys, workflow metadata, invoices, payments, products, and other read-only CRM metadata. Tokens are encrypted at rest and refreshed server-side.",
  },
];

const RELATED_LINKS = [
  {
    href: "/google-ads-claude-connector-setup-guide",
    title: "Google Ads Claude Connector",
    description:
      "Same setup steps for Google Ads — install the NotFair Google Ads connector inside Claude in under 2 minutes.",
  },
  {
    href: "/meta-ads-claude-connector-setup-guide",
    title: "Meta Ads Claude Connector",
    description:
      "Same setup steps for Meta Ads — install the NotFair Meta Ads connector inside Claude in under 2 minutes.",
  },
  {
    href: "/connect/gohighlevel",
    title: "Connect a HighLevel account",
    description:
      "Authorize NotFair to read your HighLevel CRM, mint a personal access token, or wire the MCP server to Claude.",
  },
];

export function GoHighLevelClaudeConnectorPage() {
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
              GoHighLevel Claude Connector
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Add NotFair as a custom MCP connector inside Claude Desktop,
              Claude.ai Web, or Claude Cowork in under 2 minutes. Once
              installed, Claude reads your HighLevel CRM — contacts,
              conversations, opportunities, calendar bookings, users,
              custom fields, forms, workflows, invoices, payments, and
              products — in real time and helps you make sense of your
              pipeline through chat.
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
                Free · No credit card · 2-minute setup · Read-only
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
              Add the GoHighLevel connector to Claude in 3 steps
            </h2>
            <p className="mt-3 text-sm text-[#C4C0B6]">
              Free · No credit card · No Client ID or Secret needed
            </p>
          </motion.div>

          <ConnectorSetupSteps
            surface="marketing"
            serverUrl={GHL_MCP_SERVER_URL}
            connectorName={GHL_MCP_CONNECTOR_NAME}
            platformLabel="GoHighLevel"
            examplePrompt="Summarize the last 50 conversations in my HighLevel sub-account and flag any leads that haven't been replied to in over 24 hours."
          />
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
              Ready to install the GoHighLevel connector?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
              Open Claude Connectors, paste the NotFair GoHighLevel server
              URL, and click Add. Setup takes under 2 minutes — no Client ID
              or Secret needed.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <a
                href="https://claude.ai/settings/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackEvent("cta_clicked", {
                    page: "gohighlevel-claude-connector-setup-guide",
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
                href="/connect/gohighlevel"
                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
              >
                Or set up your HighLevel connection at NotFair first
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqSection
        title="FAQ — GoHighLevel Claude Connector"
        intro="Everything you need to know about installing and using the NotFair GoHighLevel connector inside Claude."
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
