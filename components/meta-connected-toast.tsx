"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { appToastSuccess } from "@/lib/app-toast";

/**
 * Fires a success toast after a Meta OAuth round-trip — the callback
 * redirects to /connect/meta-ads?connected=1 and this client island reads
 * the flag from window.location, then dispatches an `app-toast` event. The
 * <AppToaster /> in the root layout listens and renders the toast.
 */
export function MetaConnectedToast() {
  const t = useTranslations("ConnectedToasts.meta");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") !== "1") return;
    fired.current = true;
    appToastSuccess(
      t("title"),
      t("body"),
    );
  }, [t]);

  return null;
}
