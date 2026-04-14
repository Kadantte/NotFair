ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'lead';
CREATE INDEX IF NOT EXISTS "contacts_kind_idx" ON "contacts" ("kind");
