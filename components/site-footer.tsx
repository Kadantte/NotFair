import Link from "next/link";
import { allLandingPages } from "@/lib/marketing-pages";

export function SiteFooter() {
    const articleLinks = allLandingPages.map((page) => ({
        href: `/${page.slug}`,
        label: page.title,
    }));

    return (
        <footer className="border-t border-[#3D3C36] bg-[#1A1917]">
            <div className="container mx-auto px-4 py-10 md:px-8">
                <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
                    <div className="max-w-sm space-y-3">
                        <h2 className="text-base font-semibold text-[#E8E4DD]">
                            AdsAgent
                        </h2>
                        <p className="text-sm leading-relaxed text-[#9B9689]">
                            Connect Google Ads to AI workflows through MCP, keep
                            optimization reviewable, and track what changed.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
                            Articles
                        </h3>
                        <div className="mt-4 grid gap-3">
                            {articleLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="text-sm text-[#9B9689] transition-colors hover:text-[#E8E4DD]"
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
                        <div className="mt-4 grid gap-3">
                            <Link
                                href="/impact"
                                className="text-sm text-[#9B9689] transition-colors hover:text-[#E8E4DD]"
                            >
                                Impact Tracker
                            </Link>
                            <Link
                                href="/privacy"
                                className="text-sm text-[#9B9689] transition-colors hover:text-[#E8E4DD]"
                            >
                                Privacy Policy
                            </Link>
                            <Link
                                href="/terms"
                                className="text-sm text-[#9B9689] transition-colors hover:text-[#E8E4DD]"
                            >
                                Terms of Service
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mt-8 border-t border-[#3D3C36] pt-6">
                    <p className="text-sm text-[#9B9689]">
                        © {new Date().getFullYear()} AdsAgent. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
