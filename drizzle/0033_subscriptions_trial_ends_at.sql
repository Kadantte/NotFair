-- Per-user trial expiry. Set on subscription row creation (signup) to
-- created_at + 7 days. Existing rows are backfilled to now() + 7 days so
-- everyone gets a fresh week starting at deploy time.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp;

UPDATE "subscriptions"
SET "trial_ends_at" = now() + interval '7 days'
WHERE "trial_ends_at" IS NULL;
