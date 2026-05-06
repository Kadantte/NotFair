import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { defaultLocale, locales, type AppLocale } from "@/i18n/locales";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_HEADER } from "@/i18n/locale-preference";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

const APP_PATH_PREFIXES = [
  "/connect",
  "/login",
  "/manage-ads-accounts",
  "/campaigns",
  "/operations",
  "/tools",
  "/chat",
  "/audit",
  "/impact-monitor",
  "/upgrade",
  "/usage",
  "/dev",
  "/outreach",
] as const;

const RUSSIAN_RELATED_LANGUAGE_CODES = new Set([
  "ru",
  "be",
  "uk",
  "pl",
  "kk",
  "ky",
  "uz",
  "tg",
  "tk",
  "hy",
  "az",
  "ka",
]);

const RUSSIAN_RELATED_REGION_CODES = new Set([
  "ru",
  "by",
  "pl",
  "ua",
  "kz",
  "kg",
  "uz",
  "tj",
  "tm",
  "am",
  "az",
  "ge",
  "md",
  "ee",
  "lv",
  "lt",
]);

function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getPathLocale(pathname: string): AppLocale | null {
  return locales.find((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) ?? null;
}

function normalizePathname(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isLocalizedHomePath(pathname: string): boolean {
  const normalizedPathname = normalizePathname(pathname);
  return normalizedPathname === "/" || locales.some((locale) => normalizedPathname === `/${locale}`);
}

function isRootPath(pathname: string): boolean {
  return normalizePathname(pathname) === "/";
}

function detectLocale(request: NextRequest): AppLocale {
  const pathLocale = getPathLocale(request.nextUrl.pathname);
  if (pathLocale) return pathLocale;

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (locales.includes(cookieLocale as AppLocale)) return cookieLocale as AppLocale;

  const accepted = request.headers.get("accept-language") ?? "";
  const candidates = accepted
    .split(",")
    .map((part) => part.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "pt-br" || candidate.startsWith("pt-br-")) return "pt-BR";
    const [primary, region] = candidate.split("-");
    if (primary === "fr") return "fr";
    if (primary === "de") return "de";
    if (primary === "th") return "th";
    if (primary === "pt") return "pt-BR";
    if (primary === "es") return "es";
    if (RUSSIAN_RELATED_LANGUAGE_CODES.has(primary) || (region && RUSSIAN_RELATED_REGION_CODES.has(region))) {
      return "ru";
    }
    if (primary === "en") return "en";
  }

  return defaultLocale;
}

function setLocaleCookie(response: NextResponse, locale: AppLocale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

function nextWithLocale(request: NextRequest, locale: AppLocale) {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);

  const response = NextResponse.next({
    request: {
      headers,
    },
  });
  setLocaleCookie(response, locale);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pathLocale = getPathLocale(pathname);

  if (pathLocale && !isLocalizedHomePath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(`/${pathLocale}`.length) || "/";

    const response = NextResponse.redirect(url);
    setLocaleCookie(response, pathLocale);
    return response;
  }

  if (isAppPath(pathname)) {
    const response = await updateSession(request);
    if (!request.cookies.has(LOCALE_COOKIE)) {
      setLocaleCookie(response, detectLocale(request));
    }
    return response;
  }

  if (isRootPath(pathname)) {
    const locale = detectLocale(request);
    if (locale === defaultLocale) {
      return nextWithLocale(request, locale);
    }

    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;

    const response = NextResponse.redirect(url);
    setLocaleCookie(response, locale);
    return response;
  }

  if (!isLocalizedHomePath(pathname)) {
    return nextWithLocale(request, detectLocale(request));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Run on all routes except static assets, internal assets, API routes, and files.
    // API routes use their own auth (MCP Bearer tokens, Google Ads OAuth).
    "/((?!api|_next/static|_next/image|_vercel|.*\\..*).*)",
  ],
};
