/**
 * Google-specific authorize wrapper. See lib/oauth/platform-authorize-wrapper.ts
 * for the shared logic and rationale.
 *
 * Existing connections at the legacy `/api/mcp` URL keep using the root AS
 * metadata (no path-suffixed probe → no wrapper) and continue to mint
 * default-bound `oat_*` tokens. This wrapper only fires for new clients
 * that connect at the platform-explicit `/api/mcp/google_ads` URL — they
 * get a properly prefix-stamped `oat_google_ads_*` token.
 */
import { createPlatformAuthorizeHandler } from "@/lib/oauth/platform-authorize-wrapper";

export const GET = createPlatformAuthorizeHandler({
  resourceUrlPath: "/api/mcp/google_ads",
});
