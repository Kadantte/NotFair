import { redirect } from "next/navigation";
import { getSession, getSessionAuth } from "@/lib/session";
import { loadThreadsForUser } from "@/lib/db/chat";
import { unsupportedFeatureRedirect } from "@/lib/onboarding-redirect";

export const dynamic = "force-dynamic";

export default async function ChatRedirect() {
  // Chat is currently a Google-Ads-only surface. Route users without a
  // Google customer somewhere they can actually do work: brand-new users
  // get the onboarding hub, Meta-only users get sent to the Meta MCP page.
  const session = await getSession();
  const unsupported = unsupportedFeatureRedirect(session);
  if (unsupported) {
    redirect(unsupported);
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
