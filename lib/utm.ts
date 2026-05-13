export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Partial<Record<UtmKey, string>>;
export const UTM_STORAGE_PREFIX = "__utm_";

export const CLICK_ID_KEYS = ["gclid", "fbclid", "rdt_cid", "twclid"] as const;
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

export const ATTRIBUTION_COOKIE_NAME = "nf_first_touch";
export const PAID_TOUCH_COOKIE_NAME = "nf_latest_paid_touch";
export const ATTRIBUTION_VERSION = 1;

export const ATTRIBUTION_PARAM_KEYS = [...UTM_KEYS, ...CLICK_ID_KEYS] as const;
export type AttributionParamKey = (typeof ATTRIBUTION_PARAM_KEYS)[number];

export type FirstTouchAttribution = Partial<Record<AttributionParamKey, string>> & {
  version: number;
  first_landing_url?: string;
  first_landing_path?: string;
  signup_referrer?: string;
  signup_referrer_domain?: string;
  attribution_captured_at?: string;
};

export type PaidTouchAttribution = FirstTouchAttribution;

const PAID_MEDIUMS = new Set([
  "paid",
  "paid_social",
  "paid_search",
  "cpc",
  "ppc",
  "display",
  "retargeting",
]);

const PAID_SOCIAL_SOURCES = new Set([
  "x",
  "twitter",
  "twitter_ads",
]);

const INTERNAL_REFERRER_HOSTS = new Set([
  "accounts.google.com",
  "checkout.stripe.com",
  "billing.stripe.com",
]);

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 512);
}

export function referrerDomain(referrer: string | null | undefined): string | undefined {
  const cleaned = cleanString(referrer);
  if (!cleaned) return undefined;
  try {
    return new URL(cleaned).hostname.replace(/^www\./, "");
  } catch {
    return cleaned.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || undefined;
  }
}

export function isInternalAttributionReferrer(
  referrer: string | null | undefined,
  currentHost?: string | null,
): boolean {
  const domain = referrerDomain(referrer);
  if (!domain) return false;
  const normalizedCurrent = currentHost?.replace(/^www\./, "");
  return INTERNAL_REFERRER_HOSTS.has(domain) || (!!normalizedCurrent && domain === normalizedCurrent);
}

export function parseAttributionCookie(cookieHeader: string | null | undefined): FirstTouchAttribution | null {
  return parseAttributionCookieByName(cookieHeader, ATTRIBUTION_COOKIE_NAME, sanitizeAttribution);
}

export function parsePaidTouchCookie(cookieHeader: string | null | undefined): PaidTouchAttribution | null {
  return parseAttributionCookieByName(cookieHeader, PAID_TOUCH_COOKIE_NAME, sanitizePaidTouch);
}

function parseAttributionCookieByName<T>(
  cookieHeader: string | null | undefined,
  cookieName: string,
  sanitizer: (raw: Record<string, unknown>) => T | null,
): T | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (!match) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(cookieName.length + 1)));
    if (!parsed || typeof parsed !== "object") return null;
    return sanitizer(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function sanitizeAttribution(raw: Record<string, unknown>): FirstTouchAttribution | null {
  const attribution: FirstTouchAttribution = { version: ATTRIBUTION_VERSION };

  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const value = cleanString(raw[key]);
    if (value) attribution[key] = value;
  }

  const firstLandingUrl = cleanString(raw.first_landing_url);
  const firstLandingPath = cleanString(raw.first_landing_path);
  const signupReferrer = cleanString(raw.signup_referrer);
  const capturedAt = cleanString(raw.attribution_captured_at);

  if (firstLandingUrl) attribution.first_landing_url = firstLandingUrl;
  if (firstLandingPath) attribution.first_landing_path = firstLandingPath;
  if (signupReferrer) {
    attribution.signup_referrer = signupReferrer;
    const domain = referrerDomain(signupReferrer);
    if (domain) attribution.signup_referrer_domain = domain;
  }
  if (capturedAt) attribution.attribution_captured_at = capturedAt;

  return Object.keys(attribution).length > 1 ? attribution : null;
}

export function hasPaidTouchSignal(
  attribution: Partial<Record<AttributionParamKey, string>> | null | undefined,
): boolean {
  if (!attribution) return false;
  if (CLICK_ID_KEYS.some((key) => !!attribution[key])) return true;
  const medium = attribution.utm_medium?.toLowerCase();
  if (medium && PAID_MEDIUMS.has(medium)) return true;
  const source = attribution.utm_source?.toLowerCase();
  return !!source && PAID_SOCIAL_SOURCES.has(source);
}

export function sanitizePaidTouch(raw: Record<string, unknown>): PaidTouchAttribution | null {
  const attribution = sanitizeAttribution(raw);
  if (!hasPaidTouchSignal(attribution)) return null;
  return attribution;
}

function paidSourceFallback(attribution: PaidTouchAttribution): string | undefined {
  if (attribution.utm_source) return attribution.utm_source;
  if (attribution.twclid) return "x";
  if (attribution.gclid) return "google";
  if (attribution.fbclid) return "facebook";
  if (attribution.rdt_cid) return "reddit";
  return undefined;
}

export function attributionToUserMetadata(
  attribution: FirstTouchAttribution | null | undefined,
): Record<string, string | number> {
  if (!attribution) return {};
  const metadata: Record<string, string | number> = {
    attribution_version: attribution.version,
  };

  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const value = attribution[key];
    if (value) metadata[key] = value;
  }

  for (const key of [
    "first_landing_url",
    "first_landing_path",
    "signup_referrer",
    "signup_referrer_domain",
    "attribution_captured_at",
  ] as const) {
    const value = attribution[key];
    if (value) metadata[key] = value;
  }

  return metadata;
}

export function paidTouchToUserMetadata(
  attribution: PaidTouchAttribution | null | undefined,
): Record<string, string | number> {
  if (!attribution) return {};
  const metadata: Record<string, string | number> = {
    paid_attribution_version: attribution.version,
  };

  const source = paidSourceFallback(attribution);
  if (source) metadata.paid_source = source;
  if (attribution.utm_medium) metadata.paid_medium = attribution.utm_medium;
  if (attribution.utm_campaign) metadata.paid_campaign = attribution.utm_campaign;
  if (attribution.utm_term) metadata.paid_term = attribution.utm_term;
  if (attribution.utm_content) metadata.paid_content = attribution.utm_content;
  if (attribution.gclid) metadata.paid_gclid = attribution.gclid;
  if (attribution.fbclid) metadata.paid_fbclid = attribution.fbclid;
  if (attribution.rdt_cid) metadata.paid_rdt_cid = attribution.rdt_cid;
  if (attribution.twclid) metadata.paid_twclid = attribution.twclid;
  if (attribution.first_landing_url) metadata.paid_landing_url = attribution.first_landing_url;
  if (attribution.first_landing_path) metadata.paid_landing_path = attribution.first_landing_path;
  if (attribution.attribution_captured_at) metadata.paid_captured_at = attribution.attribution_captured_at;

  return metadata;
}
