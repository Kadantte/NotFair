-- Phase 2 — Claude consumer-OAuth for the GoHighLevel MCP.
--
-- Adds a third polymorphic target to `authorization_codes` and
-- `oauth_access_tokens` so a Claude.ai-issued token can bind to a
-- `gohighlevel_connections` row alongside the existing `session_id`
-- (mcp_sessions) and `connection_id` (ad_platform_connections) targets.
--
-- The XOR CHECK is upgraded from "exactly 1 of 2" to "exactly 1 of 3".
-- All existing rows have either session_id OR connection_id set and
-- gohighlevel_connection_id NULL → CHECK still passes without any UPDATE.

-- 1. authorization_codes
ALTER TABLE "authorization_codes"
  ADD COLUMN IF NOT EXISTS "gohighlevel_connection_id" integer;

ALTER TABLE "authorization_codes"
  DROP CONSTRAINT IF EXISTS "authorization_codes_target_xor";

ALTER TABLE "authorization_codes"
  ADD CONSTRAINT "authorization_codes_target_xor"
  CHECK (
    (session_id IS NOT NULL)::int
    + (connection_id IS NOT NULL)::int
    + (gohighlevel_connection_id IS NOT NULL)::int
    = 1
  );

-- 2. oauth_access_tokens
ALTER TABLE "oauth_access_tokens"
  ADD COLUMN IF NOT EXISTS "gohighlevel_connection_id" integer;

ALTER TABLE "oauth_access_tokens"
  DROP CONSTRAINT IF EXISTS "oauth_access_tokens_target_xor";

ALTER TABLE "oauth_access_tokens"
  ADD CONSTRAINT "oauth_access_tokens_target_xor"
  CHECK (
    (session_id IS NOT NULL)::int
    + (connection_id IS NOT NULL)::int
    + (gohighlevel_connection_id IS NOT NULL)::int
    = 1
  );

-- 3. Indexes mirroring the existing session_id / connection_id pattern.
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_ghl_connection_id_idx"
  ON "oauth_access_tokens" ("gohighlevel_connection_id");
CREATE INDEX IF NOT EXISTS "authorization_codes_ghl_connection_id_idx"
  ON "authorization_codes" ("gohighlevel_connection_id");
