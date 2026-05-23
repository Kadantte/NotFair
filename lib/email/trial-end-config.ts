/**
 * Trial-end email cron knobs shared by:
 *   - /api/cron/trial-end-emails (the actual sender)
 *   - /dev/email/trial-end-alert (the dashboard that previews what the next
 *     cron run will do)
 *
 * Keep this file dep-free so it imports cleanly into edge/cron/server
 * contexts.
 */

/** Max successful sends queued per cron invocation. */
export const MAX_PER_RUN_TRIAL_END = 100;

/**
 * Mirror of the cron entry in vercel.json (`"schedule": "0 16 * * *"`).
 * If you change the schedule, update this constant too — the dashboard's
 * "next run" preview reads from here, not vercel.json.
 */
export const CRON_HOUR_UTC = 16;
export const CRON_MINUTE_UTC = 0;

/**
 * Next UTC instant the trial-end cron will fire, computed from CRON_HOUR_UTC
 * and CRON_MINUTE_UTC. Returns today's slot if it hasn't fired yet, else
 * tomorrow's slot.
 */
export function nextTrialEndCronTriggerUtc(now: Date = new Date()): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      CRON_HOUR_UTC,
      CRON_MINUTE_UTC,
      0,
      0,
    ),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
