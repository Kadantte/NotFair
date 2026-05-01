import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DEV_EMAILS } from "@/lib/dev-emails";
import { ConnectMetaAdsMcpPage } from "@/components/connect-meta-ads-mcp-page";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

/**
 * Dev-gated mirror of /connect that surfaces the Meta Ads MCP URL
 * (`/api/mcp/meta_ads`) instead of the Google one. Same tabs, same step
 * components — only the URL and connector name differ.
 *
 * Behind a DEV_EMAILS gate while Meta Ads tooling is still skeleton-only.
 */
export default async function ConnectMetaAdsMcpPagePath({ params }: Props) {
  const session = await getSession();
  const { slug } = await params;

  if (!session.connected) {
    redirect("/connect?next=%2Fconnect-meta-ads-mcp");
  }

  if (!session.googleEmail || !DEV_EMAILS.includes(session.googleEmail)) {
    redirect("/connect");
  }

  return (
    <ConnectMetaAdsMcpPage
      slug={slug}
      apiKey={session.token}
    />
  );
}
