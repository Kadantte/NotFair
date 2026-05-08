-- Broadcasts: product-update emails to existing NotFair users.
--
-- One row per campaign in `broadcasts`; one row per (broadcast, user) in
-- `broadcast_recipients` so we can attribute Resend webhook events back to
-- the originating broadcast and stay idempotent across retried sends.
-- Marketing unsubscribe state lives in `email_preferences` and is honored
-- before any broadcast send. Cold-outreach `contacts.unsubscribed` stays
-- untouched.

CREATE TABLE IF NOT EXISTS "broadcasts" (
  "id" serial PRIMARY KEY,
  "slug" text NOT NULL UNIQUE,
  "subject" text NOT NULL,
  "preheader" text,
  "content" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "audience_filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "from_address" text NOT NULL,
  "reply_to" text NOT NULL,
  "scheduled_at" timestamp,
  "sent_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "broadcast_recipients" (
  "id" serial PRIMARY KEY,
  "broadcast_id" integer NOT NULL,
  "user_id" text NOT NULL,
  "email" text NOT NULL,
  "resend_id" text,
  "status" text NOT NULL DEFAULT 'queued',
  "error_message" text,
  "sent_at" timestamp,
  "delivered_at" timestamp,
  "opened_at" timestamp,
  "clicked_at" timestamp,
  "bounced_at" timestamp,
  "unsubscribed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "broadcast_recipients_broadcast_user_idx"
  ON "broadcast_recipients" ("broadcast_id", "user_id");
CREATE INDEX IF NOT EXISTS "broadcast_recipients_resend_id_idx"
  ON "broadcast_recipients" ("resend_id");
CREATE INDEX IF NOT EXISTS "broadcast_recipients_email_idx"
  ON "broadcast_recipients" ("email");

CREATE TABLE IF NOT EXISTS "email_preferences" (
  "user_id" text PRIMARY KEY,
  "unsubscribed_marketing_at" timestamp,
  "unsubscribe_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "broadcasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "broadcast_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_preferences" ENABLE ROW LEVEL SECURITY;
