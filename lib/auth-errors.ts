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
    "Google Ads permission was not granted. AdsAgent needs access to your Google Ads account to work. Please try again and make sure the \"Google Ads\" checkbox stays checked on the consent screen.",
  SCOPE_INSUFFICIENT:
    "Google Ads access was not granted. Please try again and make sure to approve all permissions on the Google consent screen.",
  LOAD_ACCOUNTS_GENERIC:
    "Failed to load Google Ads accounts. Please try again.",
  NO_ACCOUNTS:
    "No Google Ads accounts found. Connect a Google account that has access to at least one Google Ads account.",
  NO_CLIENT_ACCOUNTS:
    "No client accounts found under your manager account. Make sure you have at least one active Google Ads client account.",
} as const;

/** Classify a Google OAuth error param into an internal reason string. */
export function classifyGoogleError(error: string): string {
  return error === "access_denied"
    ? AUTH_ERROR_REASON.CONSENT_DENIED
    : `google_${error}`;
}
