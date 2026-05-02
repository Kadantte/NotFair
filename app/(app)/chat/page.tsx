import { redirect } from "next/navigation";
import { getSession, getSessionAuth } from "@/lib/session";
import { loadThreadsForUser } from "@/lib/db/chat";

export const dynamic = "force-dynamic";

export default async function ChatRedirect() {
  // Ads-less users have no Google Ads context for the agent to work with,
  // so route them to /welcome to pick a setup path before letting them chat.
  const session = await getSession();
  if (session.connected && session.pendingSetup) {
    redirect("/welcome");
  }

  const auth = await getSessionAuth().catch(() => null);
  if (auth?.userId) {
    const threads = await loadThreadsForUser(auth.userId, auth.customerId);
    if (threads.length > 0) {
      redirect(`/chat/${threads[0].id}`);
    }
  }

  redirect(`/chat/${crypto.randomUUID()}`);
}
