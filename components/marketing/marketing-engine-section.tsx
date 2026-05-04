"use client";

/**
 * "A Complete Marketing Engine Inside Your Agent" — the editorial section
 * with the centered headline + supporting copy AND the five chapter
 * spreads (Diagnose / Audit / Operate / Approve & undo / Two platforms),
 * each with its own mock chat panel.
 *
 * Used on /mcp and on the homepage.
 */

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

/* ─────────────────────────── Atoms ─────────────────────────── */

function ChapterBadge({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4CAF6E]">
            {children}
        </span>
    );
}

function ChapterTitle({ children }: { children: ReactNode }) {
    return (
        <h3 className="font-display mt-4 text-2xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] md:text-[32px]">
            {children}
        </h3>
    );
}

function ChapterBody({ children }: { children: ReactNode }) {
    return (
        <p className="mt-5 max-w-md text-base leading-relaxed text-[#C4C0B6] md:text-lg">
            {children}
        </p>
    );
}

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
];

/* ─────────────────────────── Section ─────────────────────────── */

export type MarketingEngineSectionProps = {
    title?: string;
    body?: string;
};

const DEFAULT_TITLE = "A Complete Marketing Engine Inside Your Agent";
const DEFAULT_BODY =
    "Diagnostics, audits, writes, and undo — all driven by one MCP connection per ad account.";

export function MarketingEngineSection({
    title = DEFAULT_TITLE,
    body = DEFAULT_BODY,
}: MarketingEngineSectionProps = {}) {
    return (
        <>
            {/* Headline */}
            <section className="border-t border-[#3D3C36] px-4 py-20 md:py-28">
                <div className="container mx-auto max-w-6xl text-center">
                    <motion.h2
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] md:text-4xl"
                    >
                        {title}
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
                        className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#C4C0B6] md:text-lg"
                    >
                        {body}
                    </motion.p>
                </div>
            </section>

            {/* Chapter spreads */}
            {CHAPTERS.map((ch) => (
                <section key={ch.title} className="px-4 pb-20 md:pb-28">
                    <div className="container mx-auto max-w-6xl">
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
        </>
    );
}
