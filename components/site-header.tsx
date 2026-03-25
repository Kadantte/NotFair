"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import Image from "next/image"

export function SiteHeader() {
    const pathname = usePathname()

    return (
        <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="container flex h-16 items-center mx-auto px-4 md:px-6">
                <Link href="/" className="mr-6 flex items-center space-x-2">
                    <Image src="/logo.svg" alt="AdsAgent Logo" width={32} height={32} className="w-8 h-8" />
                    <span className="hidden font-bold sm:inline-block text-xl text-white">AdsAgent</span>
                </Link>
                <div className="flex items-center">
                    <nav className="flex items-center space-x-6 text-sm font-medium">
                        <Link
                            href="/#features"
                            className="text-zinc-300 hover:text-white transition-colors"
                        >
                            Features
                        </Link>
                        <Link
                            href="/#pricing"
                            className="text-zinc-300 hover:text-white transition-colors"
                        >
                            Pricing
                        </Link>
                        <Link
                            href="/privacy"
                            className="text-zinc-300 hover:text-white transition-colors"
                        >
                            Privacy
                        </Link>
                        <Link
                            href="/tools"
                            className="text-zinc-300 hover:text-white transition-colors"
                        >
                            Tools
                        </Link>
                    </nav>
                </div>
                <div className="ml-auto flex items-center space-x-4">
                    {/* Placeholder for future auth buttons if needed */}
                </div>
            </div>
        </header>
    )
}
