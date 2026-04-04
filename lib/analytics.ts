import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

export type BootstrapUser = {
  distinctId: string;
  properties?: Record<string, unknown>;
} | null;

export function initPostHog(bootstrapUser?: BootstrapUser) {
  if (initialized || !POSTHOG_KEY || typeof window === "undefined") return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false, // we handle this manually for SPA routes
    capture_pageleave: true,
    bootstrap: bootstrapUser
      ? { distinctID: bootstrapUser.distinctId, isIdentifiedID: true }
      : undefined,
  });
  if (bootstrapUser?.properties) {
    posthog.setPersonProperties(bootstrapUser.properties);
  }
  initialized = true;
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.identify(userId, properties);
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function trackPageView(path: string, referrer?: string) {
  if (!initialized) return;
  posthog.capture("$pageview", {
    $current_url: window.location.href,
    path,
    referrer: referrer ?? document.referrer,
  });
}

export { posthog };
