import { isInvalidGrantError } from "@/lib/auth-errors";

export const GOOGLE_ADS_RECONNECT_REQUIRED = "GOOGLE_ADS_RECONNECT_REQUIRED";
export const GOOGLE_ADS_RECONNECT_URL = "https://www.notfair.co/connect/google-ads";
export const NOTFAIR_QUOTA_EXHAUSTED = "NOTFAIR_QUOTA_EXHAUSTED";
export const NOTFAIR_UPGRADE_URL = "https://notfair.co/upgrade";

export type ReconnectRequiredError = {
  code: typeof GOOGLE_ADS_RECONNECT_REQUIRED;
  message: string;
  reconnectUrl: string;
  retryable: false;
  userAction: string;
  originalError?: string;
};

export type QuotaExhaustedError = {
  code: typeof NOTFAIR_QUOTA_EXHAUSTED;
  message: string;
  upgradeUrl: string;
  retryable: false;
  userAction: string;
  used?: number;
  limit?: number;
  resetsAt?: string;
  originalError?: string;
};

const RECONNECT_MESSAGE =
  "Google Ads access expired or was revoked. Tell the user to reconnect their Google Ads account in NotFair, then retry this request. Do not retry this tool call until reconnect is complete.";

const QUOTA_MESSAGE =
  "Free monthly cap reached. Tell the user they need to upgrade NotFair to Growth for more Google Ads operations, or wait until the quota reset date. Do not retry this tool call unless the user upgrades or the quota resets.";

export function isGoogleAdsReconnectRequired(raw: string): boolean {
  return isInvalidGrantError(raw);
}

function getNumberField(error: unknown, key: "used" | "limit"): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function getResetsAt(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as Record<string, unknown>).resetsAt;
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : undefined;
}

export function isNotFairQuotaExhausted(raw: string, error?: unknown): boolean {
  if (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "RateLimitError") {
    return getNumberField(error, "used") != null && getNumberField(error, "limit") != null && getResetsAt(error) != null;
  }
  return raw.includes("Free monthly cap reached");
}

export function buildGoogleAdsReconnectError(originalError?: string): ReconnectRequiredError {
  return {
    code: GOOGLE_ADS_RECONNECT_REQUIRED,
    message: RECONNECT_MESSAGE,
    reconnectUrl: GOOGLE_ADS_RECONNECT_URL,
    retryable: false,
    userAction: `Reconnect Google Ads account: ${GOOGLE_ADS_RECONNECT_URL}`,
    ...(originalError ? { originalError } : {}),
  };
}

export function buildNotFairQuotaExhaustedError(error: unknown, originalError?: string): QuotaExhaustedError {
  const used = getNumberField(error, "used");
  const limit = getNumberField(error, "limit");
  const resetsAt = getResetsAt(error);
  const usage = used != null && limit != null ? ` (${used}/${limit})` : "";
  const resetCopy = resetsAt ? ` Resets at ${resetsAt}.` : "";

  return {
    code: NOTFAIR_QUOTA_EXHAUSTED,
    message: `Free monthly cap reached${usage}. ${QUOTA_MESSAGE}${resetCopy}`,
    upgradeUrl: NOTFAIR_UPGRADE_URL,
    retryable: false,
    userAction: `Upgrade to Growth: ${NOTFAIR_UPGRADE_URL}`,
    ...(used != null ? { used } : {}),
    ...(limit != null ? { limit } : {}),
    ...(resetsAt ? { resetsAt } : {}),
    ...(originalError ? { originalError } : {}),
  };
}

export function formatMcpErrorText(message: string, error?: unknown): string {
  if (isNotFairQuotaExhausted(message, error)) {
    return JSON.stringify(
      {
        ok: false,
        error: buildNotFairQuotaExhaustedError(error, message),
      },
      null,
      2,
    );
  }

  if (!isGoogleAdsReconnectRequired(message)) return message;
  return JSON.stringify(
    {
      ok: false,
      error: buildGoogleAdsReconnectError(message),
    },
    null,
    2,
  );
}
