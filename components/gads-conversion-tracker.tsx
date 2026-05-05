"use client";

import { useEffect } from "react";
import { REDDIT_SIGNUP_ID_COOKIE } from "@/lib/reddit-capi";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    rdt?: (...args: unknown[]) => void;
    twq?: (...args: unknown[]) => void;
  }
}

const CONVERSION_SEND_TO = "AW-18054900065/_E3uCKKHoJMcEOHSn6FD";
const X_EVENT_ID = "tw-q27qa-q27qc";

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

/**
 * Fires Google Ads + Reddit Ads conversion events when the `gads_new_signup`
 * cookie is set server-side during the OAuth callback for new users.
 * `reddit_signup_id` is the same conversion_id fired to Reddit's CAPI and
 * must match here so Reddit can dedupe the browser pixel event.
 */
export function GadsConversionTracker() {
  useEffect(() => {
    if (!document.cookie.includes("gads_new_signup=1")) return;

    const redditConversionId = readCookie(REDDIT_SIGNUP_ID_COOKIE);

    document.cookie = "gads_new_signup=; max-age=0; path=/";
    document.cookie = `${REDDIT_SIGNUP_ID_COOKIE}=; max-age=0; path=/`;

    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to: CONVERSION_SEND_TO,
        value: 1.0,
        currency: "USD",
      });
    }

    if (typeof window.rdt === "function") {
      window.rdt(
        "track",
        "SignUp",
        redditConversionId ? { conversionId: redditConversionId } : undefined,
      );
    }

    if (typeof window.twq === "function") {
      window.twq("event", X_EVENT_ID, {
        value: 1.0,
        currency: "USD",
        ...(redditConversionId ? { conversion_id: redditConversionId } : {}),
      });
    }
  }, []);

  return null;
}
