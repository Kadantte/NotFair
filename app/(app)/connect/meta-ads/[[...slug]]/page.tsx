import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ConnectMetaAdsMcpPage } from "@/components/connect-meta-ads-mcp-page";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

/**
 * Meta Ads MCP setup page. Mirror of /connect for the Meta resource —
 * same setup tabs, different server URL and connector name.
 */
export default async function ConnectMetaAdsMcpPagePath({ params }: Props) {
  const session = await getSession();
  const { slug } = await params;

  if (!session.connected) {
    redirect("/connect?next=%2Fconnect%2Fmeta-ads");
  }

  return (
    <ConnectMetaAdsMcpPage
      slug={slug}
      apiKey={session.token}
    />
  );
}
