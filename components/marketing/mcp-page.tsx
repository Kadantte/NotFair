"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import {
    MCP_CONNECTOR_NAME,
    MCP_SERVER_URL,
    META_MCP_CONNECTOR_NAME,
    META_MCP_SERVER_URL,
} from "@/lib/brand";
import type { FaqItem } from "@/lib/seo";

/* ─────────────────────────── Tracking ─────────────────────────── */

/** Wire one place — every CopyField inside the PLATFORMS data table goes through here. */
function trackSetupCopied(client: string, field: string) {
    trackEvent("mcp_setup_copied", { client, field });
}

/* ─────────────────────────── Data ─────────────────────────── */

type Platform = {
    id: string;
    name: string;
    /** Renders the small square logo inside the hero pill */
    Logo: (props: { className?: string }) => ReactNode;
    /** Tailwind text color class for the platform name in the pill */
    nameColor: string;
    /** Tailwind ring color for the pill outline */
    ringClass: string;
    /** Tailwind bg color for the pill */
    pillBgClass: string;
    steps: { title: string; body: ReactNode }[];
};

/**
 * Real platform logos.
 * - Claude / Cursor: SVG path data from simpleicons.org (MIT-licensed brand icon set).
 * - OpenClaw: real favicon from openclaw.ai (gradient lobster), referenced as <img>.
 * - Codex: official OpenAI hexagonal-knot SVG (already used elsewhere in this codebase).
 * - Hermes Agent: official icon.png from hermes-agent.nousresearch.com — they don't publish an SVG.
 */
function ClaudeLogo({ className = "" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fill="#D97757"
                d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
            />
        </svg>
    );
}

function OpenClawLogo({ className = "" }: { className?: string }) {
    // Real openclaw.ai favicon — has its own embedded gradient, render via <img>.
    return (
        <img
            src="/platform-logos/openclaw.svg"
            alt=""
            aria-hidden="true"
            className={className}
        />
    );
}

function CodexLogo({ className = "" }: { className?: string }) {
    // Official OpenAI hexagonal-knot logo — absolute-positioned dead-center
    // inside a rounded white square so any intrinsic-sizing asymmetry can't
    // push the knot off the geometric center of the badge.
    return (
        <span
            className={`relative inline-block rounded-md bg-white ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                className="absolute left-1/2 top-1/2 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2"
                fill="#000000"
                fillRule="evenodd"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
            </svg>
        </span>
    );
}

function CursorLogo({ className = "" }: { className?: string }) {
    // Real Cursor wordmark "diamond" from simpleicons.org.
    // Uses `currentColor` so the diamond inverts to dark when its parent
    // (the selected tab pill) flips to a light background.
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill="currentColor"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
        </svg>
    );
}

function HermesLogo({ className = "" }: { className?: string }) {
    // Real icon.png from hermes-agent.nousresearch.com — they don't publish an SVG.
    return (
        <img
            src="/platform-logos/hermes.png"
            alt=""
            aria-hidden="true"
            className={className}
        />
    );
}

const PLATFORMS: Platform[] = [
    {
        id: "claude",
        name: "Claude",
        Logo: ClaudeLogo,
        nameColor: "text-[#D97757]",
        ringClass: "ring-[#D97757]/40",
        pillBgClass: "bg-[#D97757]/15",
        steps: [
            {
                title: "Open Claude settings",
                body: (
                    <>
                        Open the Claude connectors page directly:
                        <a
                            href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                                trackEvent("mcp_step_clicked", {
                                    client: "claude",
                                    step: "open_connectors",
                                })
                            }
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-[12px] text-[#E8E4DD] transition-colors hover:border-[#4CAF6E]/60 hover:text-[#4CAF6E]"
                        >
                            Customize → Connectors
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </>
                ),
            },
            {
                title: "Add a custom connector",
                body: (
                    <>
                        Paste in to the modal:
                        <CopyField
                            label="Name"
                            value={MCP_CONNECTOR_NAME}
                            className="mt-3"
                            onCopy={() => trackSetupCopied("claude", "name")}
                        />
                        <CopyField
                            label="Remote MCP server URL"
                            value={MCP_SERVER_URL}
                            className="mt-2"
                            onCopy={() => trackSetupCopied("claude", "server_url")}
                        />
                    </>
                ),
            },
            {
                title: "Sign in and start asking",
                body: (
                    <>
                        After clicking <CodeInline>Add</CodeInline>, Claude opens a sign-in flow. Sign in with NotFair and you're all set. Try:{" "}
                        <CodeInline>Audit my Google Ads account and rank fixes by impact.</CodeInline>
                    </>
                ),
            },
        ],
    },
    {
        id: "openclaw",
        name: "OpenClaw",
        Logo: OpenClawLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#5B6CFF]/40",
        pillBgClass: "bg-[#5B6CFF]/15",
        steps: [
            {
                title: "Send this prompt",
                body: (
                    <>
                        Copy this prompt and send it in your agent's chat to start the connection:
                        <CopyField
                            value={`Connect to ${MCP_CONNECTOR_NAME} MCP at ${MCP_SERVER_URL} — it supports OAuth flow, discover at https://notfair.co/.well-known/oauth-protected-resource/api/mcp/google_ads. Run the OAuth flow, send me the link, poll until I authorize, and confirm once it succeeds.`}
                            className="mt-3"
                            prose
                            onCopy={() => trackSetupCopied("openclaw", "prompt")}
                        />
                    </>
                ),
            },
            {
                title: "Sign in and start asking",
                body: (
                    <>
                        Your agent replies with a sign-in link. Open it, sign in with NotFair, and you're all set. Try:{" "}
                        <CodeInline>Audit my Google Ads account and rank fixes by impact.</CodeInline>
                    </>
                ),
            },
        ],
    },
    {
        id: "codex",
        name: "Codex",
        Logo: CodexLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#10A37F]/40",
        pillBgClass: "bg-[#10A37F]/15",
        steps: [
            {
                title: "Install the MCP",
                body: (
                    <>
                        Run this in your terminal:
                        <CopyField
                            value={`codex mcp add NotFair-GoogleAds --url ${MCP_SERVER_URL}`}
                            className="mt-3"
                            onCopy={() => trackSetupCopied("codex", "codex_command")}
                        />
                    </>
                ),
            },
            {
                title: "Sign in and start asking",
                body: (
                    <>
                        After running the command, Codex auto-opens a sign-in link in your browser. Sign in with NotFair and you're all set. Try:{" "}
                        <CodeInline>Audit my Google Ads account and rank fixes by impact.</CodeInline>
                    </>
                ),
            },
        ],
    },
    {
        id: "cursor",
        name: "Cursor",
        Logo: CursorLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#3D3C36]",
        pillBgClass: "bg-[#24231F]",
        steps: [
            {
                title: "Open Tools & MCP",
                body: (
                    <>
                        In Cursor, open <CodeInline>Settings → Tools & MCP</CodeInline> and click{" "}
                        <CodeInline>+ Add new global MCP server</CodeInline>.
                    </>
                ),
            },
            {
                title: "Paste the config",
                body: (
                    <>
                        Add this entry to <CodeInline>mcpServers</CodeInline>:
                        <CopyField
                            value={JSON.stringify(
                                {
                                    [MCP_CONNECTOR_NAME]: {
                                        transport: "http",
                                        url: MCP_SERVER_URL,
                                    },
                                },
                                null,
                                2,
                            )}
                            className="mt-3"
                            multiline
                            onCopy={() => trackSetupCopied("cursor", "mcp_json")}
                        />
                    </>
                ),
            },
            {
                title: "Sign in and start asking",
                body: (
                    <>
                        On first tool call, Cursor opens a sign-in link in your browser. Sign in with NotFair and you're all set. Try:{" "}
                        <CodeInline>Audit my Google Ads account and rank fixes by impact.</CodeInline>
                    </>
                ),
            },
        ],
    },
    {
        id: "hermes",
        name: "Hermes",
        Logo: HermesLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#A78BFA]/40",
        pillBgClass: "bg-[#A78BFA]/15",
        steps: [
            {
                title: "Send this prompt",
                body: (
                    <>
                        Copy this prompt and send it in your agent's chat to start the connection:
                        <CopyField
                            value={`Connect to ${MCP_CONNECTOR_NAME} MCP at ${MCP_SERVER_URL} — it supports OAuth flow, discover at https://notfair.co/.well-known/oauth-protected-resource/api/mcp/google_ads. Run the OAuth flow, send me the link, poll until I authorize, and confirm once it succeeds.`}
                            className="mt-3"
                            prose
                            onCopy={() => trackSetupCopied("hermes", "prompt")}
                        />
                    </>
                ),
            },
            {
                title: "Sign in and start asking",
                body: (
                    <>
                        Your agent replies with a sign-in link. Open it, sign in with NotFair, and you're all set. Try:{" "}
                        <CodeInline>Audit my Google Ads account and rank fixes by impact.</CodeInline>
                    </>
                ),
            },
        ],
    },
];

const CHAPTERS = [
    {
        badge: "Diagnose",
        title: "Live context. Not yesterday's report.",
        body: "Your agent reads the same numbers you'd open in the platform UI: cost, conversions, impression share, learning phase, frequency, quality score. No CSV exports, no stale dashboards.",
        chat: <DiagnoseChat />,
        reverse: false,
    },
    {
        badge: "Audit",
        title: "Audits that already know what to fix.",
        body: "One prompt fans out 20 GAQL or Graph API reads in a single pass, scores findings by spend at risk, and returns a prioritized fix list. The audit ends with a button, not a PDF.",
        chat: <AuditChat />,
        reverse: true,
    },
    {
        badge: "Operate",
        title: "Pause, shift, rename, rewrite — from chat.",
        body: "Not a read-only audit tool. Every entity an account manager touches is exposed as a write tool, with a diff-and-approve gate before anything hits the ad platform.",
        chat: <OperateChat />,
        reverse: false,
    },
    {
        badge: "Approve & undo",
        title: "Every write is reviewed. Every write is reversible.",
        body: "Reads are unrestricted. Writes show you a diff before they land, and NotFair logs every change to its own history — one call rolls anything back.",
        chat: <UndoChat />,
        reverse: true,
    },
    {
        badge: "Two platforms",
        title: "Google Ads and Meta Ads. One MCP per account.",
        body: "Symmetric servers, symmetric setup. Connect Google to operate Search and Performance Max; connect Meta to operate Facebook and Instagram. Same client, same flow.",
        chat: <PlatformChat />,
        reverse: false,
    },
];

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

function CodeInline({ children }: { children: ReactNode }) {
    return (
        <code className="rounded bg-[#1A1917] px-1.5 py-0.5 font-mono text-[12px] text-[#E8E4DD]">
            {children}
        </code>
    );
}

function CopyField({
    value,
    label,
    className = "",
    multiline = false,
    prose = false,
    onCopy,
}: {
    value: string;
    label?: string;
    className?: string;
    multiline?: boolean;
    /** Wrap on word boundaries (good for prose prompts) instead of mid-character. */
    prose?: boolean;
    /** Optional callback fired after a successful copy — used for analytics. */
    onCopy?: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);
    function copy() {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        onCopy?.();
    }

    // Long prose values get a 3-line clamp with a More/Less toggle. Short ones
    // (or non-prose code values) just render in full.
    const collapsible = prose && value.length > 120;
    const collapsed = collapsible && !expanded;

    return (
        <div
            className={`rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 ${className}`}
        >
            {label ? (
                <p className="mb-1 text-[11px] font-medium text-[#C4C0B6]/80">
                    {label}
                </p>
            ) : null}
            <div className="flex items-start justify-between gap-3">
                <code
                    className={`min-w-0 flex-1 font-mono text-[12px] leading-snug text-[#E8E4DD] ${
                        multiline
                            ? "whitespace-pre-wrap break-all"
                            : prose
                                ? "whitespace-pre-wrap break-words"
                                : "break-all"
                    } ${collapsed ? "line-clamp-3" : ""}`}
                >
                    {value}
                </code>
                <button
                    onClick={copy}
                    aria-label="Copy"
                    className="mt-0.5 shrink-0 rounded p-1 text-[#C4C0B6] transition-colors hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-[#4CAF6E]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            </div>
            {collapsible ? (
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1.5 text-[11px] font-medium text-[#4CAF6E] transition-colors hover:text-[#3D9A5C]"
                >
                    {expanded ? "Less" : "More"}
                </button>
            ) : null}
        </div>
    );
}

function ChapterBadge({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4CAF6E]">
            {children}
        </span>
    );
}

function ChapterTitle({ children }: { children: ReactNode }) {
    return (
        <h2 className="font-display mt-4 text-2xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] md:text-[32px]">
            {children}
        </h2>
    );
}

function ChapterBody({ children }: { children: ReactNode }) {
    return (
        <p className="mt-5 max-w-md text-base leading-relaxed text-[#C4C0B6] md:text-lg">
            {children}
        </p>
    );
}

/* Mock chat shell — looks like a Claude conversation */
function ChatShell({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-2xl border border-[#3D3C36] bg-gradient-to-b from-[#24231F] to-[#1F1E1A] p-5 shadow-2xl shadow-black/40 md:p-7">
            {children}
        </div>
    );
}

function UserBubble({ children }: { children: ReactNode }) {
    return (
        <div className="mb-5 flex justify-end">
            <div className="max-w-[80%] rounded-2xl bg-[#2E2D28] px-4 py-3 text-sm text-[#E8E4DD]">
                {children}
            </div>
        </div>
    );
}

function AgentHeader() {
    return (
        <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#4CAF6E] font-display text-[11px] font-bold text-[#1A1917]">
                !F
            </span>
            <span className="text-sm font-medium text-[#E8E4DD]">NotFair</span>
        </div>
    );
}

/* ─────────────── Mock chat scenes ─────────────── */

function DiagnoseChat() {
    return (
        <ChatShell>
            <UserBubble>Why did our cost-per-lead spike this week?</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                CPL up <span className="text-[#E8E4DD]">42%</span> WoW. Three campaigns drove it:
            </p>
            <ul className="mt-3 space-y-2">
                {[
                    { name: "Brand-Search", delta: "+$1,820 spend · 0 conversions" },
                    { name: "PMax-US", delta: "+$940 · CPA $38 → $89" },
                    { name: "LeadGen-Q4", delta: "search terms drifted to \"free\"" },
                ].map((c) => (
                    <li
                        key={c.name}
                        className="flex items-center justify-between rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2"
                    >
                        <code className="font-mono text-xs text-[#4CAF6E]">{c.name}</code>
                        <span className="text-xs text-[#C4C0B6]">{c.delta}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-4 text-sm text-[#C4C0B6]">
                Want me to draft 14 negatives + pause Brand-Search?
            </p>
            <div className="mt-3 flex gap-2">
                <button className="rounded-md bg-[#4CAF6E] px-3 py-1.5 text-xs font-semibold text-[#1A1917]">
                    Apply both
                </button>
                <button className="rounded-md border border-[#3D3C36] bg-[#24231F] px-3 py-1.5 text-xs font-medium text-[#E8E4DD]">
                    Show diff
                </button>
            </div>
        </ChatShell>
    );
}

function AuditChat() {
    return (
        <ChatShell>
            <UserBubble>Audit my Google Ads account and rank fixes by impact.</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                Ran 20 reads across spend, search terms, quality scores, and assets. Top issues by{" "}
                <span className="text-[#E8E4DD]">spend at risk</span>:
            </p>
            <ol className="mt-3 space-y-2">
                {[
                    { rank: "01", issue: "Loose-match keywords burning $2.4k/wk", impact: "$2,400" },
                    { rank: "02", issue: "Missing negatives on LeadGen-Q4", impact: "$1,180" },
                    { rank: "03", issue: "PMax with no asset coverage", impact: "$640" },
                    { rank: "04", issue: "3 ads disapproved (silent)", impact: "$310" },
                ].map((row) => (
                    <li
                        key={row.rank}
                        className="flex items-center gap-3 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2"
                    >
                        <span className="font-mono text-[11px] text-[#4CAF6E]">{row.rank}</span>
                        <span className="flex-1 text-xs text-[#E8E4DD]">{row.issue}</span>
                        <span className="font-mono text-xs text-[#D4882A]">{row.impact}/wk</span>
                    </li>
                ))}
            </ol>
            <p className="mt-4 text-sm text-[#C4C0B6]">
                Total recoverable: <span className="text-[#4CAF6E]">$4,530/wk</span>. Open the fix list?
            </p>
        </ChatShell>
    );
}

function OperateChat() {
    return (
        <ChatShell>
            <UserBubble>Pause everything below 1.5 ROAS in the last 14 days.</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                Found <span className="text-[#E8E4DD]">6 ad sets</span> matching. Diff before I apply:
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917]">
                <div className="grid grid-cols-12 border-b border-[#3D3C36] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#C4C0B6]">
                    <span className="col-span-6">Ad set</span>
                    <span className="col-span-3 text-right">14d spend</span>
                    <span className="col-span-3 text-right">ROAS</span>
                </div>
                {[
                    { name: "Retarget-Cart-V3", spend: "$1,240", roas: "0.8" },
                    { name: "Cold-Lookalike-IG", spend: "$890", roas: "1.1" },
                    { name: "Broad-Interest-FB", spend: "$610", roas: "1.3" },
                    { name: "Influencer-Test-A", spend: "$420", roas: "0.4" },
                ].map((row) => (
                    <div
                        key={row.name}
                        className="grid grid-cols-12 border-b border-[#3D3C36] px-3 py-2 last:border-b-0 text-xs"
                    >
                        <span className="col-span-6 truncate font-mono text-[#E8E4DD]">
                            <span className="text-[#C45D4A]">−</span> {row.name}
                        </span>
                        <span className="col-span-3 text-right text-[#C4C0B6]">{row.spend}</span>
                        <span className="col-span-3 text-right font-mono text-[#C45D4A]">{row.roas}</span>
                    </div>
                ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
                <button className="rounded-md bg-[#4CAF6E] px-3 py-1.5 text-xs font-semibold text-[#1A1917]">
                    Pause all 6
                </button>
                <button className="rounded-md border border-[#3D3C36] bg-[#24231F] px-3 py-1.5 text-xs font-medium text-[#E8E4DD]">
                    Pick which
                </button>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-[#C4C0B6]">
                    awaiting approval
                </span>
            </div>
        </ChatShell>
    );
}

function UndoChat() {
    return (
        <ChatShell>
            <UserBubble>Undo what you did at 14:32.</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                Found change <span className="font-mono text-[#E8E4DD]">chg_8f21</span> — paused{" "}
                <code className="font-mono text-[#4CAF6E]">Brand-Search</code> at 14:32 today.
            </p>
            <div className="mt-3 rounded-lg border border-[#3D3C36] bg-[#1A1917] p-3 text-xs">
                <div className="flex items-center justify-between">
                    <span className="text-[#C4C0B6]">Before</span>
                    <span className="font-mono text-[#C45D4A]">PAUSED</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                    <span className="text-[#C4C0B6]">After undo</span>
                    <span className="font-mono text-[#4CAF6E]">ENABLED</span>
                </div>
            </div>
            <p className="mt-4 text-sm text-[#C4C0B6]">Reverted. Anything else to roll back?</p>
            <div className="mt-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E]">
                    <Check className="h-3 w-3" />
                    1 change reverted
                </span>
            </div>
        </ChatShell>
    );
}

function PlatformChat() {
    return (
        <ChatShell>
            <UserBubble>How is Meta doing this week vs Google?</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                Pulled both accounts. Last 7 days:
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E]">
                        Google Ads
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold text-[#E8E4DD]">$8,420</p>
                    <p className="mt-0.5 text-[11px] text-[#C4C0B6]">
                        spend · <span className="text-[#4CAF6E]">2.3x</span> ROAS
                    </p>
                </div>
                <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E]">
                        Meta Ads
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold text-[#E8E4DD]">$5,140</p>
                    <p className="mt-0.5 text-[11px] text-[#C4C0B6]">
                        spend · <span className="text-[#D4882A]">1.4x</span> ROAS
                    </p>
                </div>
            </div>
            <p className="mt-4 text-sm text-[#C4C0B6]">
                Meta ROAS dropped from 2.1 → 1.4. Want me to investigate which ad sets cooled off?
            </p>
        </ChatShell>
    );
}

/* ─────────────────────────── Page ─────────────────────────── */

export function McpPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Seed from ?tab=<id> if present so deep links land on the right tab.
    const urlTab = searchParams?.get("tab") ?? null;
    const urlIdx = urlTab ? PLATFORMS.findIndex((p) => p.id === urlTab) : -1;
    const hasUrlTab = urlIdx >= 0;

    const [platformId, setPlatformId] = useState(
        hasUrlTab ? PLATFORMS[urlIdx].id : PLATFORMS[0].id,
    );
    const [pillIndex, setPillIndex] = useState(hasUrlTab ? urlIdx : 0);
    const [pillPaused, setPillPaused] = useState(hasUrlTab);

    // Keep state in sync if the URL changes externally (e.g. browser back/forward).
    useEffect(() => {
        if (!urlTab) return;
        const idx = PLATFORMS.findIndex((p) => p.id === urlTab);
        if (idx < 0) return;
        setPlatformId(PLATFORMS[idx].id);
        setPillIndex(idx);
        setPillPaused(true);
    }, [urlTab]);

    // Auto-cycle the hero pill until the user picks a tab
    useEffect(() => {
        if (pillPaused) return;
        const id = setInterval(() => {
            setPillIndex((i) => (i + 1) % PLATFORMS.length);
        }, 2200);
        return () => clearInterval(id);
    }, [pillPaused]);

    const heroPlatform = PLATFORMS[pillIndex];
    const active = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];

    function selectTab(id: string) {
        const previous = platformId;
        setPlatformId(id);
        const idx = PLATFORMS.findIndex((p) => p.id === id);
        if (idx >= 0) setPillIndex(idx);
        setPillPaused(true);
        trackEvent("mcp_client_tab_selected", {
            client: id,
            from_client: previous,
        });

        // Reflect the tab in the URL without reloading or scrolling.
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.set("tab", id);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }

    return (
        <div className="bg-[#1A1917] text-[#E8E4DD]">
            {/* ── Hero ── */}
            <section className="relative overflow-hidden px-4 pb-16 pt-16 md:pb-20 md:pt-20">
                {/* Dot grid background */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.18]"
                    style={{
                        backgroundImage:
                            "radial-gradient(#4CAF6E 1px, transparent 1px)",
                        backgroundSize: "22px 22px",
                        maskImage:
                            "radial-gradient(ellipse 70% 60% at 50% 35%, black 30%, transparent 80%)",
                        WebkitMaskImage:
                            "radial-gradient(ellipse 70% 60% at 50% 35%, black 30%, transparent 80%)",
                    }}
                />

                <div className="relative mx-auto max-w-5xl">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="text-center"
                    >
                        <h1 className="font-display mx-auto max-w-4xl text-3xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] sm:text-4xl md:text-[44px] lg:text-[48px]">
                            <span>Turn </span>
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.span
                                    key={heroPlatform.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.32, ease: "easeOut" }}
                                    className="whitespace-nowrap"
                                >
                                    <heroPlatform.Logo className="mr-2 inline-block h-[0.72em] w-[0.72em] -translate-y-[0.11em] align-middle" />
                                    <span className={heroPlatform.nameColor}>
                                        {heroPlatform.name}
                                    </span>
                                </motion.span>
                            </AnimatePresence>
                            <span> Into Your Marketing Engine</span>
                        </h1>

                        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
                            Connect NotFair to Claude, OpenClaw, Codex, Cursor, or Hermes and operate Google Ads + Meta Ads from a chat — diagnose, draft fixes, and approve every write.
                        </p>
                    </motion.div>

                    {/* Tab selector */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
                        className="mx-auto mt-10 flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-[#3D3C36] bg-[#24231F] p-1"
                    >
                        {PLATFORMS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => selectTab(p.id)}
                                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                                    p.id === platformId
                                        ? "bg-[#E8E4DD] text-[#1A1917]"
                                        : "text-[#C4C0B6] hover:text-[#E8E4DD]"
                                }`}
                            >
                                <p.Logo className="h-5 w-5" />
                                {p.name}
                            </button>
                        ))}
                    </motion.div>

                    {/* Step cards */}
                    <motion.div
                        key={active.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className={`mx-auto mt-8 grid gap-4 ${
                            active.steps.length === 2
                                ? "max-w-3xl md:grid-cols-2"
                                : "max-w-5xl md:grid-cols-3"
                        }`}
                    >
                        {active.steps.map((step, i) => (
                            <div
                                key={i}
                                className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6"
                            >
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4CAF6E] font-mono text-[12px] font-bold text-[#1A1917]">
                                    {i + 1}
                                </span>
                                <h3 className="font-display mt-4 text-lg font-semibold text-[#E8E4DD]">
                                    {step.title}
                                </h3>
                                <div className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                                    {step.body}
                                </div>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ── Section title ── */}
            <section className="border-t border-[#3D3C36] px-4 py-20 md:py-28">
                <div className="mx-auto max-w-5xl text-center">
                    <motion.h2
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] md:text-4xl"
                    >
                        A Complete Marketing Engine Inside Your Agent
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
                        className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#C4C0B6] md:text-lg"
                    >
                        Diagnostics, audits, writes, and undo — all driven by one MCP connection per ad account.
                    </motion.p>
                </div>
            </section>

            {/* ── Chapter spreads ── */}
            {CHAPTERS.map((ch) => (
                <section key={ch.title} className="px-4 pb-20 md:pb-28">
                    <div className="mx-auto max-w-6xl">
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-80px" }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className={`grid items-center gap-10 md:grid-cols-12 md:gap-16 ${
                                ch.reverse ? "md:[&>*:first-child]:order-2" : ""
                            }`}
                        >
                            <div className="md:col-span-7">{ch.chat}</div>
                            <div className="md:col-span-5">
                                <ChapterBadge>{ch.badge}</ChapterBadge>
                                <ChapterTitle>{ch.title}</ChapterTitle>
                                <ChapterBody>{ch.body}</ChapterBody>
                            </div>
                        </motion.div>
                    </div>
                </section>
            ))}

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
