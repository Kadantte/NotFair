import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AUTO_MODE_QUERY, isAutoModeValue } from "@/lib/app-routes";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ auto?: string }>;
};

export default async function ChatRedirect({ searchParams }: Props) {
  // Always default to a fresh thread when the user clicks Chat. Resuming the
  // most recent thread cost a DB roundtrip on every nav; the sidebar already
  // exposes prior threads when the user wants to revisit one.
  const session = await getSession();
  if (!session.connected) redirect("/login");

  const hasGoogle = !session.pendingSetup && session.customerId !== "";
  const hasMeta = session.metaAccounts.length > 0;
  if (!hasGoogle && !hasMeta) redirect("/manage-ads-accounts");

  const sp = await searchParams;
  const autoParam = isAutoModeValue(sp.auto) ? AUTO_MODE_QUERY : "";
  redirect(`/chat/${crypto.randomUUID()}${autoParam}`);
}
