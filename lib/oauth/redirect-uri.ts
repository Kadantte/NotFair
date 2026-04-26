/**
 * RFC 8252 §7.3 — for loopback redirect URIs the authorization server MUST
 * allow any port. We additionally tolerate cross-host matching among the
 * loopback variants (`127.0.0.1`, `::1`, `localhost`): Codex registers via
 * DCR using `127.0.0.1`, but Vercel's edge normalizes the hostname in
 * `request.url` to `localhost` before the handler sees it, so the same
 * conceptual loopback target can arrive in two different forms.
 *
 * Non-loopback URIs require strict equality.
 */

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname === "localhost"
  );
}

/**
 * True if `a` and `b` refer to the same redirect target, treating any
 * pair of loopback hosts (with any ports) as equivalent.
 */
export function redirectUriEquivalent(a: string, b: string): boolean {
  if (a === b) return true;

  let ua: URL;
  let ub: URL;
  try {
    ua = new URL(a);
    ub = new URL(b);
  } catch {
    return false;
  }

  if (!isLoopbackHost(ua.hostname) || !isLoopbackHost(ub.hostname)) return false;

  return (
    ua.protocol === ub.protocol &&
    ua.pathname === ub.pathname &&
    ua.search === ub.search
  );
}

/** True if `requested` matches any entry in `registered`. */
export function redirectUriMatches(requested: string, registered: string[]): boolean {
  for (const candidate of registered) {
    if (redirectUriEquivalent(requested, candidate)) return true;
  }
  return false;
}
