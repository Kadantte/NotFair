import { isInvalidGrantError } from "@/lib/auth-errors";

export const GOOGLE_ADS_RECONNECT_REQUIRED = "GOOGLE_ADS_RECONNECT_REQUIRED";
export const GOOGLE_ADS_RECONNECT_URL = "https://www.notfair.co/connect/google-ads";

export type ReconnectRequiredError = {
  code: typeof GOOGLE_ADS_RECONNECT_REQUIRED;
  message: string;
  reconnectUrl: string;
  retryable: false;
  userAction: string;
  originalError?: string;
};

const RECONNECT_MESSAGE =
  "Google Ads access expired or was revoked. Tell the user to reconnect their Google Ads account in NotFair, then retry this request. Do not retry this tool call until reconnect is complete.";

export function isGoogleAdsReconnectRequired(raw: string): boolean {
  return isInvalidGrantError(raw);
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

export function formatMcpErrorText(message: string): string {
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
