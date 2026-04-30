/**
 * Meta-specific authorize wrapper. See lib/oauth/platform-authorize-wrapper.ts
 * for the shared logic and rationale.
 */
import { createPlatformAuthorizeHandler } from "@/lib/oauth/platform-authorize-wrapper";

export const GET = createPlatformAuthorizeHandler({
  resourceUrlPath: "/api/mcp/meta_ads",
});
