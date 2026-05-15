"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";

type Size = "sm" | "lg" | "xl";

type Props = {
  tracking: { page: string; position: string };
  label?: string;
  returnTo?: string;
  size?: Size;
};

const sizeClass: Record<Size, string> = {
  sm: "h-9 rounded-full bg-[#4CAF6E] px-4 text-[13px] font-semibold text-[#1A1917] transition-all hover:scale-[1.02] hover:bg-[#3D9A5C] disabled:opacity-70",
  lg: "h-12 rounded-full bg-[#4CAF6E] px-7 text-base font-semibold text-black transition-all hover:scale-[1.02] hover:bg-[#3D9A5C] disabled:opacity-70 sm:px-8",
  xl: "h-14 rounded-full bg-[#4CAF6E] px-9 text-lg font-semibold text-black shadow-[0_10px_40px_-10px_rgba(76,175,110,0.6)] transition-all hover:scale-[1.03] hover:bg-[#3D9A5C] hover:shadow-[0_14px_48px_-10px_rgba(76,175,110,0.75)] disabled:opacity-70 sm:px-10",
};

const spinnerClass: Record<Size, string> = {
  sm: "h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1A1917] border-t-transparent",
  lg: "h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent",
  xl: "h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent",
};

export function ConnectClaudeCTA({
  tracking,
  label,
  returnTo = "/connect",
  size = "lg",
}: Props) {
  const session = useSession();
  const [loading, setLoading] = useState(false);
  const t = useTranslations("CTA");

  function handleClick() {
    if (loading) return;
    setLoading(true);
    trackEvent("cta_clicked", {
      page: tracking.page,
      cta: "connect_claude",
      position: tracking.position,
      destination: returnTo,
      requires_auth: !session.connected,
    });
    if (session.connected) {
      window.location.assign(returnTo);
    } else {
      startGoogleConnect(returnTo);
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading} className={sizeClass[size]}>
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className={spinnerClass[size]} />
          {t("connecting")}
        </span>
      ) : (
        <>
          {label ?? t("connectGoogleAds")}
          {!label && <ArrowRight className="ml-1 h-5 w-5" />}
        </>
      )}
    </Button>
  );
}
