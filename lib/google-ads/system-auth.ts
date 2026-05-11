import "server-only";
import { getEnv } from "@/lib/env";
import type { AuthContext } from "./types";

/**
 * NotFair's own Google Ads customer ID. Stable platform constant — this is
 * NotFair's ad account, not a per-user value. Overridable via env for staging
 * or account migration, but the default is the production account.
 *
 * Distinct from `KEYWORD_API_CUSTOMER_ID`, which points at PawsVIP for
 * Keyword Planner reasons. Tong's OAuth refresh token has access to both
 * accounts, so we reuse the token but not the customer ID.
 */
const NOTFAIR_GADS_CUSTOMER_ID_DEFAULT = "3251706605";

/**
 * Build an AuthContext for NotFair's own Google Ads account.
 * Used by server-side conversion uploaders that fire activation events
 * against NotFair's own ad account — not the user's connected account.
 *
 * Returns `null` when the refresh token isn't configured so callers can
 * no-op gracefully in dev/test/preview environments.
 */
export function getNotFairSystemAuth(): AuthContext | null {
  const refreshToken = getEnv("KEYWORD_API_REFRESH_TOKEN");
  if (!refreshToken) return null;

  return {
    customerId:
      getEnv("NOTFAIR_OWN_GADS_CUSTOMER_ID") ?? NOTFAIR_GADS_CUSTOMER_ID_DEFAULT,
    refreshToken,
    loginCustomerId: getEnv("NOTFAIR_OWN_GADS_LOGIN_CUSTOMER_ID") ?? null,
    userId: null,
  };
}

/**
 * The Google Ads conversion action id for NotFair's "First write request"
 * lead conversion. Defaults to the action that exists in account 3251706605
 * today; can be overridden per-environment via env.
 */
export function getFirstWriteConversionActionId(): string {
  return getEnv("NOTFAIR_FIRST_WRITE_CONVERSION_ACTION_ID") ?? "7556563874";
}
