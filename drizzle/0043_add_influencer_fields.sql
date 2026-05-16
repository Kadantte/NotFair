-- Influencer reachout uses the existing contacts table (kind='influencer') so
-- the Gmail draft + send pipeline is reused as-is. These columns hold the
-- platform-specific metadata needed to write a personalized affiliate pitch.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "platform" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "handle" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "follower_count" integer;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "niche" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "profile_url" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "discovered_at" timestamp DEFAULT now();
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "discovered_by" text;

CREATE INDEX IF NOT EXISTS "contacts_platform_idx" ON "contacts" ("platform");
CREATE INDEX IF NOT EXISTS "contacts_follower_count_idx" ON "contacts" ("follower_count");
