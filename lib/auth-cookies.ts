import { type NextResponse } from "next/server";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year
};

export const COOKIE_NAMES = {
  token: "adsagent_token",
  impersonate: "adsagent_impersonate",
  /**
   * Compact { name, picture } captured from Supabase user_metadata at callback
   * time. Lives independently from the Supabase sb-* cookies (which the callback
   * deletes for header-size reasons), so getSession() can still read profile
   * info on subsequent requests without re-querying Supabase.
   */
  profile: "adsagent_profile",
  /**
   * Email of the Google identity that just failed an OAuth attempt (no Ads
   * accounts, no client accounts under MCC, etc.). Read once on /connect to
   * surface "No accounts found for foo@example.com" so the user can self-
   * diagnose "I used the wrong Google account." Short-lived; never carries
   * authority — purely for display.
   */
  lastAttemptEmail: "adsagent_last_attempt_email",
  /**
   * Which ad platform is currently "active" in the navbar account switcher.
   * Drives sidebar gating (Campaigns/Audit/Impact Monitor/Operations are
   * Google-only for now). Values: "google_ads" | "meta_ads". Missing cookie
   * defaults to "google_ads".
   */
  activePlatform: "adsagent_active_platform",
} as const;

export type ActivePlatform = "google_ads" | "meta_ads";

export function setActivePlatformCookie(response: NextResponse, platform: ActivePlatform) {
  response.cookies.set(COOKIE_NAMES.activePlatform, platform, COOKIE_OPTIONS);
}

const LAST_ATTEMPT_EMAIL_OPTIONS = {
  httpOnly: true, // Read server-side in /connect's server component, passed as prop
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 300, // 5 minutes — long enough to render, short enough to not stick around
};

export function setLastAttemptEmailCookie(response: NextResponse, email: string | null) {
  if (!email) return;
  response.cookies.set(COOKIE_NAMES.lastAttemptEmail, email, LAST_ATTEMPT_EMAIL_OPTIONS);
}

export function clearLastAttemptEmailCookie(response: NextResponse) {
  response.cookies.delete(COOKIE_NAMES.lastAttemptEmail);
}

export interface ProfileCookie {
  name?: string | null;
  picture?: string | null;
}

export function setProfileCookie(response: NextResponse, profile: ProfileCookie) {
  if (!profile.name && !profile.picture) return;
  response.cookies.set(
    COOKIE_NAMES.profile,
    encodeURIComponent(JSON.stringify({ name: profile.name ?? null, picture: profile.picture ?? null })),
    COOKIE_OPTIONS,
  );
}

export function clearProfileCookie(response: NextResponse) {
  response.cookies.delete(COOKIE_NAMES.profile);
}

const IMPERSONATE_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 60 * 60 * 8, // 8 hours — safety limit for dev impersonation
};

export function setSessionCookies(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAMES.token, token, COOKIE_OPTIONS);
  // Phase-2 header reclaim: `adsagent_customer` was up to ~1KB of customer-
  // name list. Nothing reads it — getSession derives `customerName` fresh
  // from `customerIds` on every render. Force-delete on every session set
  // so existing browsers shed it on their next signin/account-switch/
  // token-rotation. Drop this line once we've confirmed no live cookies
  // remain in the wild (e.g. via shadow logging in middleware).
  response.cookies.set("adsagent_customer", "", { maxAge: 0, path: "/" });
}

export function setImpersonateCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(COOKIE_NAMES.impersonate, sessionId, IMPERSONATE_COOKIE_OPTIONS);
}

export function clearImpersonateCookie(response: NextResponse) {
  response.cookies.delete(COOKIE_NAMES.impersonate);
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(COOKIE_NAMES.token);
  response.cookies.delete(COOKIE_NAMES.impersonate);
  response.cookies.delete(COOKIE_NAMES.profile);
  response.cookies.delete(COOKIE_NAMES.activePlatform);
  // Legacy cookie cleanup — see setSessionCookies for context.
  response.cookies.delete("adsagent_customer");
}
