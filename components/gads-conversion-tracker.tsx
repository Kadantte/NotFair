"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    rdt?: (...args: unknown[]) => void;
  }
}

const CONVERSION_SEND_TO = "AW-18054900065/_E3uCKKHoJMcEOHSn6FD";

/**
 * Fires Google Ads + Reddit Ads conversion events when the `gads_new_signup`
 * cookie is set server-side during the OAuth callback for new users.
 * The cookie is cleared after firing so events only send once.
 */
export function GadsConversionTracker() {
  useEffect(() => {
    if (!document.cookie.includes("gads_new_signup=1")) return;

    document.cookie = "gads_new_signup=; max-age=0; path=/";

    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to: CONVERSION_SEND_TO,
        value: 1.0,
        currency: "USD",
      });
    }

    if (typeof window.rdt === "function") {
      window.rdt("track", "SignUp");
    }
  }, []);

  return null;
}
