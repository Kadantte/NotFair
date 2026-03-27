import Link from "next/link"

export function SiteFooter() {
    return (
        <footer className="border-t border-zinc-800 bg-[#1A1917] py-6 md:py-0">
            <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row md:px-8">
                <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
                    <Link href="/privacy" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                        Privacy Policy
                    </Link>
                    <Link href="/terms" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                        Terms of Service
                    </Link>
                    <p className="text-sm text-zinc-600">
                        © {new Date().getFullYear()} AdsAgent. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    )
}
