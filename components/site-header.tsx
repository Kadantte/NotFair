import Link from "next/link";
import Image from "next/image";
import { AuditCTA } from "@/components/marketing/audit-cta";

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
                    <Link href="/" className="flex items-center gap-2.5">
                        <Image src="/logo.svg" alt="AdsAgent" width={26} height={26} className="h-[26px] w-[26px]" />
                        <span className="font-display text-[15px] font-semibold tracking-tight text-[#E8E4DD]">
                            AdsAgent
                        </span>
                    </Link>
                </div>

                {/* Right: secondary + primary CTA */}
                <div className="flex items-center gap-5">
                    <NavLink href="/google-ads-audit" label="Free Google Ads Audit" className="hidden sm:inline" />
                    <NavLink href="/google-ads-claude-connector" label="Google Ads Claude Connector Setup Guide" className="hidden lg:inline" />
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
