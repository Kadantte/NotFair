ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "draft_subject" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "draft_body" text;
