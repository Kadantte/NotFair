import { redirect } from "next/navigation";
import { getSessionAuth } from "@/lib/session";
import { loadThreadsForUser } from "@/lib/db/chat";

export const dynamic = "force-dynamic";

export default async function ChatRedirect() {
  const session = await getSessionAuth().catch(() => null);

  if (session?.userId) {
    const threads = await loadThreadsForUser(session.userId, session.customerId);
    if (threads.length > 0) {
      redirect(`/chat/${threads[0].id}`);
    }
  }

  redirect(`/chat/${crypto.randomUUID()}`);
}
