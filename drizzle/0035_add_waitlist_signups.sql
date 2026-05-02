-- Generic waitlist signups. One row per (key, user_id) — `key` namespaces
-- the waitlist (e.g. 'meta_ads' for the Meta App Review block, future
-- platforms or feature waitlists drop in by picking a new key with no
-- schema change). Anonymous (no user_id) signups stay un-deduped.

CREATE TABLE IF NOT EXISTS "waitlist_signups" (
  "id" serial PRIMARY KEY,
  "key" text NOT NULL,
  "user_id" text,
  "email" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Dedupe per signed-in user per waitlist. Partial so anonymous rows
-- (user_id IS NULL) bypass the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_signups_key_user_idx"
  ON "waitlist_signups" ("key", "user_id")
  WHERE "user_id" IS NOT NULL;

-- Browse signups newest-first per key (admin / outreach / counts).
CREATE INDEX IF NOT EXISTS "waitlist_signups_key_created_idx"
  ON "waitlist_signups" ("key", "created_at" DESC);
