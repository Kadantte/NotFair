import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ConnectMetaAdsMcpPage } from "@/components/connect-meta-ads-mcp-page";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

/**
 * Meta Ads MCP setup page. Mirror of /connect/google-ads for the Meta
 * resource — same setup tabs, different server URL and connector name.
 *
 * Open to any signed-in user with at least one connected platform: a
 * Google-only user can browse the Meta MCP setup steps and gets a
 * "no Meta Ads linked" warning at the top of the page so they know
 * connecting MCP alone won't be useful until they link Meta.
 */
export default async function ConnectMetaAdsMcpPagePath({ params }: Props) {
  const session = await getSession();
  const { slug } = await params;

  if (!session.connected) {
    redirect("/login?next=%2Fconnect%2Fmeta-ads");
  }
  // Bare /connect/meta-ads with 0 platforms → onboarding. Sub-paths
  // (claude-connector etc.) stay open since they're tab navigation.
  if (!slug || slug.length === 0) {
    const hasGoogle = !session.pendingSetup && !!session.customerId;
    const hasMeta = session.metaAccounts.length > 0;
    if (!hasGoogle && !hasMeta) {
      redirect("/manage-ads-accounts");
    }
  }

  return (
    <ConnectMetaAdsMcpPage
      slug={slug}
      hasMeta={session.metaAccounts.length > 0}
    />
  );
}
