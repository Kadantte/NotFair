-- RFC 7591 Dynamic Client Registration support.
--
-- Clients minted via `POST /api/oauth/register` are created anonymously by
-- remote MCP clients (Codex CLI, etc.) — there is no logged-in user when
-- registration happens, so we cannot pre-bind them to an mcp_session the way
-- `/api/oauth/clients` does for the in-app Claude Connector flow.
--
-- The authorize endpoint instead resolves the session from the user's cookie
-- at flow time. To support that, session_id becomes nullable. We also store
-- the registered redirect_uris so /authorize can reject mismatched
-- redirect_uri values per RFC 6749 §4.1.3.

ALTER TABLE "oauth_clients" ALTER COLUMN "session_id" DROP NOT NULL;

ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "redirect_uris" jsonb;
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "client_name" text;
