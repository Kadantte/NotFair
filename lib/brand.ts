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

const EMAIL_DOMAIN = "notfair.co";
export const SUPPORT_EMAIL = `tong@${EMAIL_DOMAIN}`;
export const OUTREACH_EMAIL = `tong@${EMAIL_DOMAIN}`;
export const OUTREACH_FROM = `Tong from ${BRAND_NAME} <${OUTREACH_EMAIL}>`;
export const CONTACT_EMAIL = `tong@${EMAIL_DOMAIN}`;
