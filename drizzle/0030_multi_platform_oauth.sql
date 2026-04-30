-- Multi-platform OAuth scaffolding.
--
-- Phase 1 of the multi-platform MCP shape (see docs/multi-platform-mcp-design.md).
-- This migration is additive only — no behavior change for existing tokens.
--
-- 1. `oauth_access_tokens.resource_url` — RFC 8707 audience binding. Each
--    issued token is now bound to a specific MCP resource URL (e.g.
--    `/api/mcp`, `/api/google_ads/mcp`). Existing rows backfill to `/api/mcp`,
--    matching what the legacy resource-metadata document advertises.
--    Resolver treats NULL/missing as `/api/mcp` for the legacy `oat_*` prefix
--    so legacy tokens continue to authenticate without modification.
--
-- 2. `authorization_codes.resource_url` — carries the requested resource
--    from the authorize step to the token-exchange step so the issued token
--    is stamped with the correct audience and prefix.
--
-- Tool names are not prefixed; `tool_permissions` rows do not need migration.

ALTER TABLE "oauth_access_tokens"
  ADD COLUMN IF NOT EXISTS "resource_url" text;

UPDATE "oauth_access_tokens"
  SET "resource_url" = '/api/mcp'
  WHERE "resource_url" IS NULL;

ALTER TABLE "authorization_codes"
  ADD COLUMN IF NOT EXISTS "resource_url" text;
