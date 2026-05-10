import { notFound } from "next/navigation";
import { ConnectPage } from "@/components/connect-page";
import { isGhlDevAllowed } from "@/lib/gohighlevel/dev-gate";
import { getSession } from "@/lib/session";

export default async function GoHighLevelConnectPage() {
  const session = await getSession();
  if (!isGhlDevAllowed(session)) notFound();

  return (
    <ConnectPage
      initialSession={session}
      slug={["gohighlevel"]}
    />
  );
}
