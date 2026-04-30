-- Polymorphic connection FK for oauth_access_tokens + authorization_codes.
--
-- Background: pre-multi-platform, every issued `oat_*` token belonged to an
-- mcp_sessions row (Google Ads). Stage 3 introduces Meta tokens that belong
-- to ad_platform_connections rows instead. Both tables had `session_id NOT
-- NULL integer` FK-pointing-at-mcp_sessions; this migration relaxes that to
-- support either target without a polymorphic-FK hack.
--
-- Shape after this migration:
--   - session_id    nullable, FK-ish to mcp_sessions.id           (Google rows)
--   - connection_id nullable, FK-ish to ad_platform_connections.id (Meta+ rows)
--   - CHECK: exactly one of the two is non-null per row.
--
-- All existing rows have session_id set + connection_id null → CHECK passes
-- without any UPDATE. Migration is purely additive on data; only the column
-- nullability changes.

-- 1. authorization_codes
ALTER TABLE "authorization_codes"
  ADD COLUMN IF NOT EXISTS "connection_id" integer;

ALTER TABLE "authorization_codes"
  ALTER COLUMN "session_id" DROP NOT NULL;

ALTER TABLE "authorization_codes"
  DROP CONSTRAINT IF EXISTS "authorization_codes_target_xor";

ALTER TABLE "authorization_codes"
  ADD CONSTRAINT "authorization_codes_target_xor"
  CHECK ((session_id IS NOT NULL)::int + (connection_id IS NOT NULL)::int = 1);

-- 2. oauth_access_tokens
ALTER TABLE "oauth_access_tokens"
  ADD COLUMN IF NOT EXISTS "connection_id" integer;

ALTER TABLE "oauth_access_tokens"
  ALTER COLUMN "session_id" DROP NOT NULL;

ALTER TABLE "oauth_access_tokens"
  DROP CONSTRAINT IF EXISTS "oauth_access_tokens_target_xor";

ALTER TABLE "oauth_access_tokens"
  ADD CONSTRAINT "oauth_access_tokens_target_xor"
  CHECK ((session_id IS NOT NULL)::int + (connection_id IS NOT NULL)::int = 1);

-- 3. Indexes for the new column (mirror existing session_id index pattern).
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_connection_id_idx"
  ON "oauth_access_tokens" ("connection_id");
CREATE INDEX IF NOT EXISTS "authorization_codes_connection_id_idx"
  ON "authorization_codes" ("connection_id");
