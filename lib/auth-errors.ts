/**
 * Shared auth error constants used across both OAuth callback routes
 * and the client-side login/connect error pages.
 */

export const AUTH_ERROR_REASON = {
  CONSENT_DENIED: "consent_denied",
  SCOPE_DENIED: "scope_denied",
  SCOPE_DENIED_RETRY: "scope_denied_retry",
  MISSING_CODE: "missing_code",
  MISSING_STATE: "missing_state",
  MISSING_COOKIE: "missing_cookie",
  NONCE_MISMATCH: "nonce_mismatch",
  TOKEN_EXCHANGE: "token_exchange",
  SUPABASE_AUTH: "supabase_auth",
  LOAD_ACCOUNTS_FAILED: "load_accounts_failed",
  SERVER_CONFIG: "server_config",
} as const;

export const AUTH_ERROR_STEP = {
  GOOGLE_CONSENT: "google_consent",
  STATE_VERIFICATION: "state_verification",
  CODE_CHECK: "code_check",
  TOKEN_EXCHANGE: "token_exchange",
  SCOPE_CHECK: "scope_check",
  SUPABASE_SIGNIN: "supabase_signin",
  LIST_ACCOUNTS: "list_accounts",
} as const;

export const AUTH_ERROR_MESSAGES = {
  CONSENT_DENIED:
    "You need to approve access to continue. Please try again and click \"Allow\" on the Google consent screen.",
  SCOPE_DENIED:
    "NotFair needs Google Ads access to work — without it, we can't read your campaigns or make changes for you. When you continue, please keep the \"Google Ads\" permission checked on Google's consent screen.",
  SCOPE_INSUFFICIENT:
    "NotFair needs Google Ads access to work. Please try again and make sure every permission on Google's consent screen stays checked.",
  LOAD_ACCOUNTS_GENERIC:
    "Failed to load Google Ads accounts. Please try again.",
  NO_ACCOUNTS:
    "This Google account doesn't have a Google Ads account. Sign in with a Google account that has access to at least one Google Ads account, or create one at ads.google.com first.",
  NO_CLIENT_ACCOUNTS:
    "No client accounts found under your manager account. Make sure you have at least one active Google Ads client account.",
} as const;

// Error-string signals from google-ads-api's ListAccessibleCustomers RPC
// that mean "this Google identity has no Ads customer" rather than a
// scope/transient issue. Kept as a plain list so new surface wordings
// can be appended without restructuring.
//
// "not associated with any ads accounts" is the literal phrase Google returns
// in errors[0].message for a brand-new Google identity that has never created
// or been added to a Google Ads account — caught in production 2026-05-01.
const NO_ADS_ACCOUNT_SIGNALS = [
  "not_ads_user",
  "user_permission_denied",
  "the caller does not have permission",
  "customer not found",
  "no customers accessible",
  "not associated with any ads accounts",
];

export function isNoAdsAccountError(raw: string): boolean {
  const s = raw.toLowerCase();
  return NO_ADS_ACCOUNT_SIGNALS.some((signal) => s.includes(signal));
}

// Separate from PERMISSION_DENIED, which usually just means "no Ads account".
export function isScopeError(raw: string): boolean {
  return raw.toLowerCase().includes("insufficient authentication scopes");
}

export function isInvalidGrantError(raw: string): boolean {
  const s = raw.toLowerCase();
  return s.includes("invalid_grant") || s.includes("token has been expired or revoked");
}

export function classifyAccountLoadError(raw: string): string {
  if (isInvalidGrantError(raw)) return "Google access expired or was revoked. Please reconnect your Google Ads account.";
  if (isScopeError(raw)) return AUTH_ERROR_MESSAGES.SCOPE_INSUFFICIENT;
  if (isNoAdsAccountError(raw)) return AUTH_ERROR_MESSAGES.NO_ACCOUNTS;
  return AUTH_ERROR_MESSAGES.LOAD_ACCOUNTS_GENERIC;
}

export function classifyGoogleError(error: string): string {
  return error === "access_denied"
    ? AUTH_ERROR_REASON.CONSENT_DENIED
    : `google_${error}`;
}
