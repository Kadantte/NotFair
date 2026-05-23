import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { db, schema } from "@/lib/db";
import { EMAIL_SEND_KIND } from "@/lib/db/schema";
import { stripeMode } from "@/lib/stripe/config";
import { planFromSubscriptionRow } from "@/lib/subscription";
import { sendTrialEndEmail } from "@/lib/email/trial-end";

/**
 * Daily Vercel Cron: notify customers whose 7-day trial has lapsed and who
 * remain on the Free plan.
 *
 * Idempotency:
 *   `subscriptions.trial_end_email_sent_at` is the latch — NULL until we
 *   successfully send via Resend, then pinned. We stamp it AFTER Resend
 *   confirms send, so a transient API failure doesn't permanently silence
 *   the user (next cron run retries).
 *
 * Audience filter:
 *   - env scoped to current Stripe mode (test in dev, live in prod)
 *   - trial_ends_at is non-null and in the past
 *   - trial_end_email_sent_at IS NULL
 *   - email_preferences.unsubscribed_marketing_at IS NULL (LEFT JOIN; absent
 *     row counts as "not unsubscribed")
 *   - plan resolves to "free" (excludes reactivated subs, Stripe-trialing
 *     users, past-due paying users — all of whom are still entitled)
 *
 * Daily send cap: 100 emails per invocation. Protects deliverability
 * reputation on the alert@updates.notfair.co sender and avoids burning the
 * entire backlog in a single send. Remaining candidates drain across
 * subsequent daily runs (oldest trial_ends_at first).
 */

const MAX_PER_RUN = 100;

interface CandidateRow {
  user_id: string;
  email: string | null;
  data: Stripe.Subscription | null;
  trial_ends_at: string;
  auth_email: string | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = stripeMode();

  try {
    const result = await db().execute(sql`
      SELECT
        s.user_id,
        s.email,
        s.data,
        s.trial_ends_at,
        u.email AS auth_email
      FROM subscriptions s
      LEFT JOIN email_preferences ep ON ep.user_id = s.user_id
      LEFT JOIN auth.users u ON u.id::text = s.user_id
      WHERE s.env = ${env}
        AND s.trial_ends_at IS NOT NULL
        AND s.trial_ends_at <= now()
        AND s.trial_end_email_sent_at IS NULL
        AND ep.unsubscribed_marketing_at IS NULL
      ORDER BY s.trial_ends_at ASC
      LIMIT ${MAX_PER_RUN}
    `);

    const rows = extractRows<CandidateRow>(result);

    let sent = 0;
    let skippedPaid = 0;
    let skippedNoEmail = 0;
    let errors = 0;
    const errorDetails: Array<{ userId: string; error: string }> = [];

    for (const row of rows) {
      // Re-check plan in JS: the table stores the raw Stripe payload, and the
      // resolver knows about all the entitled statuses (active / trialing /
      // past_due). Doing this in SQL would mean duplicating the entitlement
      // contract across two surfaces.
      const plan = planFromSubscriptionRow({ data: row.data });
      if (plan !== "free") {
        skippedPaid++;
        continue;
      }

      const recipient = row.auth_email ?? row.email;
      if (!recipient) {
        skippedNoEmail++;
        continue;
      }

      try {
        const resendId = await sendTrialEndEmail(recipient);
        const sentAt = new Date();
        // Tracking row first, then idempotency latch. The unique index on
        // resend_id makes a partial-failure replay (re-run after the UPDATE
        // below failed) a no-op INSERT thanks to onConflictDoNothing — and
        // since Resend just accepted the send, losing the latch and
        // re-mailing is worse than skipping the audit row.
        await db()
          .insert(schema.emailSends)
          .values({
            kind: EMAIL_SEND_KIND.TRIAL_END,
            userId: row.user_id,
            env,
            email: recipient,
            resendId,
            status: "sent",
            sentAt,
            updatedAt: sentAt,
          })
          .onConflictDoNothing({ target: schema.emailSends.resendId });
        // Stamp ONLY after Resend confirmed — a failed send re-runs next day.
        await db()
          .update(schema.subscriptions)
          .set({ trialEndEmailSentAt: sentAt })
          .where(
            and(
              eq(schema.subscriptions.userId, row.user_id),
              eq(schema.subscriptions.env, env),
            ),
          );
        sent++;
      } catch (err) {
        errors++;
        const message = err instanceof Error ? err.message : String(err);
        errorDetails.push({ userId: row.user_id, error: message });
        console.error(
          `[cron/trial-end-emails] send failed for user ${row.user_id}:`,
          err,
        );
      }
    }

    return NextResponse.json({
      success: true,
      env,
      candidates: rows.length,
      sent,
      skippedPaid,
      skippedNoEmail,
      errors,
      ...(errorDetails.length > 0 ? { errorDetails } : {}),
    });
  } catch (err) {
    console.error("[cron/trial-end-emails] fatal:", err);
    return NextResponse.json(
      { error: "Trial-end email cron failed" },
      { status: 500 },
    );
  }
}

// `db().execute(sql\`...\`)` returns shape that varies by driver/runtime
// (postgres-js exposes `.rows`, raw pg returns the array directly). Normalize
// here so the loop above can stay shape-agnostic.
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: T[] }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}
