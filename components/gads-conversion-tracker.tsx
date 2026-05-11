"use client";

import { useEffect } from "react";
import { REDDIT_SIGNUP_ID_COOKIE } from "@/lib/reddit-capi";

declare global {
  interface Window {
    rdt?: (...args: unknown[]) => void;
    twq?: (...args: unknown[]) => void;
  }
}

const X_EVENT_ID = "tw-q27qa-q27qc";

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

/**
 * Fires Reddit + X browser-pixel SignUp events when the `gads_new_signup`
 * cookie is set server-side during the OAuth callback for new users.
 * `reddit_signup_id` carries the conversion_id used by Reddit CAPI so the
 * browser pixel and server-side event dedupe.
 *
 * Google Ads conversions intentionally do NOT fire here — Google Ads tracks
 * "First write request" (activation), uploaded server-side from
 * `lib/google-ads-first-write.ts` on the user's first successful write. Raw
 * signups are too far up-funnel to be a useful bidding signal.
 */
export function GadsConversionTracker() {
  useEffect(() => {
    if (!document.cookie.includes("gads_new_signup=1")) return;

    const redditConversionId = readCookie(REDDIT_SIGNUP_ID_COOKIE);

    document.cookie = "gads_new_signup=; max-age=0; path=/";
    document.cookie = `${REDDIT_SIGNUP_ID_COOKIE}=; max-age=0; path=/`;

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
