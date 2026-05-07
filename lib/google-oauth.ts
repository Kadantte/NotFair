"use client";

import { ATTRIBUTION_PARAM_KEYS, UTM_STORAGE_PREFIX } from "@/lib/utm";

export type GoogleConnectOptions = {
  /**
   * Override Google's `prompt` param. Defaults to "consent". Pass
   * "select_account consent" to force the account picker — useful when
   * retrying after a no-accounts failure where the same identity would
   * just fail again.
   */
  prompt?: "consent" | "select_account" | "select_account consent";
};

function buildAuthUrl(next: string, popup: boolean, options?: GoogleConnectOptions) {
  const url = new URL("/api/auth/signin", window.location.origin);
  url.searchParams.set("next", next);
  if (popup) {
    url.searchParams.set("popup", "1");
  }
  if (options?.prompt) {
    url.searchParams.set("prompt", options.prompt);
  }
  // Forward first-touch params when present — /api/auth/signin also reads the
  // durable cookie, but explicit query params keep popup flows self-contained.
  const currentParams = new URLSearchParams(window.location.search);
  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const val = currentParams.get(key)
      ?? sessionStorage.getItem(`${UTM_STORAGE_PREFIX}${key}`);
    if (val) url.searchParams.set(key, val);
  }
  // Forward the original marketing referrer (captured before OAuth bounces it to accounts.google.com)
  const storedReferrer = sessionStorage.getItem(`${UTM_STORAGE_PREFIX}referrer`);
  if (storedReferrer) url.searchParams.set("signup_referrer", storedReferrer);
  return url.toString();
}

export async function startGoogleConnect(next = "/connect", options?: GoogleConnectOptions) {
  window.location.assign(buildAuthUrl(next, false, options));
}

export async function startGoogleConnectPopup(next = "/connect", options?: GoogleConnectOptions) {
  const width = 600;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  window.open(
    buildAuthUrl(next, true, options),
    "Google Ads Auth",
    `width=${width},height=${height},top=${top},left=${left}`,
  );
}
