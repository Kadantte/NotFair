import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SessionProvider } from "@/components/session-provider"
import { getSession } from "@/lib/session"

export default async function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await getSession()

    return (
        <div className="flex min-h-screen flex-col bg-black text-white selection:bg-indigo-500/30 font-sans">
            <SiteHeader connected={session.connected} />
            <SessionProvider session={session}>
                <main className="flex-1 flex flex-col">
                    {children}
                </main>
            </SessionProvider>
            <SiteFooter />
        </div>
    )
}
