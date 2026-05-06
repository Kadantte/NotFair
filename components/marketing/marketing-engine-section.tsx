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
import { useTranslations } from "next-intl";

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
    const t = useTranslations("MarketingEngine.chat");

    return (
        <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#4CAF6E] font-display text-[11px] font-bold text-[#1A1917]">
                !F
            </span>
            <span className="text-sm font-medium text-[#E8E4DD]">{t("agentName")}</span>
        </div>
    );
}

/* ─────────────── Mock chat scenes ─────────────── */

function DiagnoseChat() {
    const t = useTranslations("MarketingEngine.chat.diagnose");
    const rows = t.raw("rows") as { name: string; delta: string }[];

    return (
        <ChatShell>
            <UserBubble>{t("user")}</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                {t.rich("summary", {
                    value: (chunks) => <span className="text-[#E8E4DD]">{chunks}</span>,
                })}
            </p>
            <ul className="mt-3 space-y-2">
                {rows.map((c) => (
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
                {t("prompt")}
            </p>
            <div className="mt-3 flex gap-2">
                <button className="rounded-md bg-[#4CAF6E] px-3 py-1.5 text-xs font-semibold text-[#1A1917]">
                    {t("apply")}
                </button>
                <button className="rounded-md border border-[#3D3C36] bg-[#24231F] px-3 py-1.5 text-xs font-medium text-[#E8E4DD]">
                    {t("showDiff")}
                </button>
            </div>
        </ChatShell>
    );
}

function AuditChat() {
    const t = useTranslations("MarketingEngine.chat.audit");
    const rows = t.raw("rows") as { rank: string; issue: string; impact: string }[];

    return (
        <ChatShell>
            <UserBubble>{t("user")}</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                {t.rich("summary", {
                    value: (chunks) => <span className="text-[#E8E4DD]">{chunks}</span>,
                })}
            </p>
            <ol className="mt-3 space-y-2">
                {rows.map((row) => (
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
                {t.rich("total", {
                    value: (chunks) => <span className="text-[#4CAF6E]">{chunks}</span>,
                })}
            </p>
        </ChatShell>
    );
}

function OperateChat() {
    const t = useTranslations("MarketingEngine.chat.operate");
    const rows = t.raw("rows") as { name: string; spend: string; roas: string }[];

    return (
        <ChatShell>
            <UserBubble>{t("user")}</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                {t.rich("summary", {
                    value: (chunks) => <span className="text-[#E8E4DD]">{chunks}</span>,
                })}
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917]">
                <div className="grid grid-cols-12 border-b border-[#3D3C36] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#C4C0B6]">
                    <span className="col-span-6">{t("headers.adSet")}</span>
                    <span className="col-span-3 text-right">{t("headers.spend")}</span>
                    <span className="col-span-3 text-right">{t("headers.roas")}</span>
                </div>
                {rows.map((row) => (
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
                    {t("pauseAll")}
                </button>
                <button className="rounded-md border border-[#3D3C36] bg-[#24231F] px-3 py-1.5 text-xs font-medium text-[#E8E4DD]">
                    {t("pickWhich")}
                </button>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-[#C4C0B6]">
                    {t("awaitingApproval")}
                </span>
            </div>
        </ChatShell>
    );
}

function UndoChat() {
    const t = useTranslations("MarketingEngine.chat.undo");

    return (
        <ChatShell>
            <UserBubble>{t("user")}</UserBubble>
            <AgentHeader />
            <p className="text-sm leading-relaxed text-[#C4C0B6]">
                {t.rich("summary", {
                    change: (chunks) => <span className="font-mono text-[#E8E4DD]">{chunks}</span>,
                    campaign: (chunks) => <code className="font-mono text-[#4CAF6E]">{chunks}</code>,
                })}
            </p>
            <div className="mt-3 rounded-lg border border-[#3D3C36] bg-[#1A1917] p-3 text-xs">
                <div className="flex items-center justify-between">
                    <span className="text-[#C4C0B6]">{t("before")}</span>
                    <span className="font-mono text-[#C45D4A]">PAUSED</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                    <span className="text-[#C4C0B6]">{t("after")}</span>
                    <span className="font-mono text-[#4CAF6E]">ENABLED</span>
                </div>
            </div>
            <p className="mt-4 text-sm text-[#C4C0B6]">{t("reverted")}</p>
            <div className="mt-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E]">
                    <Check className="h-3 w-3" />
                    {t("badge")}
                </span>
            </div>
        </ChatShell>
    );
}

/* ─────────────────────────── Section ─────────────────────────── */

export type MarketingEngineSectionProps = {
    title?: string;
    body?: string;
};

export function MarketingEngineSection({
    title,
    body,
}: MarketingEngineSectionProps = {}) {
    const t = useTranslations("MarketingEngine");
    const sectionTitle = title ?? t("heading.title");
    const sectionBody = body ?? t("heading.body");
    const chapters = t.raw("chapters") as {
        badge: string;
        title: string;
        body: string;
        reverse: boolean;
    }[];
    const chats = [<DiagnoseChat key="diagnose" />, <AuditChat key="audit" />, <OperateChat key="operate" />, <UndoChat key="undo" />];

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
                        {sectionTitle}
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
                        className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#C4C0B6] md:text-lg"
                    >
                        {sectionBody}
                    </motion.p>
                </div>
            </section>

            {/* Chapter spreads */}
            {chapters.map((ch, index) => (
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
                            <div className="md:col-span-7">{chats[index]}</div>
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
