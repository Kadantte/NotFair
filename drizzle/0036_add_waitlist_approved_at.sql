-- Approval gate for waitlist signups. When `approved_at` is non-null, the
-- corresponding (key, user_id) bypasses the waitlist wall and can use the
-- gated feature. Approval is granted manually from /dev/waitlist.

ALTER TABLE "waitlist_signups"
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp;

-- Quick lookup of approved-only rows per waitlist key.
CREATE INDEX IF NOT EXISTS "waitlist_signups_key_approved_idx"
  ON "waitlist_signups" ("key")
  WHERE "approved_at" IS NOT NULL;
