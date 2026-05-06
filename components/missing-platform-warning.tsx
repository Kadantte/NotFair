import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

const PLATFORMS = {
  google_ads: {
    label: "Google Ads",
    linkHref: "/manage-ads-accounts/google-ads",
  },
  meta_ads: {
    label: "Meta Ads",
    linkHref: "/manage-ads-accounts/meta-ads",
  },
} as const;

export type WarnablePlatform = keyof typeof PLATFORMS;

/**
 * Amber banner shown at the top of /connect/<platform>/* pages when the
 * user is signed in but has no accounts linked on that platform yet.
 * Connecting MCP without any accounts on the platform means the MCP has
 * nothing to bind to — surface that mismatch before they go through the
 * setup steps.
 */
export function MissingPlatformWarning({ platform }: { platform: WarnablePlatform }) {
  const { label, linkHref } = PLATFORMS[platform];
  const t = useTranslations("MissingPlatformWarning");
  return (
    <div className="mb-6 rounded-xl border border-[#D4882A]/40 bg-[#D4882A]/[0.06] px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D4882A]" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-[#E8E4DD]">
            {t("title", { platform: label })}
          </p>
          <p className="mt-1 text-[#C4C0B6]">
            {t("body", { platform: label })}{" "}
            <Link href={linkHref} prefetch className="font-medium text-[#D4882A] underline-offset-2 hover:underline">
              {t("link", { platform: label })}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
