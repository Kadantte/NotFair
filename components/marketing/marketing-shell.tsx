import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SessionProvider } from "@/components/session-provider";
import { getSession } from "@/lib/session";

export async function MarketingShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col bg-[#1A1917] text-[#E8E4DD] selection:bg-[#4CAF6E]/30 font-sans">
      <SiteHeader connected={session.connected} />
      <SessionProvider session={session}>
        <main className="flex-1 flex flex-col">{children}</main>
      </SessionProvider>
      <SiteFooter />
    </div>
  );
}
