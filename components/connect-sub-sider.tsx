"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Workflow } from "lucide-react";

type IconKind = "google" | "meta" | "gohighlevel";

const ITEMS: Array<{
  href: string;
  labelKey: "googleAds" | "metaAds" | "gohighlevel";
  match: (pathname: string) => boolean;
  icon: IconKind;
  devOnly?: boolean;
}> = [
  {
    href: "/connect/google-ads",
    labelKey: "googleAds",
    icon: "google",
    match: (p) => p === "/connect" || p.startsWith("/connect/google-ads"),
  },
  {
    href: "/connect/meta-ads",
    labelKey: "metaAds",
    icon: "meta",
    match: (p) => p.startsWith("/connect/meta-ads"),
  },
  {
    href: "/connect/gohighlevel",
    labelKey: "gohighlevel",
    icon: "gohighlevel",
    match: (p) => p.startsWith("/connect/gohighlevel"),
    devOnly: true,
  },
];

function ItemIcon({ icon }: { icon: IconKind }) {
  if (icon === "gohighlevel") {
    return (
      <Workflow className="h-4 w-4 shrink-0 text-current" aria-hidden="true" />
    );
  }
  const src = icon === "google" ? "/google-ads-icon.svg" : "/meta-icon.svg";
  return (
    <Image src={src} alt="" width={16} height={16} className="shrink-0" aria-hidden="true" />
  );
}

export function ConnectSubSider({ showGoHighLevel = false }: { showGoHighLevel?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("ConnectSubSider");
  const items = ITEMS.filter((item) => !item.devOnly || showGoHighLevel);

  return (
    <aside className="hidden md:flex w-[200px] shrink-0 flex-col border-r border-[#3D3C36] bg-[#1A1917] p-2">
      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C4C0B6]/70">
        {t("title")}
      </div>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = item.match(pathname);
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
              <ItemIcon icon={item.icon} />
              <span className="truncate">{t(`items.${item.labelKey}`)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
