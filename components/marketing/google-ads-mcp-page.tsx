"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { fadeInUp } from "@/components/marketing/audit-cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import { AnyMcpClientSetup } from "@/components/any-mcp-client-setup";
import { MCP_SERVER_URL } from "@/lib/brand";
import type { FaqItem } from "@/lib/seo";

const SERVER_URL = MCP_SERVER_URL;

const VISIBLE_TOOLS = 6;

type McpTool = {
    name: string;
    category: "read" | "write";
    description: string;
};

const RELATED_LINKS = [
    { href: "/google-ads-claude-connector-setup-guide", key: "claudeConnector" },
    { href: "/google-ads-claude-code-plugin-setup-guide", key: "claudeCode" },
    { href: "/google-ads-codex-mcp-setup-guide", key: "codex" },
];

export function GoogleAdsMcpPage() {
    const t = useTranslations("GoogleAdsMcpPage");
    const tools = t.raw("tools.items") as McpTool[];
    const faqItems = (t.raw("faq.items") as FaqItem[]).map((item) => ({
        question: item.question,
        answer: item.answer.replace("{serverUrl}", SERVER_URL),
    }));
    const relatedLinks = RELATED_LINKS.map(({ href, key }) => ({
        href,
        title: t(`related.links.${key}.title`),
        description: t(`related.links.${key}.description`),
    }));

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
                            {t("hero.eyebrow")}
                        </p>
                        <h1 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-[#E8E4DD] md:text-5xl lg:text-[56px]">
                            {t("hero.title")}
                        </h1>
                        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
                            {t("hero.bodyBeforeLink")}{" "}
                            <a
                                href="https://modelcontextprotocol.io/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#E8E4DD] underline decoration-[#4CAF6E]/40 underline-offset-2 transition-colors hover:decoration-[#4CAF6E]"
                            >
                                Model Context Protocol
                            </a>{" "}
                            {t("hero.bodyBeforeCode")}{" "}
                            <code className="rounded bg-[#24231F] px-1.5 py-0.5 font-mono text-sm text-[#E8E4DD]">
                                {SERVER_URL}
                            </code>
                            {t("hero.bodyAfterCode")}
                        </p>
                        <p className="mt-6 text-sm text-[#C4C0B6]">
                            {t("hero.note")}
                        </p>
                        <p className="mt-3 text-xs text-[#C4C0B6]/70">
                            {t("hero.specPrefix")}{" "}
                            <a
                                href="https://modelcontextprotocol.io/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                            >
                                modelcontextprotocol.io
                                <ExternalLink className="h-3 w-3" />
                            </a>
                            {t("hero.specSuffix")}
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
                            {t("config.eyebrow")}
                        </p>
                        <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
                            {t("config.title")}
                        </h2>
                        <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                            {t("config.body")}
                        </p>
                    </motion.div>

                    <AnyMcpClientSetup
                        apiKey={null}
                        onSignIn={() => startGoogleConnect("/connect/any-mcp")}
                        surface="marketing"
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
                            {t("tools.eyebrow")}
                        </p>
                        <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
                            {t("tools.title")}
                        </h2>
                        <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                            {t("tools.body")}
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
                                    <th className="px-5 py-3 text-left font-medium text-[#C4C0B6]">{t("tools.columns.tool")}</th>
                                    <th className="px-5 py-3 text-left font-medium text-[#C4C0B6]">{t("tools.columns.type")}</th>
                                    <th className="hidden px-5 py-3 text-left font-medium text-[#C4C0B6] sm:table-cell">
                                        {t("tools.columns.description")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {tools.slice(0, VISIBLE_TOOLS).map((tool, i) => (
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
                                                    tool.category === "read"
                                                        ? "border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 text-[#4CAF6E]"
                                                        : "border border-[#D4882A]/30 bg-[#D4882A]/10 text-[#D4882A]"
                                                }`}
                                            >
                                                {t(`tools.categories.${tool.category}`)}
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
                                        {t("tools.more")}
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
                            {t("cta.title")}
                        </h2>
                        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#C4C0B6]">
                            {t("cta.body")}
                        </p>
                        <div className="mt-6 flex flex-col items-center gap-3">
                            <Button
                                onClick={() => {
                                    trackEvent("cta_clicked", {
                                        page: "google-ads-mcp",
                                        cta: "open_connect_page",
                                        destination: "/connect/any-mcp",
                                    });
                                    startGoogleConnect("/connect/any-mcp");
                                }}
                                className="h-12 rounded-lg bg-[#4CAF6E] px-6 text-base font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
                            >
                                {t("cta.button")}
                            </Button>
                            <Link
                                href="/google-ads-claude-connector-setup-guide"
                                className="flex items-center gap-1 text-sm text-[#C4C0B6] underline underline-offset-2 hover:text-[#E8E4DD]"
                            >
                                {t("cta.secondary")}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── FAQ ── */}
            <FaqSection
                title={t("faq.title")}
                intro={t("faq.intro")}
                items={faqItems}
            />

            {/* ── Related Pages ── */}
            <LandingLinksSection
                title={t("related.title")}
                intro={t("related.intro")}
                links={relatedLinks}
            />
        </div>
    );
}
