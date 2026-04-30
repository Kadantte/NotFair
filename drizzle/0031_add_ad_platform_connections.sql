-- Multi-platform connection storage for non-Google MCPs.
--
-- Stage 2.5 of the multi-platform MCP shape (see
-- docs/multi-platform-mcp-design.md). Houses connections for Meta and any
-- future platform; Google Ads continues to use `mcp_sessions` for back-compat.
--
-- One row per (user_id, platform) — sticky-with-override account selection
-- (locked decision #5) lives in `active_account_id`, with the full enumerated
-- set in `account_ids`.
--
-- This migration is purely additive (CREATE TABLE IF NOT EXISTS + indexes).
-- No data writes here — Stage 3 (Meta OAuth callback) will start INSERTing
-- rows once the upstream OAuth flow is wired up.

CREATE TABLE IF NOT EXISTS "ad_platform_connections" (
  "id" serial PRIMARY KEY,
  -- NotFair user id (matches mcp_sessions.user_id). Same user can have
  -- multiple platform rows, one per platform.
  "user_id" text NOT NULL,
  -- Platform identifier — currently 'meta_ads', future 'tiktok_ads',
  -- 'linkedin_ads', etc. Google Ads stays on `mcp_sessions`.
  "platform" text NOT NULL,
  -- Long-lived refresh-equivalent token from the upstream platform.
  -- For Meta: the long-lived (60-day) user access token returned by
  -- `/oauth/access_token?fb_exchange_token=…`.
  "refresh_token" text NOT NULL,
  -- Short-lived access token cached from the most recent refresh.
  -- NULL on first row create; populated on first refresh.
  "access_token" text,
  -- When `access_token` expires. NULL when never refreshed.
  "access_token_expires_at" timestamp,
  -- Enumerated ad accounts the user can target on this platform.
  -- Shape: [{id, name, currency, timezone, business_id}, ...]
  "account_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Currently-selected ad account (sticky-with-override per design doc
  -- locked decision #5). Tools default to this; per-call accountId
  -- argument overrides it.
  "active_account_id" text,
  -- Platform-specific extras that don't fit the common shape: Meta
  -- business_id, granted scopes, FB user id, app_review status, etc.
  "platform_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- One row per (user, platform) — re-connecting the same platform updates
-- the existing row rather than creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "ad_platform_connections_user_platform_idx"
  ON "ad_platform_connections" ("user_id", "platform");

-- Admin / support queries by platform ("show me all Meta connections").
CREATE INDEX IF NOT EXISTS "ad_platform_connections_platform_idx"
  ON "ad_platform_connections" ("platform");
