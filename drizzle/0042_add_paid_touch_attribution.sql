-- Preserve latest paid click before signup without overwriting first-touch source.
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "twclid" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_source" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_medium" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_campaign" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_term" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_content" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_gclid" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_fbclid" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_rdt_cid" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_twclid" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_landing_url" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_landing_path" text;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "paid_captured_at" timestamp;
ALTER TABLE "user_attribution" ADD COLUMN IF NOT EXISTS "latest_paid_touch" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "user_attribution_paid_source_idx"
  ON "user_attribution" ("paid_source", "paid_medium");

UPDATE "user_attribution"
SET
  "twclid" = nullif("raw_attribution"->>'twclid', ''),
  "updated_at" = now()
WHERE "twclid" IS NULL
  AND nullif("raw_attribution"->>'twclid', '') IS NOT NULL;
