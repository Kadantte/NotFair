-- Add platform column to operations so Meta MCP tool calls can be tracked
-- alongside Google. Existing rows back-fill to 'google_ads' (the only
-- platform that wrote to this table before this migration).

ALTER TABLE "operations"
  ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'google_ads';

-- Helps /usage breakdowns and platform-scoped queries.
CREATE INDEX IF NOT EXISTS "ops_user_platform_created_idx"
  ON "operations" ("user_id", "platform", "created_at");
