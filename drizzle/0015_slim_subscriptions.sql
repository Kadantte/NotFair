-- Slim subscriptions to the canonical 7-column shape.
-- Stripe is the source of truth; everything except the lookup keys lives in `data`.

ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "stripe_subscription_id";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "plan";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "status";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "price_id";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "interval";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "current_period_end";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "cancel_at_period_end";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "cancel_at";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "trial_end";
