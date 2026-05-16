import { MarketingShell } from "@/components/marketing/marketing-shell"
import { TikTokViewContent } from "@/components/tiktok-view-content"

export default async function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <MarketingShell>
            <TikTokViewContent />
            {children}
        </MarketingShell>
    )
}
