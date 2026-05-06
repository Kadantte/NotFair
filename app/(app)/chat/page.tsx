import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChatRedirect() {
  // Always default to a fresh thread when the user clicks Chat. Resuming the
  // most recent thread cost a DB roundtrip on every nav; the sidebar already
  // exposes prior threads when the user wants to revisit one.
  const session = await getSession();
  if (!session.connected) redirect("/login");

  const hasGoogle = !session.pendingSetup && session.customerId !== "";
  const hasMeta = session.metaAccounts.length > 0;
  if (!hasGoogle && !hasMeta) redirect("/manage-ads-accounts");

  redirect(`/chat/${crypto.randomUUID()}`);
}
