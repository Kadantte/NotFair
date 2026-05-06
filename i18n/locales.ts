export const locales = ["en", "fr", "de", "th", "pt-BR", "es"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  th: "ไทย",
  "pt-BR": "Português",
  es: "Español",
};

export function isLocale(value: string | undefined | null): value is AppLocale {
  return locales.includes(value as AppLocale);
}

export function localeFromPathname(pathname: string): AppLocale | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return isLocale(first) ? first : null;
}
