CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE,
  "google_email" text,
  "stripe_customer_id" text UNIQUE,
  "stripe_subscription_id" text UNIQUE,
  "plan" text NOT NULL DEFAULT 'free',
  "status" text NOT NULL DEFAULT 'inactive',
  "interval" text,
  "current_period_end" timestamp,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscriptions_stripe_customer_idx" ON "subscriptions" ("stripe_customer_id");
