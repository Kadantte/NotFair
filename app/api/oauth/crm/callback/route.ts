/**
 * Neutral alias of `/api/oauth/gohighlevel/callback`.
 *
 * HighLevel rejects redirect URLs containing "highlevel" or "ghl" in the
 * path. Keep the implementation centralized while giving the Marketplace
 * validator a brand-neutral callback URL to allowlist for local testing.
 */
export { GET } from "@/app/api/oauth/gohighlevel/callback/route";
