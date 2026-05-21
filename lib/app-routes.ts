export const AUTO_MODE_PARAM = "auto";
export const AUTO_MODE_VALUE = "1";
export const AUTO_MODE_QUERY = `?${AUTO_MODE_PARAM}=${AUTO_MODE_VALUE}`;
export const DEFAULT_ACTIVATION_PATH = `/chat${AUTO_MODE_QUERY}`;
export const GOOGLE_ADS_CONNECTED_PATH = "/connect/google-ads?connected=1";

export function isAutoModeValue(value: string | null | undefined) {
  return value === AUTO_MODE_VALUE;
}

export function isAutoModeSearchParams(searchParams: { get(name: string): string | null }) {
  return isAutoModeValue(searchParams.get(AUTO_MODE_PARAM));
}

export function safeInternalPathOrDefault(
  path: string | null | undefined,
  fallback = DEFAULT_ACTIVATION_PATH,
) {
  return path && path.startsWith("/") ? path : fallback;
}
