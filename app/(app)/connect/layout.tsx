import { ConnectSubSider } from "@/components/connect-sub-sider";

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <ConnectSubSider />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
