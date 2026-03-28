import Link from "next/link"
import Image from "next/image"

export function SiteHeader({ connected = false }: { connected?: boolean }) {
    void connected
    return (
        <header className="sticky top-0 z-50 w-full border-b border-[#3D3C36] bg-[#1A1917]/90 backdrop-blur-sm">
            <div className="container flex h-14 items-center mx-auto px-4 md:px-6">
                <Link href="/" className="mr-6 flex items-center space-x-2">
                    <Image src="/logo.svg" alt="AdsAgent Logo" width={28} height={28} className="w-7 h-7" />
                    <span className="hidden font-bold sm:inline-block text-base text-[#E8E4DD]">AdsAgent</span>
                </Link>
            </div>
        </header>
    )
}
