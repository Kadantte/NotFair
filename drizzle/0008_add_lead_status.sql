ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'new';
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp;
