import Link from "next/link"
import Image from "next/image"

export function SiteHeader({ connected = false }: { connected?: boolean }) {
    void connected
    return (
        <header className="sticky top-0 z-50 w-full border-b border-[#3D3C36] bg-[#1A1917]/90 backdrop-blur-sm">
            <div className="container flex h-14 items-center justify-between mx-auto px-4 md:px-6">
                <Link href="/" className="flex items-center space-x-2">
                    <Image src="/logo.svg" alt="AdsAgent Logo" width={28} height={28} className="w-7 h-7" />
                    <span className="hidden font-bold sm:inline-block text-base text-[#E8E4DD]">AdsAgent</span>
                </Link>
                <a
                    href="https://cal.com/tong-chen-uuovdl/30min"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center rounded-full border border-[#4CAF6E]/40 bg-[#4CAF6E]/10 px-4 text-sm font-medium text-[#4CAF6E] transition-colors hover:bg-[#4CAF6E]/20 hover:border-[#4CAF6E]/60"
                >
                    Book a Demo
                </a>
            </div>
        </header>
    )
}
