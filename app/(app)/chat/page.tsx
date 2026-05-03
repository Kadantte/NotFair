import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadThreadsForUser } from "@/lib/db/chat";

export const dynamic = "force-dynamic";

export default async function ChatRedirect() {
  // Chat now supports both Google Ads and Meta Ads — the agent factory
  // dispatches on `session.activePlatform` (see app/api/chat/route.ts).
  // Users with no platform connected at all still get bounced to the
  // onboarding hub; everyone else lands in chat.
  const session = await getSession();
  if (!session.connected) redirect("/login");

  const hasGoogle = !session.pendingSetup && session.customerId !== "";
  const hasMeta = session.metaAccounts.length > 0;
  if (!hasGoogle && !hasMeta) redirect("/manage-ads-accounts");

  // Resume the most recent thread on the user's active platform's account
  // when one exists. accountId on the thread row is whichever platform's id
  // was active at upsert time, so loading by the active account naturally
  // scopes to threads the user actually started under that platform.
  const accountId =
    session.activePlatform === "meta_ads"
      ? session.activeMetaAccountId ?? ""
      : session.customerId;

  if (session.userId && accountId) {
    const threads = await loadThreadsForUser(session.userId, accountId);
    if (threads.length > 0) {
      redirect(`/chat/${threads[0].id}`);
    }
  }

  redirect(`/chat/${crypto.randomUUID()}`);
}
