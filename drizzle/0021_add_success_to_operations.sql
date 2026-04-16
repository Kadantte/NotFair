-- Add success flag + error_message to operations table.
-- Existing rows default to success=1 (they're all successful changes/reads from before this migration).
-- success=0 rows are write attempts that reached Google's API and were rejected — they still count
-- against the user's daily op limit so our count matches Google's mutate-ops quota.

ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "success" smallint NOT NULL DEFAULT 1;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "error_message" text;
