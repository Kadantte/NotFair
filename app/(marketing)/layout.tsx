
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen flex-col bg-black text-white selection:bg-indigo-500/30 font-sans">
            <SiteHeader />
            <main className="flex-1 flex flex-col">
                {children}
            </main>
            <SiteFooter />
        </div>
    )
}
