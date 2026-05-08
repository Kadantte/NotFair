/**
 * Multi-platform MCP resource registry.
 *
 * Single source of truth for which paths are real MCP resources, what token
 * prefix each resource issues, and which legacy prefixes are honored. Lives
 * outside any individual route so .well-known handlers, OAuth endpoints, and
 * MCP route handlers all agree on the same set.
 *
 * Adding a new platform = add a row here. Nothing else in this file should
 * special-case Google or Meta — they are just rows.
 */

export type Platform = "google_ads" | "meta_ads" | "design";

export type McpResource = {
  /** Path the resource is served at, e.g. `/api/mcp`. Stable; persisted in tokens. */
  path: string;
  /** Platform identity used for telemetry, instructions selection, etc. */
  platform: Platform;
  /** Prefix stamped on newly-issued `oauth_access_tokens.token`. */
  tokenPrefix: string;
  /**
   * Older prefixes still accepted for this resource. Lets the legacy `oat_*`
   * Google tokens authenticate at `/api/mcp` indefinitely — the original
   * design did not encode platform in the prefix.
   */
  legacyTokenPrefixes: string[];
};

/**
 * Resource paths are the *actual URL* Claude.ai (or any MCP client) connects
 * to. Protocol-first URL shape:
 *
 *   /api/mcp              ← legacy resource (kept forever for back-compat)
 *   /api/mcp/google_ads   ← platform-explicit Google
 *   /api/mcp/meta_ads     ← platform-explicit Meta (when activated)
 *
 * All MCP servers live under `/api/mcp/*`. Platform identity is the
 * sub-path; the token prefix (`oat_google_ads_*`, `oat_meta_ads_*`) carries
 * the same identity for audience routing.
 *
 * Order matters: the first entry is the default when callers omit `resource`
 * (e.g. an existing Claude client that registered before the multi-platform
 * shape existed). Defaulting to `/api/mcp` preserves the legacy Google flow.
 */
export const MCP_RESOURCES: readonly McpResource[] = [
  {
    path: "/api/mcp",
    platform: "google_ads",
    tokenPrefix: "oat_google_ads_",
    legacyTokenPrefixes: ["oat_"],
  },
  {
    path: "/api/mcp/google_ads",
    platform: "google_ads",
    tokenPrefix: "oat_google_ads_",
    legacyTokenPrefixes: ["oat_"],
  },
  {
    path: "/api/mcp/meta_ads",
    platform: "meta_ads",
    tokenPrefix: "oat_meta_ads_",
    // Meta has no legacy prefixes — every token at this resource is issued
    // through the new `resource`-aware OAuth flow and stamped with the
    // platform-explicit prefix.
    legacyTokenPrefixes: [],
  },
  {
    path: "/api/mcp/design",
    platform: "design",
    tokenPrefix: "oat_design_",
    // Design has no legacy prefixes — every token is issued through the
    // resource-aware OAuth flow and stamped with the platform-explicit prefix.
    legacyTokenPrefixes: [],
  },
] as const;

/**
 * Paths the path-aware protected-resource document recognizes. A subset of
 * these are issuable (have entries in MCP_RESOURCES); the rest are reserved
 * for future platforms and fall back to the legacy default until activated.
 */
export const KNOWN_RESOURCE_PATHS: readonly string[] = [
  "/api/mcp",
  "/api/mcp/google_ads",
  "/api/mcp/meta_ads",
  "/api/mcp/design",
];

/** Default resource for callers that omit `?resource=` (back-compat). */
export const DEFAULT_RESOURCE_PATH = "/api/mcp";

export function findResource(path: string): McpResource | null {
  return MCP_RESOURCES.find((r) => r.path === path) ?? null;
}

/**
 * Map a fully-qualified resource URL (or a path) to a registered resource.
 * Accepts the form callers receive from RFC 8707 `resource` parameters,
 * which is typically a full URL like `https://www.notfair.co/api/mcp/google`.
 */
export function resolveResourceFromUrl(resourceParam: string | null | undefined): McpResource | null {
  if (!resourceParam) return null;
  let path: string;
  try {
    path = new URL(resourceParam).pathname;
  } catch {
    // Treat bare paths verbatim — the OAuth spec allows resource indicators
    // that aren't fully-qualified URLs in practice (some clients send paths).
    path = resourceParam.startsWith("/") ? resourceParam : `/${resourceParam}`;
  }
  // Strip trailing slash for canonical match (`/api/mcp/` → `/api/mcp`).
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return findResource(path);
}

/**
 * Resolve a presented bearer token to its resource. Returns the matched
 * resource and whether the match was via a *legacy* prefix (which the route
 * handler may use to gate behavior — e.g. legacy tokens are accepted at
 * `/api/mcp` only, never at platform-explicit paths).
 */
export function resolveResourceFromToken(token: string): { resource: McpResource; legacy: boolean } | null {
  for (const r of MCP_RESOURCES) {
    if (token.startsWith(r.tokenPrefix)) return { resource: r, legacy: false };
  }
  for (const r of MCP_RESOURCES) {
    for (const legacy of r.legacyTokenPrefixes) {
      if (token.startsWith(legacy)) return { resource: r, legacy: true };
    }
  }
  return null;
}
