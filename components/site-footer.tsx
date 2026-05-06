import Link from "next/link";
import { DiscordLink } from "@/components/discord-link";
import { BrandLockup } from "@/components/brand-lockup";
import { BRAND_NAME } from "@/lib/brand";
import { useTranslations } from "next-intl";

const setupGuideLinks = [
    {
        href: "/google-ads-claude-connector-setup-guide",
        key: "googleAdsClaudeConnector",
    },
    {
        href: "/google-ads-claude-code-plugin-setup-guide",
        key: "googleAdsClaudeCode",
    },
    {
        href: "/google-ads-codex-mcp-setup-guide",
        key: "googleAdsCodex",
    },
    {
        href: "/google-ads-mcp",
        key: "googleAdsMcp",
    },
    {
        href: "/meta-ads-claude-connector-setup-guide",
        key: "metaAdsClaudeConnector",
    },
    {
        href: "/meta-ads-claude-code-plugin-setup-guide",
        key: "metaAdsClaudeCode",
    },
    {
        href: "/meta-ads-codex-mcp-setup-guide",
        key: "metaAdsCodex",
    },
    {
        href: "/meta-ads-mcp",
        key: "metaAdsMcp",
    },
] as const;

export function SiteFooter() {
    const t = useTranslations("Footer");
    const articleLinks = setupGuideLinks;

    return (
        <footer className="border-t border-[#3D3C36] bg-[#1A1917]">
            <div className="container mx-auto px-4 py-10 md:px-8">
                <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
                    <div className="max-w-sm space-y-3">
                        <BrandLockup size="md" />
                        <p className="text-sm leading-relaxed text-[#C4C0B6]">
                            {t("description")}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
                            {t("articles")}
                        </h3>
                        <div className="mt-4 grid gap-1">
                            {articleLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="py-1.5 text-sm text-[#C4C0B6] transition-colors hover:text-[#E8E4DD]"
                                >
                                    {t(`setupGuideLinks.${link.key}`)}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
                            {t("company")}
                        </h3>
                        <div className="mt-4 grid gap-1">
                            <Link
                                href="/privacy"
                                className="py-1.5 text-sm text-[#C4C0B6] transition-colors hover:text-[#E8E4DD]"
                            >
                                {t("privacy")}
                            </Link>
                            <Link
                                href="/terms"
                                className="py-1.5 text-sm text-[#C4C0B6] transition-colors hover:text-[#E8E4DD]"
                            >
                                {t("terms")}
                            </Link>
                            <DiscordLink
                                location="footer"
                                className="inline-flex items-center gap-1.5 py-1.5 text-sm text-[#8B9FF5] transition-colors hover:text-[#B0BFF9]"
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-8 border-t border-[#3D3C36] pt-6">
                    <p className="text-sm text-[#C4C0B6]">
                        © {new Date().getFullYear()} {BRAND_NAME}. {t("rights")}
                    </p>
                </div>
            </div>
        </footer>
    );
}
