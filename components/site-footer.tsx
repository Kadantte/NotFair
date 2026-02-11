import Link from "next/link"

export function SiteFooter() {
    return (
        <footer className="border-t border-zinc-800 bg-black py-6 md:py-0">
            <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row md:px-8">
                <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
                    <p className="text-center text-sm leading-loose text-zinc-400 md:text-left">
                        Built by AdsAgent. The source code is available on{" "}
                        <a
                            href="#"
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline underline-offset-4"
                        >
                            GitHub
                        </a>
                        .
                    </p>
                </div>
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
