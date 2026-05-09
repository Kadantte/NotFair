-- GoHighLevel: MCP-callable surface + bulk-install + lifecycle.
--
-- 1. `gohighlevel_access_tokens` — per-connection PATs that authenticate at
--    `/api/mcp/gohighlevel`. Hashed at rest; the plaintext is shown to the
--    user once at creation time. Foreign-keyed to `gohighlevel_connections`
--    with cascade delete so disconnect tears these down for free.
--
-- 2. `gohighlevel_connections.app_id` / `agency_connection_id` — bulk-install
--    bookkeeping. When an agency installs across multiple sub-locations, we
--    mint one row per location (each with its own location-token) and stamp
--    `agency_connection_id` to point back at the parent agency row so we can
--    re-mint location tokens later without re-OAuthing.
--
-- 3. `gohighlevel_connections.uninstalled_at` — soft-delete bit set by the
--    UNINSTALL webhook so we keep an audit trail. Hard delete is performed by
--    the user via the disconnect endpoint.

CREATE TABLE IF NOT EXISTS "gohighlevel_access_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "connection_id" integer NOT NULL REFERENCES "gohighlevel_connections"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  -- SHA-256 of the plaintext PAT. Plaintext is `ghl_pat_<connectionId>_<32B b64url>`
  -- and is shown to the user only at creation time.
  "token_hash" text NOT NULL,
  "label" text,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ghl_access_tokens_hash_idx"
  ON "gohighlevel_access_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "ghl_access_tokens_connection_idx"
  ON "gohighlevel_access_tokens" ("connection_id");
CREATE INDEX IF NOT EXISTS "ghl_access_tokens_user_idx"
  ON "gohighlevel_access_tokens" ("user_id");

ALTER TABLE "gohighlevel_connections"
  ADD COLUMN IF NOT EXISTS "app_id" text,
  ADD COLUMN IF NOT EXISTS "agency_connection_id" integer
    REFERENCES "gohighlevel_connections"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "uninstalled_at" timestamp;

CREATE INDEX IF NOT EXISTS "ghl_connections_agency_idx"
  ON "gohighlevel_connections" ("agency_connection_id");
