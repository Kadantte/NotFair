import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/ingest";

let initialized = false;

export type BootstrapUser = {
  distinctId: string;
  properties?: Record<string, unknown>;
} | null;

export function initPostHog(bootstrapUser?: BootstrapUser) {
  if (initialized || !POSTHOG_KEY || typeof window === "undefined") return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: "https://us.posthog.com",
    person_profiles: "always",
    capture_pageview: false, // we handle this manually for SPA routes
    capture_pageleave: true,
    capture_exceptions: true,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: false,
      maskInputFn: (text, element) => {
        // Mask password fields
        if (element?.getAttribute("type") === "password") return "*".repeat(text.length);
        return text;
      },
    },
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
