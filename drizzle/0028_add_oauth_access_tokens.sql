-- Multi-token storage for OAuth access tokens.
--
-- Previously each oauth_clients row held a single oauth_access_token column,
-- which the token-exchange endpoint UPDATEd on every successful exchange. Two
-- concurrent exchanges for the same client_id (e.g. Claude Desktop reconnect
-- spawning parallel OAuth flows) would silently overwrite each other — the
-- first issued token became invalid the moment the second exchange landed,
-- producing a tight 401 → re-authorize loop on the affected client.
--
-- This table decouples token storage from oauth_clients so multiple tokens
-- can coexist for one client_id. Validity is determined by joining to
-- mcp_sessions and checking expires_at there, matching the existing pattern
-- in app/api/[transport]/route.ts.
--
-- The backfill copies any currently-set oauth_access_token rows into the new
-- table so in-flight Claude Desktop sessions keep working across the deploy.
-- The oauth_clients.oauth_access_token column is left in place for one
-- release as a rollback escape hatch; a follow-up migration drops it.

CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
  "token" text PRIMARY KEY,
  "client_id" text NOT NULL,
  "session_id" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "oauth_access_tokens_session_id_idx"
  ON "oauth_access_tokens" ("session_id");

CREATE INDEX IF NOT EXISTS "oauth_access_tokens_client_id_idx"
  ON "oauth_access_tokens" ("client_id");

INSERT INTO "oauth_access_tokens" ("token", "client_id", "session_id", "created_at")
SELECT
  oc.oauth_access_token,
  oc.client_id,
  oc.session_id,
  oc.created_at
FROM "oauth_clients" oc
WHERE oc.oauth_access_token IS NOT NULL
  AND oc.session_id IS NOT NULL
ON CONFLICT (token) DO NOTHING;
