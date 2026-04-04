"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const CONVERSION_SEND_TO = "AW-18054900065/_E3uCKKHoJMcEOHSn6FD";

/**
 * Fires a Google Ads conversion event when the `gads_new_signup` cookie is set.
 * The cookie is set server-side during the OAuth callback for new users.
 * After firing, the cookie is cleared so the event only fires once.
 */
export function GadsConversionTracker() {
  useEffect(() => {
    if (!document.cookie.includes("gads_new_signup=1")) return;

    // Clear the cookie immediately so it only fires once
    document.cookie = "gads_new_signup=; max-age=0; path=/";

    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to: CONVERSION_SEND_TO,
        value: 1.0,
        currency: "USD",
      });
    }
  }, []);

  return null;
}
