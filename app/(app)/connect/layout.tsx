import { ConnectSubSider } from "@/components/connect-sub-sider";
import { isGhlDevAllowed } from "@/lib/gohighlevel/dev-gate";
import { getSession } from "@/lib/session";

export default async function ConnectLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex h-full min-h-0">
      <ConnectSubSider showGoHighLevel={isGhlDevAllowed(session)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
