/**
 * Feature gate for the GoHighLevel integration.
 *
 * The GHL surface is dev-only while we're still validating the OAuth flow,
 * scope coverage, and marketplace compliance. Only emails listed in
 * `DEV_EMAILS` see /connect/gohighlevel, the marketing pages, and can mint
 * PATs / start OAuth.
 *
 * Once we're ready to open it up, this module is the one place to flip:
 * either drop the gate entirely (delete every call site, then this file)
 * or expand `DEV_EMAILS`.
 *
 * Out of scope for this gate (intentional):
 *   - `/api/mcp/gohighlevel`: tools/list runs without auth; tools/call
 *     requires a Bearer that only an existing connection can produce.
 *     Non-devs can't get a connection, so the route is naturally locked.
 *   - The OAuth callback at `/api/oauth/gohighlevel/callback` (and the
 *     `/api/oauth/ghl/callback` alias): must accept the inbound state from
 *     HighLevel for any user mid-flow. The /start route is what actually
 *     gates entry to the flow.
 *   - The HighLevel webhook receiver: signed by HighLevel, not by a user.
 */
import { getSession, type Session } from "@/lib/session";
import { DEV_EMAILS } from "@/lib/dev-emails";

export type GhlAccess = {
  allowed: boolean;
  /** True when there's no signed-in user — distinguish from "signed-in but not a dev". */
  unauthenticated: boolean;
};

/**
 * Server-side check usable from page handlers, route handlers, and server
 * actions. Calls `getSession()` and consults `session.isDev`. Returns
 * `{ allowed: false, unauthenticated: !session.connected }` when blocked
 * so callers can pick between 401 and 404.
 */
export async function checkGhlDevAccess(): Promise<GhlAccess> {
  const session = await getSession();
  if (!session.connected) {
    return { allowed: false, unauthenticated: true };
  }
  return { allowed: !!session.isDev, unauthenticated: false };
}

/**
 * Convenience for API route handlers: returns a 404 (`{ error: "not_found" }`)
 * Response when the caller isn't a dev. The 404 is deliberate — admitting
 * that a "dev-only" surface exists by responding 403 leaks information about
 * unreleased product. 401 is reserved for "you need to log in to see this
 * existing public thing"; we don't want to imply that here.
 */
export async function requireGhlDevAccessForApi(): Promise<Response | null> {
  const { allowed } = await checkGhlDevAccess();
  if (allowed) return null;
  return Response.json({ error: "not_found" }, { status: 404 });
}

/**
 * Gate that raw `isDev` flag — used by callers (server pages, client
 * components) which already have a Session loaded. Avoids an extra round
 * trip to `getSession()`.
 *
 * Typed against the actual `Session` discriminated union so the compiler
 * narrows on `session.connected` rather than a permissive structural shape.
 * That stops accidental misuse: passing in a random `{ isDev: boolean }`
 * blob will fail typecheck instead of silently coercing.
 */
export function isGhlDevAllowed(session: Session | null | undefined): boolean {
  if (!session || !session.connected) return false;
  return !!session.isDev;
}

/**
 * Re-export for components that need to render "DEV ONLY · authorized
 * emails: …" hints. Defensive copy so callers can't mutate the constant.
 *
 * Server-only — this module imports `lib/session` (`"server-only"`). For
 * the visible badge label, see `components/gohighlevel/dev-only-badge.tsx`
 * (inlined to keep the client bundle clean).
 */
export const GHL_DEV_EMAILS: readonly string[] = [...DEV_EMAILS];
