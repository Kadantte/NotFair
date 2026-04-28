import Link from "next/link";
import { Star } from "lucide-react";
import { AuditCTA } from "@/components/marketing/audit-cta";
import { SetupGuidesMenu } from "@/components/setup-guides-menu";
import { BrandLockup } from "@/components/brand-lockup";

function formatStars(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(count);
}

export function GitHubStarBadge({ stars }: { stars: number | null }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3D3C36] bg-[#24231F] px-3 py-1.5 text-sm text-[#C4C0B6] transition-colors group-hover:border-[#4D4C46] group-hover:text-[#E8E4DD] hover:border-[#4D4C46] hover:text-[#E8E4DD]">
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            {stars != null && (
                <>
                    <Star className="h-3 w-3 fill-[#E8B931] text-[#E8B931]" />
                    <span className="text-xs font-medium text-[#E8E4DD]">{formatStars(stars)}</span>
                </>
            )}
        </span>
    );
}

function NavLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
    return (
        <Link
            href={href}
            className={`text-[14px] font-medium text-[#C4C0B6] transition-colors hover:text-[#E8E4DD] ${className}`}
        >
            {label}
        </Link>
    );
}

export function SiteHeader({ connected = false }: { connected?: boolean } = {}) {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-[#3D3C36] bg-[#1A1917]/90 backdrop-blur-sm">
            <div className="container mx-auto flex h-14 items-center justify-between gap-6 px-4 md:px-6">
                {/* Left: brand + nav */}
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center">
                        <BrandLockup size="md" />
                    </Link>
                </div>

                {/* Right: secondary + primary CTA */}
                <div className="flex items-center gap-5">
                    <NavLink href="/pricing" label="Pricing" className="hidden sm:inline" />
                    <NavLink href="/google-ads-claude-connector-setup-guide" label="Google Ads Claude Connector Setup Guide" className="hidden lg:inline" />
                    <SetupGuidesMenu className="hidden md:flex" />
                    <a
                        href="https://cal.com/tong-chen-uuovdl/30min"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden h-9 items-center rounded-full border border-[#4CAF6E]/40 bg-[#4CAF6E]/10 px-4 text-sm font-medium text-[#4CAF6E] transition-colors hover:border-[#4CAF6E]/60 hover:bg-[#4CAF6E]/20 sm:inline-flex"
                    >
                        Book a Demo
                    </a>
                    <AuditCTA
                        session={{ connected }}
                        page="header"
                        size="sm"
                        connectedLabel="Start now"
                        disconnectedLabel="Start now"
                    />
                </div>
            </div>
        </header>
    );
}
