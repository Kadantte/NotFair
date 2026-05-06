import { MarketingShell } from "@/components/marketing/marketing-shell"

export default async function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <MarketingShell>{children}</MarketingShell>
}
