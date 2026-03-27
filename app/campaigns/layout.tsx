import { SiteHeader } from "@/components/site-header"

export default function CampaignsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen flex-col bg-black text-white selection:bg-indigo-500/30 font-sans">
            <SiteHeader connected />
            <div className="flex-1 min-h-0">
                {children}
            </div>
        </div>
    )
}
