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
} as const;

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
}
