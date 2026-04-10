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
  customer: "adsagent_customer",
  impersonate: "adsagent_impersonate",
  /**
   * Compact { name, picture } captured from Supabase user_metadata at callback
   * time. Lives independently from the Supabase sb-* cookies (which the callback
   * deletes for header-size reasons), so getSession() can still read profile
   * info on subsequent requests without re-querying Supabase.
   */
  profile: "adsagent_profile",
} as const;

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

export function setSessionCookies(
  response: NextResponse,
  token: string,
  customerName: string,
) {
  response.cookies.set(COOKIE_NAMES.token, token, COOKIE_OPTIONS);
  response.cookies.set(COOKIE_NAMES.customer, encodeURIComponent(customerName), COOKIE_OPTIONS);
}

export function setImpersonateCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(COOKIE_NAMES.impersonate, sessionId, IMPERSONATE_COOKIE_OPTIONS);
}

export function clearImpersonateCookie(response: NextResponse) {
  response.cookies.delete(COOKIE_NAMES.impersonate);
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(COOKIE_NAMES.token);
  response.cookies.delete(COOKIE_NAMES.customer);
  response.cookies.delete(COOKIE_NAMES.impersonate);
  response.cookies.delete(COOKIE_NAMES.profile);
}
