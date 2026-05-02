import "server-only";
import type { ActivePlatform } from "@/lib/auth-cookies";

/**
 * One connected/not-connected fact about a platform. The order of items
 * passed to `resolveActivePlatform` IS the priority order — the first
 * connected platform wins when no cookie preference exists.
 */
export type PlatformConnectivity = {
  platform: ActivePlatform;
  /** True when the user has at least one usable account on this platform. */
  connected: boolean;
};

/**
 * Pick the platform whose UI the navbar + sidebar should render.
 *
 * Resolution priority:
 *   1. Honor the cookie pick iff that platform is actually connected.
 *      (Stale cookies pointing at a disconnected platform are ignored —
 *      otherwise the navbar shows a logo for a platform with no accounts.)
 *   2. Auto-select the first connected platform in registry order. This is
 *      what makes Meta-only users see Meta in the navbar after a fresh
 *      sign-in (cookie cleared on signout): with no cookie and no Google
 *      customer, the next connected entry — Meta — wins.
 *   3. Onboarding fallback: first platform in registry. Only happens when
 *      the user has zero connections; the navbar dropdown is hidden in
 *      that state anyway, so this only sets the default for the sidebar
 *      gate.
 *
 * Adding a new platform: extend the `ActivePlatform` type, then append a
 * `{ platform, connected }` entry to the `connections` array passed in
 * from `getSession()`. No changes here.
 */
export function resolveActivePlatform(opts: {
  cookie: string | undefined;
  connections: PlatformConnectivity[];
}): ActivePlatform {
  if (opts.cookie) {
    const cookieMatch = opts.connections.find(
      (c) => c.platform === opts.cookie && c.connected,
    );
    if (cookieMatch) return cookieMatch.platform;
  }
  const firstConnected = opts.connections.find((c) => c.connected);
  if (firstConnected) return firstConnected.platform;
  // No connections — onboarding state. The first registered platform is
  // the canonical default (today: google_ads).
  return opts.connections[0].platform;
}
