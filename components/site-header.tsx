import Link from "next/link"
import Image from "next/image"
import { Star } from "lucide-react"

function formatStars(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
    return String(count)
}

export function GitHubStarBadge({ stars }: { stars: number | null }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3D3C36] bg-[#24231F] px-3 py-1.5 text-sm text-[#9B9689] transition-colors group-hover:border-[#4D4C46] group-hover:text-[#E8E4DD] hover:border-[#4D4C46] hover:text-[#E8E4DD]">
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
    )
}

export function SiteHeader({ connected = false }: { connected?: boolean }) {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-[#3D3C36] bg-[#1A1917]/90 backdrop-blur-sm">
            <div className="container flex h-14 items-center justify-between mx-auto px-4 md:px-6">
                <Link href="/" className="flex items-center space-x-2">
                    <Image src="/logo.svg" alt="AdsAgent Logo" width={28} height={28} className="w-7 h-7" />
                    <span className="hidden font-bold sm:inline-block text-base text-[#E8E4DD]">AdsAgent</span>
                </Link>
                <div className="flex items-center gap-3">
                    <Link
                        href="/pricing"
                        className="hidden sm:inline-flex h-9 items-center px-3 text-sm font-medium text-[#9B9689] transition-colors hover:text-[#E8E4DD]"
                    >
                        Pricing
                    </Link>
                    <Link
                        href="/google-ads-audit"
                        className="inline-flex h-9 items-center rounded-full bg-[#4CAF6E] px-4 text-sm font-semibold text-[#1A1917] transition-colors hover:bg-[#3D9A5C]"
                    >
                        Free Google Ads Audit
                    </Link>
                    <a
                        href="https://cal.com/tong-chen-uuovdl/30min"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden sm:inline-flex h-9 items-center rounded-full border border-[#4CAF6E]/40 bg-[#4CAF6E]/10 px-4 text-sm font-medium text-[#4CAF6E] transition-colors hover:bg-[#4CAF6E]/20 hover:border-[#4CAF6E]/60"
                    >
                        Book a Demo
                    </a>
                </div>
            </div>
        </header>
    )
}
