"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { AnyMcpClientSetup } from "@/components/any-mcp-client-setup";
import { META_MCP_CONNECTOR_NAME, META_MCP_SERVER_URL } from "@/lib/brand";
import type { FaqItem } from "@/lib/seo";

const SERVER_URL = META_MCP_SERVER_URL;

const VISIBLE_TOOLS = 6;

const TOOLS: { name: string; category: "Read" | "Write"; description: string }[] = [
    { name: "runScript", category: "Read", description: "Sandboxed JS with Graph API fan-out — fan out 20 calls in one pass for audits and analysis." },
    { name: "getInsights", category: "Read", description: "Performance insights with breakdowns: spend, impressions, clicks, CTR, CPC, CPM, conversions." },
    { name: "listCampaigns", category: "Read", description: "List campaigns with status, objective, budget, bid strategy, and schedule." },
    { name: "listAdSets", category: "Read", description: "Ad set details: optimization goal, billing event, daily/lifetime budget, targeting summary." },
    { name: "listAds", category: "Read", description: "Ads with status, parent ad set/campaign, creative envelope, configured status." },
    { name: "getAdAccount", category: "Read", description: "Account snapshot: currency, timezone, balance, amount spent, spend cap, parent BM." },
    { name: "pauseCampaign", category: "Write", description: "Pause a Meta campaign — reversible via enableCampaign." },
    { name: "pauseAdSet", category: "Write", description: "Pause an ad set without touching its parent campaign." },
    { name: "updateCampaignBudget", category: "Write", description: "Update daily or lifetime budget on a Meta campaign." },
    { name: "renameCampaign", category: "Write", description: "Rename a Meta campaign in place." },
];

const FAQ_ITEMS: FaqItem[] = [
    {
        question: "What is the NotFair Meta Ads MCP server?",
        answer:
            "It's a hosted Model Context Protocol server that exposes your Meta ad accounts (Facebook + Instagram) to MCP-compatible AI clients. Read tools provide live campaign context for diagnosis; write tools propose fixes that you approve in chat.",
    },
    {
        question: "Which MCP clients are supported?",
        answer:
            "Any client that speaks the MCP Streamable HTTP transport — Claude.ai (Web, Desktop, Cowork), Claude Code, OpenAI Codex CLI, Cursor, Cline, and custom MCP clients. The server URL is the same; only the client-side config differs.",
    },
    {
        question: "Do I need to self-host anything?",
        answer:
            `No. The Meta Ads MCP server is hosted at ${SERVER_URL}. You just point your client at it and authenticate.`,
    },
    {
        question: "How does authentication work?",
        answer:
            "OAuth 2.0 with PKCE is the recommended flow — Claude.ai and Codex run it automatically. For clients that don't support OAuth, you can use a Bearer token via the Authorization header. Generate either at notfair.co/connect/meta-ads.",
    },
    {
        question: "Is the MCP server free?",
        answer:
            "Yes. Connecting to NotFair's Meta MCP is free with no credit card. Paid plans unlock higher usage limits and team features.",
    },
    {
        question: "Can the AI write to my Meta ad accounts through this server?",
        answer:
            "Only with your explicit approval. Write tools propose changes (pause campaigns, adjust budgets, rename entities, etc.), the client surfaces them, and you confirm before anything hits the Meta Marketing API. Read access is unrestricted; write access is gated.",
    },
    {
        question: "Does this work for both Facebook and Instagram ads?",
        answer:
            "Yes. Meta Ads covers both Facebook and Instagram inventory under a single ad account. The MCP exposes everything Meta surfaces through the Marketing API: campaigns, ad sets, ads, creative, audiences, insights, and the parent Business Manager.",
    },
];

const RELATED_LINKS = [
    {
        href: "/meta-ads-claude-connector-setup-guide",
        title: "Meta Ads Claude Connector setup guide",
        description: "Install NotFair's Meta connector inside Claude.ai Web, Desktop, or Cowork.",
    },
    {
        href: "/meta-ads-claude-code-plugin-setup-guide",
        title: "Meta Ads Claude Code plugin setup guide",
        description: "Install the NotFair plugin in Claude Code via the toprank marketplace for Meta Ads.",
    },
    {
        href: "/meta-ads-codex-mcp-setup-guide",
        title: "Meta Ads Codex MCP setup guide",
        description: "One-line install of the NotFair Meta MCP for OpenAI's Codex CLI.",
    },
];

export function MetaAdsMcpPage() {
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
                            Meta Ads MCP server
                        </p>
                        <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
                            Hosted Meta Ads MCP server
                        </h1>
                        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
                            NotFair ships a hosted{" "}
                            <a
                                href="https://modelcontextprotocol.io/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#E8E4DD] underline decoration-[#4CAF6E]/40 underline-offset-2 transition-colors hover:decoration-[#4CAF6E]"
                            >
                                Model Context Protocol
                            </a>{" "}
                            server at{" "}
                            <code className="rounded bg-[#24231F] px-1.5 py-0.5 font-mono text-sm text-[#E8E4DD]">
                                {SERVER_URL}
                            </code>
                            . Drop the generic config below into any MCP-compatible
                            client so your AI can diagnose Facebook + Instagram ad
                            accounts and draft fixes — auth via OAuth or Bearer
                            token.
                        </p>
                        <p className="mt-6 text-sm text-[#C4C0B6]">
                            Free · OAuth 2.0 · No credit card
                        </p>
                        <p className="mt-3 text-xs text-[#C4C0B6]/70">
                            New to MCP? Read the spec at{" "}
                            <a
                                href="https://modelcontextprotocol.io/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                            >
                                modelcontextprotocol.io
                                <ExternalLink className="h-3 w-3" />
                            </a>
                            .
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* ── Configurations ── */}
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
                            Generic MCP config
                        </p>
                        <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
                            Two configs that work in any MCP client
                        </h2>
                        <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                            For client-specific walkthroughs (Claude.ai, Claude
                            Code, Codex), see the per-client setup guides linked
                            below.
                        </p>
                    </motion.div>

                    <AnyMcpClientSetup
                        apiKey={null}
                        surface="marketing"
                        serverUrl={META_MCP_SERVER_URL}
                        connectorName={META_MCP_CONNECTOR_NAME}
                    />
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
                            Tools exposed
                        </p>
                        <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
                            What your AI client can read and change
                        </h2>
                        <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                            Read tools provide live ad-account context. Write tools
                            propose changes — every write requires explicit human
                            approval before it hits the Meta Marketing API.
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
                                    <th className="px-5 py-3 text-left font-medium text-[#C4C0B6]">Type</th>
                                    <th className="hidden px-5 py-3 text-left font-medium text-[#C4C0B6] sm:table-cell">
                                        What it does
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {TOOLS.slice(0, VISIBLE_TOOLS).map((tool, i) => (
                                    <tr
                                        key={tool.name}
                                        className={`border-b border-[#3D3C36] ${
                                            i % 2 === 0 ? "bg-[#1A1917]" : "bg-[#24231F]"
                                        }`}
                                    >
                                        <td className="px-5 py-3">
                                            <code className="font-mono text-xs text-[#E8E4DD]">
                                                {tool.name}
                                            </code>
                                        </td>
                                        <td className="px-5 py-3">
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
                                        <td className="hidden px-5 py-3 text-[#C4C0B6] sm:table-cell">
                                            {tool.description}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-[#1A1917]">
                                    <td
                                        colSpan={3}
                                        className="px-5 py-3 text-center text-xs italic text-[#C4C0B6]/70"
                                    >
                                        and more
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </motion.div>
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
                            Ready to wire up your client?
                        </h2>
                        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
                            Sign in to NotFair, link your Meta ad accounts, then
                            paste a config above into your MCP client.
                        </p>
                        <div className="mt-6 flex flex-col items-center gap-3">
                            <Link
                                href="/connect/meta-ads/any-mcp"
                                onClick={() =>
                                    trackEvent("cta_clicked", {
                                        page: "meta-ads-mcp",
                                        cta: "open_connect_page",
                                        destination: "/connect/meta-ads/any-mcp",
                                    })
                                }
                            >
                                <Button className="h-12 rounded-lg bg-[#4CAF6E] px-6 text-base font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]">
                                    Sign in to continue
                                </Button>
                            </Link>
                            <Link
                                href="/meta-ads-claude-connector-setup-guide"
                                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
                            >
                                Or follow a per-client setup guide
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── FAQ ── */}
            <FaqSection
                title="FAQ — NotFair Meta MCP server"
                intro="Common questions about authenticating, configuring, and using the NotFair Meta Ads MCP server."
                items={FAQ_ITEMS}
            />

            {/* ── Related Pages ── */}
            <LandingLinksSection
                title="Per-client setup guides"
                intro="Walkthroughs for each supported client."
                links={RELATED_LINKS}
            />
        </div>
    );
}
