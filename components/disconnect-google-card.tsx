"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Disconnect-Google card. Mirrors the Meta DisconnectCard but on success it
 * hard-navigates to `/` because deleting the Google connection also
 * destroys the user's NotFair session (Google OAuth is the auth grant).
 */
export function DisconnectGoogleCard({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("ManageAdsAccounts.disconnectGoogle");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/disconnect-google", {
        method: "DELETE",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        setError(body.error_description ?? body.error ?? t("failed"));
        setPending(false);
        return;
      }
      // Server cleared session cookies. Hard-navigate so any cached client
      // state (including module-level data caches) is dropped.
      window.location.assign("/");
    } catch {
      setError(t("networkError"));
      setPending(false);
    }
  }, [confirming, t]);

  return (
    <div className="mt-6 rounded-2xl border border-[#C45D4A]/30 bg-[#C45D4A]/[0.04] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-md bg-[#C45D4A]/15 p-2">
            <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#E8E4DD]">{t("title")}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">{t("body")}</p>
            {error && (
              <p className="mt-2 text-sm text-[#C45D4A]" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {confirming && !pending && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-9 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 text-sm text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
            >
              {t("cancel")}
            </button>
          )}
          <Button
            type="button"
            onClick={handleClick}
            disabled={disabled || pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#C45D4A] px-4 text-sm font-semibold text-[#E8E4DD] hover:bg-[#A84A3A] disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unplug className="h-4 w-4" />
            )}
            {confirming ? t("confirm") : t("button")}
          </Button>
        </div>
      </div>
    </div>
  );
}
