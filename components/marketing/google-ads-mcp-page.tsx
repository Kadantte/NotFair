"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, ExternalLink, Key, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import type { FaqItem } from "@/lib/seo";

const SERVER_URL = "https://notfair.co/api/mcp";

const CURSOR_CONFIG = `{
  "mcpServers": {
    "adsagent": {
      "url": "${SERVER_URL}"
    }
  }
}`;

const BEARER_CONFIG = `{
  "mcpServers": {
    "adsagent": {
      "url": "${SERVER_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_ADSAGENT_API_KEY"
      }
    }
  }
}`;

const VISIBLE_TOOLS = 6;

const TOOLS: { name: string; category: "Read" | "Write"; description: string }[] = [
    { name: "runScript", category: "Read", description: "Sandboxed JS with GAQL fan-out — every analytical read goes through this one tool." },
    { name: "getRecommendations", category: "Read", description: "Google's optimization suggestions with estimated impact." },
    { name: "getKeywordIdeas", category: "Read", description: "Keyword Planner search volume, competition, and CPC estimates." },
    { name: "getChanges", category: "Read", description: "NotFair's own change log — undoable with one call." },
    { name: "reviewChangeImpact", category: "Read", description: "Before/after impact analysis on recent edits." },
    { name: "getResourceMetadata", category: "Read", description: "GAQL schema discovery for custom queries." },
    { name: "updateBid", category: "Write", description: "Adjust keyword or ad group bids — reviewable before apply." },
    { name: "pauseCampaign", category: "Write", description: "Pause underperforming campaigns." },
    { name: "addNegativeKeyword", category: "Write", description: "Block wasted search terms instantly." },
    { name: "createAd", category: "Write", description: "Write and launch new ad copy through chat." },
];

const FAQ_ITEMS: FaqItem[] = [
    {
        question: "What is the NotFair Google Ads MCP server?",
        answer:
            "It's a hosted Model Context Protocol server that exposes your Google Ads account to MCP-compatible AI clients. Read tools provide live campaign context; write tools propose changes that you approve in chat.",
    },
    {
        question: "Which MCP clients are supported?",
        answer:
            "Any client that speaks the MCP Streamable HTTP transport — Claude.ai (Web, Desktop, Cowork), Claude Code, OpenAI Codex CLI, Cursor, Cline, and custom MCP clients. The server URL is the same; only the client-side config differs.",
    },
    {
        question: "Do I need to self-host anything?",
        answer:
            "No. The server is hosted at https://notfair.co/api/mcp. You just point your client at it and authenticate.",
    },
    {
        question: "How does authentication work?",
        answer:
            "OAuth 2.0 with PKCE is the recommended flow — Claude.ai and Codex run it automatically. For clients that don't support OAuth, you can use a Bearer token via the Authorization header. Generate either at notfair.co/connect.",
    },
    {
        question: "Is the MCP server free?",
        answer:
            "Yes. Connecting and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
    },
    {
        question: "Can the AI write to my account through this server?",
        answer:
            "Only with your explicit approval. Write tools propose changes, the client surfaces them, and you confirm before anything hits the Google Ads API. Read access is unrestricted; write access is gated.",
    },
];

const RELATED_LINKS = [
    {
        href: "/google-ads-claude-connector-setup-guide",
        title: "Claude Connector setup guide",
        description: "Install NotFair as a custom MCP connector inside Claude.ai Web, Desktop, or Cowork.",
    },
    {
        href: "/google-ads-claude-code-plugin-setup-guide",
        title: "Claude Code plugin setup guide",
        description: "Install NotFair in Claude Code via the toprank plugin marketplace.",
    },
    {
        href: "/google-ads-codex-mcp-setup-guide",
        title: "Codex MCP setup guide",
        description: "One-line install of the NotFair MCP for OpenAI's Codex CLI.",
    },
];

export function GoogleAdsMcpPage() {
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
                            Google Ads MCP server
                        </p>
                        <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
                            Hosted Google Ads MCP server
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
                            . Drop the generic config below into any
                            MCP-compatible client — auth via OAuth or Bearer
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

                    <div className="space-y-10">
                        <ConfigBlock
                            id="oauth"
                            title="OAuth 2.0 (recommended)"
                            subtitle="Drop into ~/.cursor/mcp.json (Cursor), the Cline settings JSON, or any client that takes the standard MCP config schema. The client opens a browser for sign-in."
                        >
                            <CodeBlock
                                code={CURSOR_CONFIG}
                                language="json"
                                trackingStep="oauth_json"
                            />
                        </ConfigBlock>

                        <ConfigBlock
                            id="bearer"
                            title="Bearer token (for clients without OAuth)"
                            subtitle="Pass an Authorization header instead. Generate the API key on the connect page."
                            footer={
                                <span className="inline-flex items-center gap-1.5">
                                    <Lock className="h-3.5 w-3.5 text-[#C4C0B6]" />
                                    Treat the API key like a password — don&apos;t commit
                                    it to source control.
                                </span>
                            }
                        >
                            <div className="space-y-4">
                                <ApiKeyCta connected={session.connected} />
                                <CodeBlock
                                    code={BEARER_CONFIG}
                                    language="json"
                                    trackingStep="bearer_json"
                                />
                            </div>
                        </ConfigBlock>
                    </div>
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
                            Read tools provide live account context. Write tools
                            propose changes — every write requires explicit human
                            approval before it hits the Google Ads API.
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
                                        and 60+ more
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
                            Sign in with Google to generate your credentials, then
                            paste a config above into your MCP client.
                        </p>
                        <div className="mt-6 flex flex-col items-center gap-3">
                            <ConnectButton connected={session.connected} large />
                            <Link
                                href="/google-ads-claude-connector-setup-guide"
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
                title="FAQ — NotFair MCP server"
                intro="Common questions about authenticating, configuring, and using the NotFair Google Ads MCP server."
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

/* ─────────────────────────────────────────────────── helpers ────────────── */

function ConfigBlock({
    id,
    title,
    subtitle,
    children,
    footer,
}: {
    id: string;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    return (
        <div id={id} className="scroll-mt-24 rounded-xl border border-[#3D3C36] bg-[#24231F]">
            <div className="border-b border-[#3D3C36] px-5 py-4">
                <h3 className="text-base font-semibold text-[#E8E4DD]">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">{subtitle}</p>
            </div>
            <div className="p-5">{children}</div>
            {footer && (
                <div className="border-t border-[#3D3C36] px-5 py-3 text-xs leading-relaxed text-[#C4C0B6]">
                    {footer}
                </div>
            )}
        </div>
    );
}

function CodeBlock({
    code,
    language,
    trackingStep,
}: {
    code: string;
    language: string;
    trackingStep: string;
}) {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        trackEvent("install_command_copied", {
            setup_tab: "google-ads-mcp-page",
            surface: "marketing",
            step: trackingStep,
        });
        setTimeout(() => setCopied(false), 2000);
    }, [code, trackingStep]);

    return (
        <div className="relative overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917]">
            <div className="flex items-center justify-between border-b border-[#3D3C36] px-4 py-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#C4C0B6]/80">
                    {language}
                </span>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#3D3C36] bg-[#24231F] px-2.5 py-1 text-xs text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
                >
                    {copied ? (
                        <>
                            <Check className="h-3.5 w-3.5 text-[#4CAF6E]" />
                            <span className="text-[#4CAF6E]">Copied</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                        </>
                    )}
                </button>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-[#E8E4DD]">
                <code>{code}</code>
            </pre>
        </div>
    );
}

function ApiKeyCta({ connected }: { connected: boolean }) {
    const handleClick = useCallback(() => {
        trackEvent("cta_clicked", {
            page: "google-ads-mcp",
            cta: connected ? "open_api_key_page" : "sign_in_for_api_key",
            destination: "/connect/claude-code/manual",
            requires_auth: !connected,
        });
        startGoogleConnect("/connect/claude-code/manual");
    }, [connected]);

    return (
        <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/5 p-4">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10">
                    <Key className="h-4 w-4 text-[#4CAF6E]" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#E8E4DD]">
                        {connected ? "Open your API key page" : "Get your API key"}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">
                        {connected
                            ? "Open the connect page to copy your personal API key."
                            : "Sign in with Google. We'll redirect you to the connect page where you can copy your API key."}
                    </p>
                    <Button
                        onClick={handleClick}
                        className="mt-3 h-10 rounded-lg bg-[#4CAF6E] px-4 text-sm font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
                    >
                        {connected ? (
                            <>
                                Open API key page
                                <ExternalLink className="ml-1.5 h-4 w-4" />
                            </>
                        ) : (
                            "Sign in with Google"
                        )}
                    </Button>
                </div>
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
            page: "google-ads-mcp",
            cta: connected ? "open_connect_page" : "sign_in_with_google",
            destination: "/connect",
            requires_auth: !connected,
        });
        startGoogleConnect("/connect");
    }, [connected]);

    const sizeClass = large ? "h-12 px-6 text-base" : "h-11 px-5 text-sm";

    return (
        <Button
            onClick={handleClick}
            className={`${sizeClass} rounded-lg bg-[#4CAF6E] font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]`}
        >
            {connected ? (
                <>
                    Open connect page <ExternalLink className="ml-1.5 h-4 w-4" />
                </>
            ) : (
                "Sign in with Google to continue"
            )}
        </Button>
    );
}
