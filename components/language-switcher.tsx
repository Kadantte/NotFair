"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { localeLabels, locales, type AppLocale } from "@/i18n/locales";

type LanguageSwitcherProps = {
  className?: string;
  mode?: "links" | "cookie";
};

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function getPathLocale(pathname: string): AppLocale | null {
  return locales.find((entry) => pathname === `/${entry}` || pathname.startsWith(`/${entry}/`)) ?? null;
}

function normalizePathname(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function getCanonicalPathname(pathname: string): string {
  const normalizedPathname = normalizePathname(pathname);
  const pathLocale = getPathLocale(normalizedPathname);
  if (!pathLocale) return normalizedPathname || "/";

  return normalizedPathname.slice(`/${pathLocale}`.length) || "/";
}

function getLocalizedHomeHref(locale: AppLocale) {
  return locale === "en" ? "/" : `/${locale}`;
}

export function LanguageSwitcher({ className = "", mode = "links" }: LanguageSwitcherProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("LocaleSwitcher");
  const pathname = usePathname();
  const canonicalPathname = getCanonicalPathname(pathname || "/");
  const canUseLocaleLinks = canonicalPathname === "/";

  function switchInPlace(nextLocale: AppLocale) {
    setLocaleCookie(nextLocale);
    window.location.assign(`${canonicalPathname}${window.location.search}`);
  }

  return (
    <div className={`group relative ${className}`}>
      <button
        type="button"
        aria-label={t("label")}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[#3D3C36] bg-[#24231F] px-3 text-[13px] font-medium text-[#C4C0B6] transition-colors hover:border-[#4D4C46] hover:text-[#E8E4DD]"
      >
        <Languages className="h-3.5 w-3.5" />
        <span>{localeLabels[locale] ?? localeLabels.en}</span>
      </button>
      <div className="invisible absolute right-0 top-full z-50 mt-2 min-w-40 rounded-lg border border-[#3D3C36] bg-[#24231F] p-1 opacity-0 shadow-xl shadow-black/30 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {locales.map((entry) => {
          const active = entry === locale;
          const className = `block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
            active
              ? "bg-[#4CAF6E]/12 text-[#4CAF6E]"
              : "text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
          }`;
          return mode === "cookie" || !canUseLocaleLinks ? (
            <button
              key={entry}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => switchInPlace(entry)}
              className={className}
            >
              {localeLabels[entry]}
              {active ? (
                <span className="sr-only"> - {t("current")}</span>
              ) : null}
            </button>
          ) : (
            <Link
              key={entry}
              href={getLocalizedHomeHref(entry)}
              prefetch
              aria-current={active ? "page" : undefined}
              onClick={() => setLocaleCookie(entry)}
              className={className}
            >
              {localeLabels[entry]}
              {active ? (
                <span className="sr-only"> - {t("current")}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
