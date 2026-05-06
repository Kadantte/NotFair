import { defaultLocale, isLocale, locales, type AppLocale } from "./locales";

export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_HEADER = "X-NEXT-INTL-LOCALE";
export const LOCALE_STORAGE_KEY = "notfair:preferred-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function getSupportedLocale(value: string | null | undefined): AppLocale | null {
  return isLocale(value) ? value : null;
}

export function getLocaleCookieString(locale: AppLocale) {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function persistLocalePreference(locale: AppLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Cookie persistence still covers the server path if storage is unavailable.
  }

  document.cookie = getLocaleCookieString(locale);
}

export function getLocalePreferenceBootstrapScript() {
  return `(function(){try{var key=${JSON.stringify(LOCALE_STORAGE_KEY)},cookie=${JSON.stringify(LOCALE_COOKIE)},locales=${JSON.stringify(locales)},fallback=${JSON.stringify(defaultLocale)},stored=window.localStorage&&window.localStorage.getItem(key);if(locales.indexOf(stored)===-1)return;function readCookie(){var parts=document.cookie?document.cookie.split("; "):[];for(var i=0;i<parts.length;i++){var eq=parts[i].indexOf("=");if(eq>-1&&parts[i].slice(0,eq)===cookie)return decodeURIComponent(parts[i].slice(eq+1));}return null;}var currentCookie=readCookie();if(currentCookie!==stored){document.cookie=cookie+"="+stored+"; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax";currentCookie=readCookie();}var path=location.pathname||"/",search=location.search||"",hash=location.hash||"",normalized=path.length>1&&path.endsWith("/")?path.slice(0,-1):path,segments=normalized.split("/").filter(Boolean),pathLocale=locales.indexOf(segments[0])!==-1?segments[0]:null,isHome=normalized==="/"||!!pathLocale&&segments.length===1,targetPath=null;if(isHome){targetPath=stored===fallback?"/":"/"+stored;}if(targetPath&&targetPath!==path){location.replace(targetPath+search+hash);return;}var htmlLocale=document.documentElement&&document.documentElement.getAttribute("lang");if(htmlLocale&&htmlLocale!==stored&&currentCookie===stored){location.reload();}}catch(e){}})();`;
}
