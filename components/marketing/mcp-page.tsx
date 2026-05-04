"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { McpSetupHero } from "@/components/marketing/mcp-setup-hero";
import { MarketingEngineSection } from "@/components/marketing/marketing-engine-section";
import {
    MCP_CONNECTOR_NAME,
    MCP_SERVER_URL,
    META_MCP_CONNECTOR_NAME,
    META_MCP_SERVER_URL,
} from "@/lib/brand";
import type { FaqItem } from "@/lib/seo";

/* ─────────────────────────── Page-only data ─────────────────────────── */

const USE_CASES = [
    { label: "SMB founders", body: "Self-doers running their own Google or Meta spend. Replace the agency review call with a Claude conversation." },
    { label: "Performance agencies", body: "Onboard a new account, audit it, and ship the fix list before the kickoff call ends." },
    { label: "E-commerce ops", body: "Daily search-term sweeps, negative-list maintenance, and budget reshuffles run from a single agent prompt." },
    { label: "Lead-gen teams", body: "Match search terms to MQL quality, tighten match types, and route budget toward the geos and keywords that close." },
    { label: "Solo consultants", body: "Manage ten accounts the way you used to manage one. One MCP endpoint per client, one chat per question." },
];

const FAQ_ITEMS: FaqItem[] = [
    { question: "What is NotFair MCP?", answer: "Two hosted Model Context Protocol servers — one for Google Ads, one for Meta Ads — that expose your accounts to MCP-compatible AI clients. Reads stream live campaign data; writes are proposed in chat and require explicit approval before they hit the ad platform." },
    { question: "Which AI clients can I use?", answer: "Anything that speaks the MCP Streamable HTTP transport: Claude.ai (Web, Desktop, Cowork), Claude Code, OpenAI Codex CLI, Cursor, Cline, and custom MCP clients. The server URL stays the same — only the client-side config differs." },
    { question: "Do I need to self-host anything?", answer: `No. Both servers are hosted by NotFair at ${MCP_SERVER_URL} and ${META_MCP_SERVER_URL}. You connect the underlying ad account once via OAuth and point your client at the URL.` },
    { question: "How does authentication work?", answer: "OAuth 2.0 with PKCE is the default — Claude.ai and Codex run it automatically. For clients that don't support OAuth, you can use a Bearer token via the Authorization header. Generate either at notfair.co/connect or notfair.co/connect/meta-ads." },
    { question: "Can the AI write to my ad accounts?", answer: "Only with explicit approval. Write tools propose changes, the client surfaces the diff, and you confirm before anything hits the Google Ads or Meta Marketing API. Read access is unrestricted; every write is gated." },
    { question: "What does it cost?", answer: "Connecting and running audits is free with no credit card. Paid plans unlock higher usage limits and team features." },
    { question: "Where do I find platform-specific configs?", answer: "The /google-ads-mcp and /meta-ads-mcp pages have generic JSON snippets that work in any MCP client. The per-client setup guides walk through Claude.ai, Claude Code, and Codex specifically." },
];

const RELATED_LINKS = [
    { href: "/google-ads-mcp", title: "Google Ads MCP server", description: `Generic MCP config and tool list for ${MCP_CONNECTOR_NAME}.` },
    { href: "/meta-ads-mcp", title: "Meta Ads MCP server", description: `Generic MCP config and tool list for ${META_MCP_CONNECTOR_NAME}.` },
    { href: "/google-ads-claude-connector-setup-guide", title: "Claude Connector setup guide", description: "Install NotFair as a custom MCP connector inside Claude.ai Web, Desktop, or Cowork." },
    { href: "/google-ads-claude-code-plugin-setup-guide", title: "Claude Code plugin setup guide", description: "Install NotFair in Claude Code via the toprank plugin marketplace." },
    { href: "/google-ads-codex-mcp-setup-guide", title: "Codex MCP setup guide", description: "One-line install of the NotFair MCP for OpenAI's Codex CLI." },
    { href: "/pricing", title: "Pricing", description: "Free to connect. Paid plans for higher usage and team features." },
];

/* ─────────────────────────── Atoms ─────────────────────────── */

function ChapterBadge({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4CAF6E]">
            {children}
        </span>
    );
}

/* ─────────────────────────── Page ─────────────────────────── */

export function McpPage() {
    return (
        <div className="bg-[#1A1917] text-[#E8E4DD]">
            <McpSetupHero syncUrl surface="mcp" />

            <MarketingEngineSection />

            {/* ── Use cases ── */}
            <section className="border-t border-[#3D3C36] px-4 py-20 md:py-28">
                <div className="mx-auto max-w-6xl">
                    <motion.h2
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] md:text-4xl"
                    >
                        Built for the people<br className="hidden md:block" /> spending the budget.
                    </motion.h2>

                    <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {USE_CASES.map((uc) => (
                            <div
                                key={uc.label}
                                className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-7"
                            >
                                <ChapterBadge>{uc.label}</ChapterBadge>
                                <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
                                    {uc.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Final CTA ── */}
            <section className="border-t border-[#3D3C36] px-4 py-24 md:py-32">
                <div className="mx-auto max-w-4xl text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                        <h2 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] md:text-4xl">
                            Wire it up.<br /> Operate from chat.
                        </h2>
                        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Button
                                onClick={() => {
                                    trackEvent("cta_clicked", {
                                        page: "mcp",
                                        cta: "footer_connect_google",
                                        destination: "/connect/any-mcp",
                                    });
                                    startGoogleConnect("/connect/any-mcp");
                                }}
                                className="h-12 rounded-full bg-[#4CAF6E] px-7 text-base font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
                            >
                                Connect Google Ads
                            </Button>
                            <Link
                                href="/connect/meta-ads"
                                onClick={() => {
                                    trackEvent("cta_clicked", {
                                        page: "mcp",
                                        cta: "footer_connect_meta",
                                        destination: "/connect/meta-ads",
                                    });
                                }}
                                className="inline-flex h-12 items-center justify-center rounded-full border border-[#3D3C36] bg-[#24231F] px-7 text-base font-semibold text-[#E8E4DD] transition hover:border-[#4D4C46] hover:bg-[#2E2D28]"
                            >
                                Connect Meta Ads
                            </Link>
                        </div>
                        <p className="mt-6 text-sm text-[#C4C0B6]">
                            Free · OAuth 2.0 · No credit card
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* ── FAQ ── */}
            <FaqSection
                title="FAQ — NotFair MCP"
                intro="Common questions about authenticating, configuring, and operating the NotFair MCP servers."
                items={FAQ_ITEMS}
            />

            {/* ── Related ── */}
            <LandingLinksSection
                title="Server configs and per-client guides"
                intro="Platform-specific configs and step-by-step setup walkthroughs for each supported client."
                links={RELATED_LINKS}
            />
        </div>
    );
}
