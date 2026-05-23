-- Per-send tracking for any single-recipient email NotFair dispatches via
-- Resend — transactional alerts (trial-end, quota-warning), lifecycle
-- updates (product-update, weekly-digest), one-off operations notices, etc.
-- One row per Resend send, populated by the sending job immediately after
-- Resend accepts the message. Subsequent Resend webhook deliveries
-- (email.delivered / .opened / .clicked / .bounced) update the matching
-- row by `resend_id`.
--
-- NOT a replacement for `broadcasts` + `broadcast_recipients` — those model
-- multi-recipient campaigns with a shared template. This table is for sends
-- that don't have a campaign abstraction above them.
--
-- `kind` is the email-type discriminator. Free-form text (not an enum) so
-- adding a new send type never requires a schema migration. Today's values:
--   - 'trial_end'  → /api/cron/trial-end-emails
--
-- Per-sender idempotency lives on each sender's own latch (e.g.
-- `subscriptions.trial_end_email_sent_at`). This table is the audit and
-- dashboard surface — never the source of "should we send?".

CREATE TABLE IF NOT EXISTS "email_sends" (
  "id" serial PRIMARY KEY,
  -- Email-type discriminator. e.g. 'trial_end', 'product_update'. New kinds
  -- need no migration.
  "kind" text NOT NULL,
  "user_id" text NOT NULL,
  "env" text NOT NULL,
  "email" text NOT NULL,
  -- Resend message id from POST /emails. Unique so webhook UPSERTs are safe.
  "resend_id" text NOT NULL,
  -- Lifecycle bucket: sent → delivered → (opened|clicked) | bounced | failed
  "status" text NOT NULL DEFAULT 'sent',
  "sent_at" timestamp NOT NULL DEFAULT now(),
  "delivered_at" timestamp,
  "opened_at" timestamp,
  "clicked_at" timestamp,
  "bounced_at" timestamp,
  -- Bounce subtype (hard/soft/etc.) carried straight through from Resend.
  "bounce_type" text,
  -- Most recent error from a delivery_delayed/failed/bounced event.
  "error_message" text,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_sends_resend_id_uq"
  ON "email_sends" ("resend_id");

-- Dashboard query: list newest sends for a given kind, newest first.
CREATE INDEX IF NOT EXISTS "email_sends_kind_sent_at_idx"
  ON "email_sends" ("kind", "sent_at" DESC);

-- "Did this user become paid?" / "what have we sent this user?" lookup.
CREATE INDEX IF NOT EXISTS "email_sends_user_idx"
  ON "email_sends" ("user_id");
