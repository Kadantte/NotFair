"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
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

type UseCase = {
    label: string;
    body: string;
};

type RelatedLinkCopy = {
    title: string;
    description: string;
};

const RELATED_LINKS = [
    { href: "/google-ads-mcp", key: "googleAdsMcp", connectorName: MCP_CONNECTOR_NAME },
    { href: "/meta-ads-mcp", key: "metaAdsMcp", connectorName: META_MCP_CONNECTOR_NAME },
    { href: "/google-ads-claude-connector-setup-guide", key: "claudeConnector" },
    { href: "/google-ads-claude-code-plugin-setup-guide", key: "claudeCode" },
    { href: "/google-ads-codex-mcp-setup-guide", key: "codex" },
    { href: "/pricing", key: "pricing" },
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
    const t = useTranslations("McpPage");
    const useCases = t.raw("useCases") as UseCase[];
    const faqItems = (t.raw("faq.items") as FaqItem[]).map((item) => ({
        question: item.question,
        answer: item.answer
            .replace("{googleServerUrl}", MCP_SERVER_URL)
            .replace("{metaServerUrl}", META_MCP_SERVER_URL),
    }));
    const relatedLinks = RELATED_LINKS.map(({ href, key, connectorName }) => {
        const copy = t.raw(`related.links.${key}`) as RelatedLinkCopy;

        return {
            href,
            title: copy.title,
            description: connectorName
                ? copy.description.replace("{connectorName}", connectorName)
                : copy.description,
        };
    });

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
                        {t("useCasesTitle.line1")}<br className="hidden md:block" /> {t("useCasesTitle.line2")}
                    </motion.h2>

                    <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {useCases.map((uc) => (
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
                            {t("cta.title.line1")}<br /> {t("cta.title.line2")}
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
                                {t("cta.google")}
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
                                {t("cta.meta")}
                            </Link>
                        </div>
                        <p className="mt-6 text-sm text-[#C4C0B6]">
                            {t("cta.note")}
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* ── FAQ ── */}
            <FaqSection
                title={t("faq.title")}
                intro={t("faq.intro")}
                items={faqItems}
            />

            {/* ── Related ── */}
            <LandingLinksSection
                title={t("related.title")}
                intro={t("related.intro")}
                links={relatedLinks}
            />
        </div>
    );
}
