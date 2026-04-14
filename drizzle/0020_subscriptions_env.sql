-- Add env column to subscriptions table so dev (Stripe test mode) and prod
-- (Stripe live mode) rows can coexist for the same user.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "env" text NOT NULL DEFAULT 'live';

-- Drop old single-column unique constraints (they assumed one row per user).
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_user_id_unique";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_stripe_customer_id_unique";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_user_id_key";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_stripe_customer_id_key";

-- Composite uniques: (user_id, env) and (stripe_customer_id, env).
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_env_uq" ON "subscriptions" ("user_id", "env");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_customer_env_uq" ON "subscriptions" ("stripe_customer_id", "env");
