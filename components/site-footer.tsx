import Link from "next/link";
import { DiscordLink } from "@/components/discord-link";
import { BrandLockup } from "@/components/brand-lockup";
import { BRAND_NAME } from "@/lib/brand";

const setupGuideLinks = [
    {
        href: "/google-ads-claude-connector-setup-guide",
        label: "Google Ads Claude Connector Setup Guide",
    },
    {
        href: "/google-ads-claude-code-plugin-setup-guide",
        label: "Google Ads Claude Code Plugin Setup Guide",
    },
    {
        href: "/google-ads-codex-mcp-setup-guide",
        label: "Google Ads Codex MCP Setup Guide",
    },
    {
        href: "/google-ads-mcp",
        label: "Google Ads MCP Server (any client)",
    },
];

export function SiteFooter() {
    const articleLinks = setupGuideLinks;

    return (
        <footer className="border-t border-[#3D3C36] bg-[#1A1917]">
            <div className="container mx-auto px-4 py-10 md:px-8">
                <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
                    <div className="max-w-sm space-y-3">
                        <BrandLockup size="md" />
                        <p className="text-sm leading-relaxed text-[#C4C0B6]">
                            AI-powered Google Ads management that finds wasted
                            spend and optimizes your campaigns automatically.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
                            Articles
                        </h3>
                        <div className="mt-4 grid gap-1">
                            {articleLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="py-1.5 text-sm text-[#C4C0B6] transition-colors hover:text-[#E8E4DD]"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
                            Company
                        </h3>
                        <div className="mt-4 grid gap-1">
                            <Link
                                href="/privacy"
                                className="py-1.5 text-sm text-[#C4C0B6] transition-colors hover:text-[#E8E4DD]"
                            >
                                Privacy Policy
                            </Link>
                            <Link
                                href="/terms"
                                className="py-1.5 text-sm text-[#C4C0B6] transition-colors hover:text-[#E8E4DD]"
                            >
                                Terms of Service
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
                        © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
