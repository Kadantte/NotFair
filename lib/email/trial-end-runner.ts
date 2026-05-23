import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { db, schema } from "@/lib/db";
import { EMAIL_SEND_KIND } from "@/lib/db/schema";
import { stripeMode } from "@/lib/stripe/config";
import { planFromSubscriptionRow } from "@/lib/subscription";
import { sendTrialEndEmail } from "@/lib/email/trial-end";
import { MAX_PER_RUN_TRIAL_END } from "@/lib/email/trial-end-config";

/**
 * Trial-end email pipeline — single source of truth for both:
 *   - /api/cron/trial-end-emails (daily Vercel cron, CRON_SECRET auth)
 *   - /api/dev/email/trial-end/run (dev "Send now", requireDevEmail auth)
 *   - /dev/email/trial-end-alert (dashboard preview of who's queued)
 *
 * The audience filter, ordering (recency-priority DESC), and plan-skip
 * logic live in `loadTrialEndCandidates` so the dashboard's preview is
 * provably the same set the sender will iterate. The send-and-stamp loop
 * is in `runTrialEndSend`.
 *
 * Idempotency latch: `subscriptions.trial_end_email_sent_at` is stamped
 * after Resend confirms send. The dev "Send now" and the daily cron both
 * stamp through this latch so they can't double-send the same user.
 */

/**
 * Candidate eligible to be emailed right now: trial lapsed, no entitled
 * Stripe sub, not opted out of marketing, has a real email address. Both
 * the cron loop and the dashboard preview consume this shape directly.
 */
export interface TrialEndCandidate {
  userId: string;
  /** Recipient address (auth.users.email preferred, falls back to subscriptions.email). */
  email: string;
  /** First name for personalized greeting. Pulled from Supabase Auth's
   *  `raw_user_meta_data` (Google OAuth populates `given_name` /
   *  `full_name`). Null when neither field is set; callers fall back to a
   *  generic greeting. */
  firstName: string | null;
  /** UTC instant the user's 7-day trial expired. Priority key (DESC). */
  trialEndsAt: Date;
}

interface RawCandidateRow {
  user_id: string;
  email: string | null;
  data: Stripe.Subscription | null;
  trial_ends_at: string;
  auth_email: string | null;
  given_name: string | null;
  full_name: string | null;
}

/**
 * Derive a friendly first name from Supabase Auth metadata. Prefers the
 * explicit `given_name` field (Google's first-name claim), falls back to
 * the first token of `full_name`, returns null when neither is usable.
 * Trims whitespace; rejects empty strings.
 */
function deriveFirstName(givenName: string | null, fullName: string | null): string | null {
  const given = typeof givenName === "string" ? givenName.trim() : "";
  if (given) return given;
  const full = typeof fullName === "string" ? fullName.trim() : "";
  if (!full) return null;
  const firstToken = full.split(/\s+/)[0];
  return firstToken && firstToken.length > 0 ? firstToken : null;
}

/**
 * Returns audience-filtered, plan-checked, recency-priority-ordered
 * candidates. The `userId` option scopes the SQL to a single user — used
 * by per-row "Send" buttons to re-verify eligibility immediately before
 * sending (the dashboard list could be seconds stale; we don't want to
 * email someone who just paid).
 */
export async function loadTrialEndCandidates(opts: {
  env: "test" | "live";
  limit: number;
  userId?: string;
}): Promise<TrialEndCandidate[]> {
  const { env, limit, userId } = opts;

  const result = await db().execute(sql`
    SELECT
      s.user_id,
      s.email,
      s.data,
      s.trial_ends_at,
      u.email AS auth_email,
      u.raw_user_meta_data->>'given_name' AS given_name,
      coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') AS full_name
    FROM subscriptions s
    LEFT JOIN email_preferences ep ON ep.user_id = s.user_id
    LEFT JOIN auth.users u ON u.id::text = s.user_id
    WHERE s.env = ${env}
      AND s.trial_ends_at IS NOT NULL
      AND s.trial_ends_at <= now()
      AND s.trial_end_email_sent_at IS NULL
      AND ep.unsubscribed_marketing_at IS NULL
      ${userId ? sql`AND s.user_id = ${userId}` : sql``}
    ORDER BY s.trial_ends_at DESC
    LIMIT ${limit}
  `);

  const rows = extractRows<RawCandidateRow>(result);
  const candidates: TrialEndCandidate[] = [];
  for (const row of rows) {
    // Plan check stays in JS — the table holds the raw Stripe payload and
    // the resolver knows the full entitled-status set (active / trialing
    // / past_due). Doing this in SQL would duplicate that contract.
    const plan = planFromSubscriptionRow({ data: row.data });
    if (plan !== "free") continue;
    const recipient = row.auth_email ?? row.email;
    if (!recipient) continue;
    candidates.push({
      userId: row.user_id,
      email: recipient,
      firstName: deriveFirstName(row.given_name, row.full_name),
      trialEndsAt: new Date(row.trial_ends_at),
    });
  }
  return candidates;
}

/**
 * Resend send + email_sends insert + subscriptions.trial_end_email_sent_at
 * stamp for one candidate. Extracted so the bulk runner and the per-row
 * "Send" endpoint can't drift on ordering.
 */
async function sendAndStampCandidate(env: "test" | "live", cand: TrialEndCandidate): Promise<{ resendId: string }> {
  const resendId = await sendTrialEndEmail({ to: cand.email, firstName: cand.firstName });
  const sentAt = new Date();
  // Tracking row first, then idempotency latch. The unique index on
  // resend_id makes a partial-failure replay a no-op INSERT via
  // onConflictDoNothing — losing the latch and re-mailing is worse
  // than skipping the audit row.
  await db()
    .insert(schema.emailSends)
    .values({
      kind: EMAIL_SEND_KIND.TRIAL_END,
      userId: cand.userId,
      env,
      email: cand.email,
      resendId,
      status: "sent",
      sentAt,
      updatedAt: sentAt,
    })
    .onConflictDoNothing({ target: schema.emailSends.resendId });
  // Stamp ONLY after Resend confirmed — a failed send re-runs next time.
  await db()
    .update(schema.subscriptions)
    .set({ trialEndEmailSentAt: sentAt })
    .where(
      and(
        eq(schema.subscriptions.userId, cand.userId),
        eq(schema.subscriptions.env, env),
      ),
    );
  return { resendId };
}

export interface TrialEndRunSummary {
  env: "test" | "live";
  candidates: number;
  sent: number;
  errors: number;
  errorDetails: Array<{ userId: string; error: string }>;
}

export async function runTrialEndSend(): Promise<TrialEndRunSummary> {
  const env = stripeMode();
  const candidates = await loadTrialEndCandidates({
    env,
    limit: MAX_PER_RUN_TRIAL_END,
  });

  let sent = 0;
  let errors = 0;
  const errorDetails: Array<{ userId: string; error: string }> = [];

  for (const cand of candidates) {
    try {
      await sendAndStampCandidate(env, cand);
      sent++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      errorDetails.push({ userId: cand.userId, error: message });
      console.error(
        `[trial-end-runner] send failed for user ${cand.userId}:`,
        err,
      );
    }
  }

  return {
    env,
    candidates: candidates.length,
    sent,
    errors,
    errorDetails,
  };
}

export type SingleSendResult =
  | { sent: true; email: string; resendId: string }
  | { sent: false; reason: "not_eligible"; userId: string }
  | { sent: false; reason: "send_failed"; userId: string; email: string; error: string };

/**
 * Manual single-user send. Used by the per-row "Send" button on the
 * /dev/email/trial-end-alert dashboard. Re-verifies eligibility against
 * the same shared filter (so a dashboard row that's gone stale — user
 * just paid, just opted out, just got emailed by a concurrent run — is
 * skipped silently rather than emailed twice).
 */
export async function runTrialEndSendForUser(opts: {
  userId: string;
  env?: "test" | "live";
}): Promise<SingleSendResult> {
  const env = opts.env ?? stripeMode();
  const [cand] = await loadTrialEndCandidates({ env, limit: 1, userId: opts.userId });
  if (!cand) {
    return { sent: false, reason: "not_eligible", userId: opts.userId };
  }
  try {
    const { resendId } = await sendAndStampCandidate(env, cand);
    return { sent: true, email: cand.email, resendId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[trial-end-runner] single send failed for user ${cand.userId}:`, err);
    return { sent: false, reason: "send_failed", userId: cand.userId, email: cand.email, error: message };
  }
}

// `db().execute(sql\`...\`)` shape varies by driver/runtime: postgres-js
// exposes `.rows`; raw pg returns the array directly. Normalize here.
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: T[] }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}
