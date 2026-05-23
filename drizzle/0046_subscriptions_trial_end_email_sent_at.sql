-- Track when the trial-end notification email was delivered to a customer,
-- so the daily /api/cron/trial-end-emails job is idempotent. NULL means
-- "not yet emailed"; a timestamp pins the moment Resend confirmed the send.
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "trial_end_email_sent_at" timestamp;

-- Partial index on "not yet emailed" rows keeps the cron's candidate scan
-- cheap as the table grows.
CREATE INDEX IF NOT EXISTS "subscriptions_trial_end_email_pending_idx"
  ON "subscriptions" ("trial_ends_at")
  WHERE "trial_end_email_sent_at" IS NULL;
