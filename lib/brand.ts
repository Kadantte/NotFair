export const BRAND_NAME = "NotFair";
export const BRAND_DOMAIN = "notfair.co";
export const BRAND_URL = `https://${BRAND_DOMAIN}`;
export const BRAND_URL_WWW = `https://www.${BRAND_DOMAIN}`;
/**
 * Public MCP server URL surfaced to users in /connect setup steps and marketing copy.
 *
 * Points at the platform-explicit Google Ads endpoint (`/api/mcp/google_ads`),
 * not the legacy `/api/mcp`. Both URLs work — the legacy is kept forever for
 * back-compat with already-registered Claude.ai connectors and existing
 * `oat_*` tokens — but new users should connect at the platform-explicit URL
 * so their connector entry surfaces as "NotFair Google Ads" naturally and
 * future Meta adoption is symmetric (`/api/mcp/meta_ads`).
 */
export const MCP_SERVER_URL = `${BRAND_URL}/api/mcp/google_ads`;

/**
 * Single name surfaced to users across every connector setup surface:
 * - Claude.ai "Add custom connector" → display name pasted into the Name field.
 * - Codex CLI → `codex mcp add NotFair-GoogleAds --url …`.
 * - Any-MCP-client JSON config → `{ mcpServers: { "NotFair-GoogleAds": { … } } }`.
 *
 * Platform-suffixed for symmetry with the future `NotFair-MetaAds` connector
 * once Meta ships. Token prefix and URL slug stay lowercase
 * (`oat_google_ads_*`, `/api/mcp/google_ads`) per their respective conventions.
 */
export const MCP_CONNECTOR_NAME = "NotFair-GoogleAds";

/**
 * Meta Ads MCP equivalents — surfaced on /connect/meta-ads so users can wire
 * up Claude / Codex / etc against the Meta resource the same way they do
 * Google.
 */
export const META_MCP_SERVER_URL = `${BRAND_URL}/api/mcp/meta_ads`;
export const META_MCP_CONNECTOR_NAME = "NotFair-MetaAds";

/**
 * Design MCP — hosted HTTP MCP authenticated via OAuth Bearer token.
 * Unlike the local stdio Design MCP (npx @notfair/design-mcp), this server
 * runs server-side and uses the user's NotFair account for API keys and quota.
 * Surfaced on /connect/design for Claude.ai, Codex, Cursor, and any MCP client.
 */
export const DESIGN_MCP_SERVER_URL = `${BRAND_URL}/api/mcp/design`;
export const DESIGN_MCP_CONNECTOR_NAME = "NotFair-Design";

const EMAIL_DOMAIN = "notfair.co";
export const SUPPORT_EMAIL = `tong@${EMAIL_DOMAIN}`;
export const OUTREACH_EMAIL = `tong@${EMAIL_DOMAIN}`;
export const OUTREACH_FROM = `Tong from ${BRAND_NAME} <${OUTREACH_EMAIL}>`;
export const CONTACT_EMAIL = `tong@${EMAIL_DOMAIN}`;
