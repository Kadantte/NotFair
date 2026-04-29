"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Terminal, Eye, Shield, Zap, CheckCircle } from "lucide-react";
import { AuditCTA, fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { useSession } from "@/components/session-provider";
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
  { name: "runScript", category: "Read", description: "Sandboxed JS with GAQL fan-out — every analytical read goes through this one tool" },
  { name: "getRecommendations", category: "Read", description: "Google's optimization suggestions with estimated impact" },
  { name: "getKeywordIdeas", category: "Read", description: "Keyword Planner search volume, competition, and CPC" },
  { name: "getChanges", category: "Read", description: "NotFair's own change log, undoable with one call" },
  { name: "reviewChangeImpact", category: "Read", description: "Before/after impact analysis on recent edits" },
  { name: "getResourceMetadata", category: "Read", description: "GAQL schema discovery for custom queries" },
  { name: "updateBid", category: "Write", description: "Adjust keyword or ad group bids — reviewable" },
  { name: "pauseCampaign", category: "Write", description: "Pause underperforming campaigns" },
  { name: "addNegativeKeyword", category: "Write", description: "Block irrelevant search terms after review" },
];

const steps = [
  {
    num: "1",
    title: "Add to your MCP config",
    desc: "Paste one JSON snippet into Claude Desktop, Claude Code, or Claude Cowork. No API keys needed at this step.",
  },
  {
    num: "2",
    title: "Connect Google Ads via OAuth",
    desc: "One-click at notfair.co. Read-only until you explicitly approve a change — your account stays safe.",
  },
  {
    num: "3",
    title: "Query your account in plain English",
    desc: 'Ask "why did CPA rise and what should I fix?" and get a specific answer backed by live data — no CSV exports.',
  },
];

const clients = ["Claude Desktop", "Claude Code", "Claude Cowork", "Any MCP stdio client"];

const relatedLinks = [
  { href: "/google-ads-claude", title: "Google Ads + Claude", description: "The full guide to using Claude with your Google Ads account." },
  { href: "/google-ads-audit", title: "Free Google Ads Audit", description: "Run a free AI-powered diagnosis — find waste, missed opportunities, and structural issues in 5 minutes." },
  { href: "/blog/google-ads-ai-agent", title: "What Is a Google Ads AI Agent?", description: "What AI agents can actually do for campaign management." },
];

/* ─────────────────────────────────────────────────────── Component ──────── */

export function GoogleAdsMcpServerPage({ faqItems }: { faqItems: FaqItem[] }) {
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
                Give your AI agent
                <br />
                live Google Ads
                <br />
                <span className="text-[#4CAF6E]">access.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#C4C0B6]">
                NotFair is a production-ready Model Context Protocol server for
                Google Ads. Drop it into Claude Desktop, Claude Code, or any
                MCP-compatible client — and your AI gets live campaign data plus
                the ability to diagnose issues and take reviewed actions.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3">
                <AuditCTA session={session} page="google-ads-mcp-server" size="lg" />
                <p className="text-sm text-[#C4C0B6]">
                  Free to connect · 2-minute setup · No API key needed
                </p>
              </div>
            </motion.div>

            {/* Right — config snippet */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
              className="rounded-lg border border-[#3D3C36] bg-[#24231F] overflow-hidden"
            >
              <div className="flex items-center gap-2 border-b border-[#3D3C36] px-4 py-3">
                <Terminal className="h-4 w-4 text-[#4CAF6E]" />
                <span className="font-mono-jb text-xs text-[#C4C0B6]">
                  claude_desktop_config.json
                </span>
              </div>
              <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
                <code className="font-mono-jb text-[#E8E4DD]">{MCP_CONFIG}</code>
              </pre>
              <div className="border-t border-[#3D3C36] px-5 py-4">
                <p className="text-xs text-[#C4C0B6]">
                  Compatible with:{" "}
                  {clients.map((c, i) => (
                    <span key={c}>
                      <span className="text-[#E8E4DD]">{c}</span>
                      {i < clients.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Tools table ── */}
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
              MCP Tools
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Everything your agent can do.
            </h2>
            <p className="mt-4 max-w-xl text-base text-[#C4C0B6]">
              Read tools return live data. Write tools stage a change for your
              review before anything touches your account.
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
                  <th className="px-5 py-3 text-left font-mono-jb text-xs font-semibold uppercase tracking-wide text-[#C4C0B6]">
                    Tool
                  </th>
                  <th className="px-5 py-3 text-left font-mono-jb text-xs font-semibold uppercase tracking-wide text-[#C4C0B6]">
                    Type
                  </th>
                  <th className="px-5 py-3 text-left font-mono-jb text-xs font-semibold uppercase tracking-wide text-[#C4C0B6]">
                    What it does
                  </th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool, i) => (
                  <tr
                    key={tool.name}
                    className={`border-b border-[#3D3C36] last:border-0 ${i % 2 === 0 ? "bg-[#1A1917]" : "bg-[#1E1D1A]"}`}
                  >
                    <td className="px-5 py-3.5 font-mono-jb text-xs text-[#E8E4DD]">
                      {tool.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          tool.category === "Read"
                            ? "bg-[#4CAF6E]/10 text-[#4CAF6E]"
                            : "bg-[#D4882A]/10 text-[#D4882A]"
                        }`}
                      >
                        {tool.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#C4C0B6]">
                      {tool.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* ── Setup steps ── */}
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
              2-minute setup
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              From zero to live campaign data.
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
                  <span className="font-mono-jb text-sm font-semibold text-[#4CAF6E]">
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

      {/* ── Trust signals ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Eye, title: "Read-only by default", body: "Your agent sees everything but changes nothing until you approve each action explicitly." },
              { icon: Shield, title: "OAuth 2.0 auth", body: "Google's standard OAuth. Your credentials never touch NotFair's servers — tokens stay local." },
              { icon: Zap, title: "Production-ready", body: "Not a demo. Proper error handling, pagination, and MCP protocol compliance out of the box." },
            ].map(({ icon: Icon, title, body }, i) => (
              <motion.div
                key={title}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.08 }}
                className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-[#3D3C36] bg-[#2E2D28]">
                  <Icon className="h-4 w-4 text-[#4CAF6E]" />
                </div>
                <h3 className="text-sm font-semibold text-[#E8E4DD]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">{body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For non-devs ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 md:grid-cols-2 md:gap-16">
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                No code required
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD]">
                Not a developer? Still works.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
                The setup is editing a JSON file — copy, paste, save. After that
                it&apos;s entirely natural language. Ask Claude questions about your
                campaigns and let it do the analysis.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Which campaigns are wasting the most money?",
                  "Show me my top search terms this week",
                  "Which keywords have the worst Quality Score?",
                  "Run a full audit on my account",
                ].map((prompt) => (
                  <li key={prompt} className="flex items-start gap-2.5">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF6E]" />
                    <span className="font-mono-jb text-sm text-[#C4C0B6]">
                      &ldquo;{prompt}&rdquo;
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-[#C4C0B6]">
                For a step-by-step guide,{" "}
                <Link
                  href="/google-ads-claude"
                  className="text-[#4CAF6E] hover:underline"
                >
                  see the Claude walkthrough →
                </Link>
              </p>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="flex flex-col gap-4"
            >
              <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C4C0B6]">
                  What you ask
                </p>
                <p className="mt-2 text-sm text-[#E8E4DD]">
                  &ldquo;Which campaigns spent over $500 last month with zero conversions?&rdquo;
                </p>
              </div>
              <div className="rounded-lg border border-[#4CAF6E]/20 bg-[#24231F] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#4CAF6E]">
                  What Claude does
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                  Calls <span className="font-mono-jb text-[#E8E4DD]">runScript</span> with a GAQL fan-out across campaigns and search terms, filters for cost &gt; $500 and conversions = 0 in-script, then returns a ranked list with spend breakdown and top wasted search terms for each.
                </p>
              </div>
              <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C4C0B6]">
                  What you decide
                </p>
                <p className="mt-2 text-sm text-[#E8E4DD]">
                  Approve, modify, or skip each recommended action. Nothing changes until you say so.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqSection title="Frequently asked questions" items={faqItems} />

      {/* ── Related links ── */}
      <LandingLinksSection title="Learn more" links={relatedLinks} />

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
                Connect the Google Ads MCP server.
              </h2>
              <p className="mt-3 text-base text-[#C4C0B6]">
                Free. 2-minute setup. Your agent gets live access to every
                campaign, keyword, and search term in your account.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <AuditCTA session={session} page="google-ads-mcp-server" size="lg" />
              <p className="text-sm text-[#C4C0B6]">
                Read-only OAuth · changes require approval · no credit card
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
