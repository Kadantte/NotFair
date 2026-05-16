"use client";

import { useEffect } from "react";
import { REDDIT_SIGNUP_ID_COOKIE } from "@/lib/reddit-capi";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    rdt?: (...args: unknown[]) => void;
    twq?: (...args: unknown[]) => void;
    ttq?: (...args: unknown[]) => void;
  }
}

const GADS_SIGNUP_SEND_TO = "AW-18054900065/gL2_CMb-wqscEOHSn6FD";
const GADS_SIGNUP_EMAIL_COOKIE = "gads_signup_email";
const X_SIGNUP_ID_COOKIE = "x_signup_id";
const PIXEL_RETRY_MS = 250;
const PIXEL_MAX_ATTEMPTS = 20;

export function resolveXSignupEventId(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string | undefined {
  return env.NEXT_PUBLIC_X_SIGNUP_EVENT_ID ??
    env.NEXT_PUBLIC_X_EVENT_ID ??
    (env.NEXT_PUBLIC_X_PIXEL_ID ? undefined : "tw-q27qa-q27qc");
}

const X_SIGNUP_EVENT_ID = resolveXSignupEventId();

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

function clearCookie(name: string): void {
  document.cookie = `${name}=; max-age=0; path=/`;
}

/**
 * Fires signup browser pixels after the server marks a real new signup.
 * Google Ads + Reddit are gated on `gads_new_signup`; X can also fire from
 * `x_signup_id` so email-only signups do not need Google Ads cookies.
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
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let gadsFired = false;
    let redditFired = false;
    let xFired = false;
    let tiktokFired = false;

    function attemptFire(): void {
      attempts += 1;

      const hasGadsSignup = document.cookie.includes("gads_new_signup=1");
      const hasXSignup = document.cookie.includes(`${X_SIGNUP_ID_COOKIE}=`);
      if (!hasGadsSignup && !hasXSignup) return;

      const redditConversionId = readCookie(REDDIT_SIGNUP_ID_COOKIE);
      const xConversionId = readCookie(X_SIGNUP_ID_COOKIE) ?? redditConversionId;
      const signupEmail = readCookie(GADS_SIGNUP_EMAIL_COOKIE);

      if (hasGadsSignup && !gadsFired && typeof window.gtag === "function") {
        window.gtag("event", "conversion", {
          send_to: GADS_SIGNUP_SEND_TO,
          value: 1.0,
          currency: "USD",
          ...(signupEmail
            ? { user_data: { email_address: signupEmail } }
            : {}),
        });
        gadsFired = true;
      }

      if (hasGadsSignup && !redditFired && typeof window.rdt === "function") {
        window.rdt(
          "track",
          "SignUp",
          redditConversionId ? { conversionId: redditConversionId } : undefined,
        );
        redditFired = true;
      }

      if (
        X_SIGNUP_EVENT_ID &&
        !xFired &&
        (hasXSignup || xConversionId) &&
        typeof window.twq === "function"
      ) {
        window.twq("event", X_SIGNUP_EVENT_ID, {
          value: 1.0,
          currency: "USD",
          ...(xConversionId ? { conversion_id: xConversionId } : {}),
        });
        xFired = true;
        clearCookie(X_SIGNUP_ID_COOKIE);
      }

      if (hasGadsSignup && !tiktokFired && typeof window.ttq === "function") {
        window.ttq("track", "CompleteRegistration", {
          value: 1.0,
          currency: "USD",
          // event_id deduplicates against the server-side CAPI event (same UUID)
          ...(redditConversionId ? { event_id: redditConversionId } : {}),
        });
        tiktokFired = true;
      }

      const retryX = hasXSignup && !xFired && X_SIGNUP_EVENT_ID;
      const retryGads = hasGadsSignup && !gadsFired;
      const retryReddit = hasGadsSignup && !redditFired;
      const retryTiktok = hasGadsSignup && !tiktokFired;
      if (attempts < PIXEL_MAX_ATTEMPTS && (retryX || retryGads || retryReddit || retryTiktok)) {
        timeoutId = setTimeout(attemptFire, PIXEL_RETRY_MS);
      } else if (hasGadsSignup && ((gadsFired && redditFired && tiktokFired) || attempts >= PIXEL_MAX_ATTEMPTS)) {
        clearCookie("gads_new_signup");
        clearCookie(REDDIT_SIGNUP_ID_COOKIE);
        clearCookie(GADS_SIGNUP_EMAIL_COOKIE);
      }
    }

    attemptFire();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
