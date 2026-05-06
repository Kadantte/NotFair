import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { cookies } from "next/headers";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

function mergeMessages(base: Messages, override: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      merged[key] = mergeMessages(baseValue as Messages, value as Messages);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : hasLocale(routing.locales, cookieLocale)
      ? cookieLocale
    : routing.defaultLocale;
  const defaultMessages = (await import("../messages/en.json")).default as Messages;
  const localeMessages = locale === routing.defaultLocale
    ? defaultMessages
    : ((await import(`../messages/${locale}.json`)).default as Messages);

  return {
    locale,
    messages: locale === routing.defaultLocale
      ? defaultMessages
      : mergeMessages(defaultMessages, localeMessages),
  };
});
