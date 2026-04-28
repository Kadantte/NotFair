/**
 * Pure decision logic for "did Google grant the Ads scope, and what do we do
 * about it." Extracted from `app/auth/callback/route.ts` so the auto-retry-
 * once behavior can be unit-tested without standing up Next, Supabase, or
 * Google's token endpoint.
 *
 * Per RFC 6749 §5.1, the `scope` field on the token response MAY be omitted
 * when the granted scope matches the request — we treat omission as "granted"
 * to match Google's actual behavior for some account configurations.
 */

export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

export type ScopeGrantOutcome =
  | { outcome: "granted" }
  | { outcome: "retry"; retryUrl: string }
  | { outcome: "fail" };

export function evaluateScopeGrant(args: {
  /** Raw `scope` field from Google's token response (may be undefined). */
  grantedScopesParam: string | undefined;
  /** Did this callback originate from an already-retried OAuth round-trip? */
  hasScopeRetry: boolean;
  /** App origin (e.g. https://www.notfair.co), no trailing slash. */
  origin: string;
  /** Where to land after a successful retry (must start with "/"). */
  next: string;
  /** Whether the OAuth flow was started from a popup window. */
  popup: boolean;
}): ScopeGrantOutcome {
  // RFC 6749 §5.1: omitted `scope` means "matches request" — treat as granted.
  if (typeof args.grantedScopesParam !== "string") {
    return { outcome: "granted" };
  }

  const grantedScopes = args.grantedScopesParam.split(" ");
  if (grantedScopes.includes(ADWORDS_SCOPE)) {
    return { outcome: "granted" };
  }

  if (!args.hasScopeRetry) {
    // First denial — bounce back to Google with `scope_retry=1` so we don't
    // loop forever if the user unchecks again.
    const params = new URLSearchParams({ next: args.next, scope_retry: "1" });
    if (args.popup) params.set("popup", "1");
    return {
      outcome: "retry",
      retryUrl: `${args.origin}/api/auth/signin?${params.toString()}`,
    };
  }

  // Second denial — user deliberately unchecked it. Fail to the banner.
  return { outcome: "fail" };
}
