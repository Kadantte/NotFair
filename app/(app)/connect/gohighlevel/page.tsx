import { ConnectPage } from "@/components/connect-page";
import { getSession } from "@/lib/session";

export default async function GoHighLevelConnectPage() {
  const session = await getSession();

  return (
    <ConnectPage
      initialSession={session}
      slug={["gohighlevel"]}
    />
  );
}
