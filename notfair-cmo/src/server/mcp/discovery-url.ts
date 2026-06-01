/**
 * Derive the RFC 9728 protected-resource discovery URL from a resource URL.
 *
 * Spec rule: the well-known suffix `.well-known/oauth-protected-resource`
 * is inserted between the origin and the resource path. For root-only
 * resources (path `/` or empty) the suffix sits directly under the origin
 * with no trailing path.
 *
 * Returns `null` for malformed input or non-HTTP(S) schemes.
 */
export function deriveDiscoveryUrl(resource_url: string): string | null {
  let u: URL;
  try {
    u = new URL(resource_url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  return `${u.origin}/.well-known/oauth-protected-resource${path}`;
}
