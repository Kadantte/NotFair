import "server-only";
import crypto from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { OP_TYPE } from "@/lib/db/tracking";
import { getUserEmail } from "@/lib/auth/get-user-email";
import { uploadClickConversions } from "@/lib/google-ads/campaign-ops";
import {
  getFirstWriteConversionActionId,
  getNotFairSystemAuth,
} from "@/lib/google-ads/system-auth";

// Process-local cache of users already evaluated. The DB remains the source
// of truth; this just collapses repeated lookups inside bulk-write ops that
// call logChange N times in a row.
const firstWriteChecked = new Set<string>();

export function _resetGoogleAdsFirstWriteCacheForTests(): void {
  firstWriteChecked.clear();
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Fire the Google Ads "First write request" offline click conversion on a
 * user's first-ever successful write. First-write — not signup — is NotFair's
 * activation north star; signups without writes are noise that misleads bid
 * optimization.
 *
 * Attribution paths:
 *   - GCLID stored at signup (paid-click users) → standard click attribution.
 *   - Hashed email only (organic / non-Google-click users) → Enhanced
 *     Conversions for Leads match within the lookback window (90d).
 *   - Neither GCLID nor email → no signal; skip (the upload would 400).
 *
 * Idempotent via Google's `order_id` dedup key (`first-write-${userId}`).
 *
 * Configured via env:
 *   - NOTFAIR_OWN_GADS_CUSTOMER_ID, NOTFAIR_OWN_GADS_REFRESH_TOKEN,
 *     NOTFAIR_OWN_GADS_LOGIN_CUSTOMER_ID (optional)
 *   - NOTFAIR_FIRST_WRITE_CONVERSION_ACTION_ID (optional, default 7556563874)
 *
 * When credentials aren't configured (dev, preview, CI) we no-op silently.
 */
export async function maybeFireGoogleAdsFirstWrite(params: {
  userId: string;
  justInsertedId: number;
}): Promise<void> {
  const { userId, justInsertedId } = params;

  if (firstWriteChecked.has(userId)) return;

  const auth = getNotFairSystemAuth();
  if (!auth) {
    firstWriteChecked.add(userId);
    return;
  }

  try {
    const [priorWrite, attributionRow, email] = await Promise.all([
      db()
        .select({ id: schema.operations.id })
        .from(schema.operations)
        .where(
          and(
            eq(schema.operations.userId, userId),
            eq(schema.operations.opType, OP_TYPE.WRITE),
            eq(schema.operations.success, 1),
            lt(schema.operations.id, justInsertedId),
          ),
        )
        .limit(1),
      db()
        .select({ gclid: schema.userAttribution.gclid })
        .from(schema.userAttribution)
        .where(eq(schema.userAttribution.userId, userId))
        .limit(1),
      getUserEmail(userId),
    ]);

    firstWriteChecked.add(userId);

    if (priorWrite.length > 0) return;

    const gclid = attributionRow[0]?.gclid?.trim() || undefined;
    const hashedEmail = email
      ? sha256Hex(email.trim().toLowerCase())
      : undefined;

    if (!gclid && !hashedEmail) {
      // Nothing to attribute on — neither a paid-click nor an identifiable
      // user. The upload would be rejected by Google. Stay silent.
      return;
    }

    const result = await uploadClickConversions(
      auth,
      getFirstWriteConversionActionId(),
      [
        {
          gclid,
          hashedEmail,
          conversionDateTime: new Date().toISOString(),
          conversionValue: 1.0,
          currencyCode: "USD",
          orderId: `first-write-${userId}`,
        },
      ],
    );

    if (!result.success) {
      console.error(
        "[gads-first-write] Upload failed:",
        result.error ?? result.partialErrors,
      );
    }
  } catch (err) {
    console.error("[gads-first-write] Failed to fire activation event:", err);
  }
}
