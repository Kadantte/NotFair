import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadMessagesIfOwned } from "@/lib/db/chat";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";
import ChatThread, { type ChatThreadInitialAccount } from "@/components/chat/chat-thread";

export const dynamic = "force-dynamic";

type Params = { threadId: string };

export default async function ChatThreadPage({ params }: { params: Promise<Params> }) {
  const { threadId } = await params;
  const session = await getSession();
  if (!session.connected) redirect("/login");

  const hasGoogle = !session.pendingSetup && session.customerId !== "";
  const hasMeta = session.metaAccounts.length > 0;
  if (!hasGoogle && !hasMeta) redirect("/manage-ads-accounts");

  const platform = session.activePlatform === "meta_ads" ? "meta_ads" : "google_ads";
  const fallbackName = platform === "meta_ads" ? "Meta Ads Account" : "Google Ads Account";
  const customerId =
    platform === "meta_ads" ? session.activeMetaAccountId ?? null : session.customerId ?? null;

  const initialAccount: ChatThreadInitialAccount = {
    customerId,
    customerName: session.customerName || fallbackName,
    platform,
  };

  const rows = session.userId ? await loadMessagesIfOwned(threadId, session.userId) : null;
  const initialMessages: GoogleAdsAgentUIMessage[] = (rows ?? []).map(row => ({
    id: row.id,
    role: row.role as GoogleAdsAgentUIMessage["role"],
    parts: row.parts as GoogleAdsAgentUIMessage["parts"],
  }));

  return (
    <ChatThread
      threadId={threadId}
      initialAccount={initialAccount}
      initialMessages={initialMessages}
    />
  );
}
