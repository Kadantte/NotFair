import "server-only";
import crypto from "node:crypto";
import { uploadClickConversions } from "@/lib/google-ads/campaign-ops";
import {
  getNotFairSystemAuth,
  getSignupConversionActionId,
} from "@/lib/google-ads/system-auth";

// Process-local cache of users we've already uploaded. The DB / Google's
// orderId dedup remain the sources of truth; this just avoids burning a
// network round-trip per process when the same userId reappears (rare for
// signup but cheap insurance).
const signupChecked = new Set<string>();

export function _resetGoogleAdsSignupCacheForTests(): void {
  signupChecked.clear();
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Fire the Google Ads "Signup (server)" offline click conversion when a
 * user signs up. Server-side fallback for the browser pixel that lives in
 * `components/gads-conversion-tracker.tsx`. The browser pixel is fast but
 * lossy (ITP, ad blockers, 60s TTL, hydration timing); this server-side
 * upload catches the ~10–30% of signups the pixel misses, so Smart Bidding
 * trains on the complete signal.
 *
 * Attribution paths:
 *   - GCLID stored at signup (paid-click users) → standard click attribution.
 *   - Hashed email only (organic / non-Google-click users) → Enhanced
 *     Conversions for Leads match within the click-through lookback window.
 *   - Neither GCLID nor email → no signal; skip (the upload would 400).
 *
 * Idempotent via Google's `order_id` dedup key (`signup-${userId}`).
 *
 * Configured via env:
 *   - KEYWORD_API_REFRESH_TOKEN (reused — same OAuth token, NotFair-scoped)
 *   - NOTFAIR_OWN_GADS_CUSTOMER_ID (optional override, default 3251706605)
 *   - NOTFAIR_OWN_GADS_LOGIN_CUSTOMER_ID (optional MCC routing)
 *   - NOTFAIR_SIGNUP_CONVERSION_ACTION_ID (optional, default 7607072543)
 *
 * When credentials aren't configured (dev, preview, CI) we no-op silently.
 */
export async function maybeFireGoogleAdsSignup(params: {
  userId: string;
  email: string | null;
  gclid: string | null;
}): Promise<void> {
  const { userId, email, gclid } = params;

  if (signupChecked.has(userId)) return;

  const auth = getNotFairSystemAuth();
  if (!auth) return;

  const trimmedGclid = gclid?.trim() || undefined;
  const hashedEmail = email ? sha256Hex(email.trim().toLowerCase()) : undefined;

  if (!trimmedGclid && !hashedEmail) {
    // Neither a paid-click nor an identifiable user. Google would reject the
    // upload. Stay silent — this happens for direct-traffic organic signups
    // when we have no email on file yet (shouldn't be possible post-OAuth,
    // but defend against the edge case).
    return;
  }

  // Mark cached only once we know we'll attempt an actual upload — keeps
  // missing-env / no-signal paths retryable if state changes later (mirrors
  // the post-evaluate add in lib/reddit-first-write.ts).
  signupChecked.add(userId);

  try {
    const result = await uploadClickConversions(auth, getSignupConversionActionId(), [
      {
        gclid: trimmedGclid,
        hashedEmail,
        conversionDateTime: new Date().toISOString(),
        conversionValue: 1.0,
        currencyCode: "USD",
        orderId: `signup-${userId}`,
      },
    ]);

    if (!result.success) {
      console.error(
        "[gads-signup] Upload failed:",
        result.error ?? result.partialErrors,
      );
    }
  } catch (err) {
    console.error("[gads-signup] Failed to fire signup event:", err);
  }
}
