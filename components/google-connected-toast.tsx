"use client";

import { useEffect, useRef } from "react";
import { appToastSuccess } from "@/lib/app-toast";

/**
 * Fires a success toast after a Google Ads account-pick save — the
 * /api/auth/select-account flow lands the user on
 * /connect/google-ads?connected=1 and this client island reads the flag
 * from window.location and dispatches an `app-toast` event. The
 * <AppToaster /> in the root layout listens and renders the toast.
 */
export function GoogleConnectedToast() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") !== "1") return;
    fired.current = true;
    appToastSuccess(
      "Google Ads accounts connected.",
      "Set up the Google Ads MCP so Claude, Codex, and other clients can use it.",
    );
  }, []);

  return null;
}
