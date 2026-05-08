import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ConnectDesignMcpPage } from "@/components/connect-design-mcp-page";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

/**
 * Design MCP setup page. The hosted Design MCP at /api/mcp/design uses the
 * same OAuth/Bearer setup tabs as Google Ads / Meta Ads. Any signed-in
 * NotFair user can connect — no Google Ads account required.
 *
 * Tabs are URL-routed (e.g. /connect/design/codex) so each client's setup
 * is bookmarkable.
 */
export default async function ConnectDesignMcpPagePath({ params }: Props) {
  const session = await getSession();
  if (!session.connected) {
    redirect("/login?next=%2Fconnect%2Fdesign");
  }
  const { slug } = await params;
  return <ConnectDesignMcpPage slug={slug} />;
}
