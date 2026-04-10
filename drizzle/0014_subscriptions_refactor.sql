-- Refactor subscriptions table to mirror Stripe canonical state.
-- - Drop google_email (was always null), replace with `email`.
-- - Add price_id, cancel_at, trial_end, and full `data` jsonb for forward-compat.
-- - Add processed_stripe_events table for webhook idempotency.

ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "google_email";

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "price_id" text;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at" timestamp;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_end" timestamp;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "data" jsonb;

CREATE TABLE IF NOT EXISTS "processed_stripe_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "processed_at" timestamp NOT NULL DEFAULT now()
);
