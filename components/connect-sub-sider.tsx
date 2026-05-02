"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: Array<{
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: "google" | "meta";
}> = [
  {
    href: "/connect/google-ads",
    label: "Google Ads MCP",
    icon: "google",
    match: (p) => p === "/connect" || p.startsWith("/connect/google-ads"),
  },
  {
    href: "/connect/meta-ads",
    label: "Meta Ads MCP",
    icon: "meta",
    match: (p) => p.startsWith("/connect/meta-ads"),
  },
];

export function ConnectSubSider() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-[200px] shrink-0 flex-col border-r border-[#3D3C36] bg-[#1A1917] p-2">
      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C4C0B6]/70">
        Connect MCP
      </div>
      <nav className="space-y-0.5">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const iconSrc = item.icon === "google" ? "/google-ads-icon.svg" : "/meta-icon.svg";
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition ${
                active
                  ? "bg-[#4CAF6E]/12 text-[#4CAF6E]"
                  : "text-[#C4C0B6] hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD]"
              }`}
            >
              <Image src={iconSrc} alt="" width={16} height={16} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
