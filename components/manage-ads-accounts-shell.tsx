"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

/**
 * Page chrome shared by /manage-ads-accounts/google-ads and
 * /manage-ads-accounts/meta-ads: section wrapper, max-width column,
 * back link to the platform picker, and an optional error banner.
 *
 * The platform-specific content (account selectors, connect CTAs) lives
 * in the page itself — this shell is intentionally small to avoid forcing
 * Google's MCC grouping and Meta's BM/currency badges through one shape.
 */
export function ManageAdsAccountsShell({
  error,
  children,
}: {
  error?: string | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("ManageAdsAccounts");

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/manage-ads-accounts"
            prefetch
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#C4C0B6] transition hover:text-[#E8E4DD]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t("back")}</span>
          </Link>
          {error && (
            <div className="mb-6 rounded-lg border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
              {error}
            </div>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
