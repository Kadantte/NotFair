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

const GADS_SIGNUP_SEND_TO = "AW-18054900065/gL2_CMb-wqscEOHSn6FD";
const GADS_SIGNUP_EMAIL_COOKIE = "gads_signup_email";
const X_EVENT_ID = "tw-q27qa-q27qc";

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    // Corrupt cookie value (malformed %-encoding). Bail rather than throw
    // and take down Reddit + X pixel fires in the same effect.
    return null;
  }
}

/**
 * Fires Google Ads + Reddit + X browser-pixel SignUp events when the
 * `gads_new_signup` cookie is set server-side during the OAuth callback for
 * new users. Google Ads is observation-only here — the source-of-truth fire
 * is server-side (`lib/google-ads-signup.ts`) which avoids ITP/ad-blocker
 * loss. We still fire the browser pixel for cross-check + ECL match.
 *
 * Enhanced Conversions for Leads: when present, `gads_signup_email` carries
 * the new user's email. gtag.js hashes it locally before sending so Google
 * can match the signup to its ad click even when the gclid cookie is gone.
 *
 * `reddit_signup_id` carries the conversion_id used by Reddit CAPI so the
 * browser pixel and server-side event dedupe.
 */
export function GadsConversionTracker() {
  useEffect(() => {
    if (!document.cookie.includes("gads_new_signup=1")) return;

    const redditConversionId = readCookie(REDDIT_SIGNUP_ID_COOKIE);
    const signupEmail = readCookie(GADS_SIGNUP_EMAIL_COOKIE);

    document.cookie = "gads_new_signup=; max-age=0; path=/";
    document.cookie = `${REDDIT_SIGNUP_ID_COOKIE}=; max-age=0; path=/`;
    document.cookie = `${GADS_SIGNUP_EMAIL_COOKIE}=; max-age=0; path=/`;

    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to: GADS_SIGNUP_SEND_TO,
        value: 1.0,
        currency: "USD",
        ...(signupEmail
          ? { user_data: { email_address: signupEmail } }
          : {}),
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
