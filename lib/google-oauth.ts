"use client";

import { UTM_KEYS, UTM_STORAGE_PREFIX } from "@/lib/utm";

function buildAuthUrl(next: string, popup: boolean) {
  const url = new URL("/api/auth/signin", window.location.origin);
  url.searchParams.set("next", next);
  if (popup) {
    url.searchParams.set("popup", "1");
  }
  // Forward UTM params — prefer current URL, fall back to sessionStorage
  const currentParams = new URLSearchParams(window.location.search);
  for (const key of UTM_KEYS) {
    const val = currentParams.get(key)
      ?? sessionStorage.getItem(`${UTM_STORAGE_PREFIX}${key}`);
    if (val) url.searchParams.set(key, val);
  }
  return url.toString();
}

export async function startGoogleConnect(next = "/connect") {
  window.location.assign(buildAuthUrl(next, false));
}

export async function startGoogleConnectPopup(next = "/connect") {
  const width = 600;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  window.open(
    buildAuthUrl(next, true),
    "Google Ads Auth",
    `width=${width},height=${height},top=${top},left=${left}`,
  );
}
