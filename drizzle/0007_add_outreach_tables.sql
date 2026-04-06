CREATE TABLE IF NOT EXISTS "contacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_email" text NOT NULL,
  "email" text NOT NULL,
  "first_name" text,
  "last_name" text,
  "company" text,
  "unsubscribed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_user_email_idx" ON "contacts" USING btree ("user_email","email");

CREATE TABLE IF NOT EXISTS "outreach_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_email" text NOT NULL,
  "name" text NOT NULL,
  "subject" text NOT NULL,
  "body_html" text NOT NULL,
  "from_name" text NOT NULL,
  "reply_to" text,
  "status" text NOT NULL DEFAULT 'draft',
  "send_rate" integer NOT NULL DEFAULT 50,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "outreach_campaigns_user_idx" ON "outreach_campaigns" USING btree ("user_email");

CREATE TABLE IF NOT EXISTS "outreach_emails" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "contact_id" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "sent_at" timestamp,
  "opened_at" timestamp,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "outreach_emails_campaign_idx" ON "outreach_emails" USING btree ("campaign_id","status");
CREATE INDEX IF NOT EXISTS "outreach_emails_contact_idx" ON "outreach_emails" USING btree ("contact_id");
