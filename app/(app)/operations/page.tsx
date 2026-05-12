import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import OperationsView from "./operations-view";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const session = await getSession();
  if (!session.connected) redirect("/login");

  const hasGoogle = !session.pendingSetup && session.customerId !== "";
  const hasMeta = session.metaAccounts.length > 0;
  if (!hasGoogle && !hasMeta) redirect("/manage-ads-accounts");

  return <OperationsView />;
}
