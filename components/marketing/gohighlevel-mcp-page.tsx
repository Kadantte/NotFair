"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { GHL_MCP_CONNECTOR_NAME, GHL_MCP_SERVER_URL } from "@/lib/brand";
import type { FaqItem } from "@/lib/seo";

const SERVER_URL = GHL_MCP_SERVER_URL;

const TOOLS: { name: string; description: string }[] = [
  {
    name: "listLocations",
    description:
      "List HighLevel locations the connection can see. Returns the full set under the parent agency, or just the bound location for sub-account tokens.",
  },
  {
    name: "listContacts",
    description:
      "Paginate contacts in a location. Supports limit, startAfterId cursor, and a substring query against name/email/phone.",
  },
  {
    name: "listConversations",
    description:
      "Paginate conversations in a location. Filter by lastMessageType (TYPE_SMS, TYPE_EMAIL, TYPE_CALL, ...) when you want a single channel.",
  },
  {
    name: "listOpportunities",
    description:
      "Paginate opportunities in a location. Optionally filter by pipelineId to scope to a single sales funnel.",
  },
  {
    name: "listCalendarEvents",
    description:
      "Date-bounded calendar events for a location. Pass startDate / endDate (ISO 8601) and optionally a calendarId.",
  },
  {
    name: "listUsers / listPipelines / listCalendars",
    description:
      "Read team members, opportunity pipeline stages, and calendar configuration so Claude can explain ownership, routing, and booking context.",
  },
  {
    name: "listCustomFields / listTags / listTasks / listCampaigns",
    description:
      "Read location metadata, task queues, campaign metadata, trigger links, and media files so Claude can interpret custom field ids, segmentation, follow-up load, and tagging conventions.",
  },
  {
    name: "listForms / listSurveys / listWorkflows",
    description:
      "Read intake assets, submissions, and workflow metadata to understand lead sources and automation coverage.",
  },
  {
    name: "listInvoices / listTransactions / listProducts",
    description:
      "Read commerce context attached to the CRM so Claude can connect pipeline state to orders, invoices, payments, and products.",
  },
  {
    name: "request",
    description:
      "Generic read-only GET against the HighLevel API for endpoints not yet wrapped — custom objects, associations, prices, and other read endpoints.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is the NotFair GoHighLevel MCP server?",
    answer:
      "It's a remote MCP (Model Context Protocol) server at " +
      SERVER_URL +
      " that exposes your HighLevel CRM as a typed tool surface for AI agents. Claude Desktop, Claude.ai Web, Claude Cowork, Claude Code, and Codex can all connect to it; tools are read-only in the current release.",
  },
  {
    question: "How does authentication work?",
    answer:
      "Two paths. Claude.ai's Add custom connector flow uses OAuth 2.0 with PKCE — no Client ID or Secret to copy. CLI clients (Claude Code, Codex, custom) use a personal access token (PAT) you mint from the connect page; pass it as `Authorization: Bearer ghl_pat_*`. Tokens are scoped to a single HighLevel connection (Company or Location) and are revocable.",
  },
  {
    question: "Does it support agency installs?",
    answer:
      "Yes. When an agency installs the app via the Marketplace flow with bulk installation enabled, NotFair fans out per-location tokens automatically and exposes each location as its own MCP connection. PATs and Claude OAuth tokens scope to a single connection so you can keep agency-wide and per-location access separate.",
  },
  {
    question: "What HighLevel data is exposed?",
    answer:
      "Locations, contacts, conversations and message history, opportunities by pipeline, calendars and events, users, custom fields, tags, tasks, forms, surveys, workflows, invoices, payments, products, custom objects, and related read-only metadata. Tokens are encrypted at rest and refreshed server-side via HighLevel's standard refresh flow.",
  },
  {
    question: "Are there mutation tools?",
    answer:
      "Not yet. The current release is read-only by design so agents can answer questions about your CRM without risk. Mutation tools (create contact, send message, update opportunity) are on the roadmap and will require explicit human approval per call when they ship.",
  },
  {
    question: "How do I disconnect?",
    answer:
      "From /connect/gohighlevel: each connection has a Disconnect button that removes the local row and revokes both Claude OAuth tokens and personal access tokens. HighLevel's UNINSTALL webhook does the same automatically if you remove the app from inside HighLevel.",
  },
];

const RELATED_LINKS = [
  {
    href: "/gohighlevel-claude-connector-setup-guide",
    title: "Add the GoHighLevel connector to Claude",
    description:
      "Step-by-step guide to install the NotFair GoHighLevel connector in Claude Desktop, Web, or Cowork in under 2 minutes.",
  },
  {
    href: "/connect/gohighlevel",
    title: "Connect a HighLevel account",
    description:
      "Authorize NotFair to read your HighLevel CRM, mint a personal access token, or wire the MCP server into Claude.",
  },
  {
    href: "/meta-ads-mcp",
    title: "NotFair Meta Ads MCP",
    description:
      "The same shape for Meta — a remote MCP server that exposes Facebook + Instagram ad accounts to AI agents.",
  },
];

export function GoHighLevelMcpPage() {
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
              MCP Server · Remote · Read-only
            </p>
            <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
              GoHighLevel MCP Server
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              NotFair&apos;s GoHighLevel MCP exposes your CRM as a typed tool
              surface for AI agents. Built on the{" "}
              <a
                href="https://modelcontextprotocol.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E8E4DD] underline decoration-[#4CAF6E]/40 underline-offset-2 transition-colors hover:decoration-[#4CAF6E]"
              >
                Model Context Protocol
              </a>
              . Connect Claude, Codex, or any compliant client at{" "}
              <code className="rounded bg-[#24231F] px-1.5 py-0.5 font-mono text-sm text-[#E8E4DD]">
                {SERVER_URL}
              </code>{" "}
              and ask questions over live HighLevel data — contacts,
              conversations, opportunities, calendars.
            </p>
            <p className="mt-6 text-sm text-[#C4C0B6]">
              OAuth 2.0 with PKCE for Claude · Bearer-token PATs for CLI clients · Read-only by design.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Tools table ── */}
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
              Tool surface
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              What Claude can do with HighLevel
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
              Read-only tools, all scoped to the locations you connect.
              Mutation tools land in a future release behind explicit approval.
            </p>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            className="overflow-hidden rounded-xl border border-[#3D3C36]"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#3D3C36] bg-[#24231F]">
                  <th className="px-5 py-3 text-left font-medium text-[#C4C0B6]">Tool</th>
                  <th className="hidden px-5 py-3 text-left font-medium text-[#C4C0B6] sm:table-cell">
                    What it does
                  </th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map((tool, i) => (
                  <tr
                    key={tool.name}
                    className={`border-b border-[#3D3C36] ${
                      i % 2 === 0 ? "bg-[#1A1917]" : "bg-[#24231F]"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <code className="font-mono text-xs text-[#E8E4DD]">{tool.name}</code>
                    </td>
                    <td className="hidden px-5 py-3 text-[#C4C0B6] sm:table-cell">
                      {tool.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <p className="mt-4 text-xs italic text-[#C4C0B6]/70">
            Connector name in Claude / Codex configs:{" "}
            <code className="font-mono not-italic text-[#E8E4DD]">
              {GHL_MCP_CONNECTOR_NAME}
            </code>
          </p>
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
              Connect HighLevel and try it in Claude
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
              Authorize NotFair to read your HighLevel CRM, then add the MCP
              server to Claude. The first prompt to try: &ldquo;summarize my
              last 50 conversations and flag the unanswered ones.&rdquo;
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link href="/connect/gohighlevel">
                <Button className="h-12 rounded-lg bg-[#4CAF6E] px-6 text-base font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]">
                  Connect HighLevel
                </Button>
              </Link>
              <Link
                href="/gohighlevel-claude-connector-setup-guide"
                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
              >
                Read the Claude connector setup guide
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <a
                href="https://claude.ai/settings/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
              >
                Or open Claude Connectors directly
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqSection
        title="FAQ — GoHighLevel MCP Server"
        intro="Everything you need to know about the NotFair GoHighLevel MCP server, its auth model, and the tool surface."
        items={FAQ_ITEMS}
      />

      {/* ── Related Pages ── */}
      <LandingLinksSection
        title="Related guides"
        intro="Explore the rest of the NotFair MCP ecosystem."
        links={RELATED_LINKS}
      />
    </div>
  );
}
