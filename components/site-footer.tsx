import Link from "next/link"

export function SiteFooter() {
    return (
        <footer className="border-t border-[#3D3C36] bg-[#1A1917] py-6 md:py-0">
            <div className="container flex flex-col items-center justify-between gap-4 md:h-20 md:flex-row md:px-8">
                <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
                    <Link href="/privacy" className="text-sm font-medium text-[#9B9689] hover:text-[#E8E4DD] transition-colors">
                        Privacy Policy
                    </Link>
                    <Link href="/terms" className="text-sm font-medium text-[#9B9689] hover:text-[#E8E4DD] transition-colors">
                        Terms of Service
                    </Link>
                    <p className="text-sm text-[#9B9689]">
                        © {new Date().getFullYear()} AdsAgent. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    )
}
