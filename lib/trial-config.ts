/**
 * Length of the per-user free trial. Used by every site that creates a
 * subscription row (ensure-customer, checkout, sync) to set trial_ends_at.
 *
 * Standalone module so write-path code (sync.ts, ensure-customer.ts) doesn't
 * have to pull in the full subscription resolver and its db/cookies deps.
 */
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
