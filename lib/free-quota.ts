/**
 * Free-plan quota constants + period math.
 *
 * Once a user's 7-day trial ends, they fall onto a recurring 30-day "free
 * month" anchored to their `trial_ends_at`:
 *   period N = [trial_ends_at + N*30d, trial_ends_at + (N+1)*30d)
 *
 * Anchoring to trial_ends_at (rather than calendar months) gives every user
 * the same window length and a predictable reset cadence — matches the
 * "operation should start counting as soon as their trial ends" intent.
 *
 * Paid plans are NOT subject to this cap; trial users are NOT subject to
 * this cap. Only post-trial free users.
 */

/** Hard cap applied to free-plan users once their trial has ended. */
export const FREE_MONTHLY_OP_LIMIT = 300;

/** Length of one "free month" (the cap renews after this many days). */
export const FREE_PERIOD_DAYS = 30;

const FREE_PERIOD_MS = FREE_PERIOD_DAYS * 86_400_000;

/**
 * Start of the user's *current* free-quota period.
 *
 *   - now <= anchor → returns anchor (period 0 hasn't begun; counting starts
 *     the moment trial ends, not before).
 *   - now > anchor → returns anchor + N*30d, where N = floor((now-anchor)/30d).
 */
export function currentFreePeriodStart(anchor: Date, now: Date): Date {
  const elapsed = now.getTime() - anchor.getTime();
  if (elapsed <= 0) return new Date(anchor.getTime());
  const periodIndex = Math.floor(elapsed / FREE_PERIOD_MS);
  return new Date(anchor.getTime() + periodIndex * FREE_PERIOD_MS);
}

/** Start of the *next* free-quota period (= when the cap resets). */
export function nextFreePeriodStart(anchor: Date, now: Date): Date {
  const start = currentFreePeriodStart(anchor, now);
  return new Date(start.getTime() + FREE_PERIOD_MS);
}
