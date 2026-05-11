/**
 * Auth gate for the GoHighLevel integration.
 *
 * Previously limited to DEV_EMAILS while the OAuth flow and marketplace
 * compliance were being validated. Now open to all authenticated users.
 *
 * This module is the single place to flip the gate policy. If the
 * integration needs to be restricted again, update here.
 *
 * Out of scope for this gate (intentional):
 *   - `/api/mcp/gohighlevel`: tools/list runs without auth; tools/call
 *     requires a Bearer that only an existing connection can produce.
 *   - The OAuth callback at `/api/oauth/gohighlevel/callback` (and the
 *     `/api/oauth/ghl/callback` alias): must accept the inbound state from
 *     HighLevel for any user mid-flow.
 *   - The HighLevel webhook receiver: signed by HighLevel, not by a user.
 */
import { getSession, type Session } from "@/lib/session";

export type GhlAccess = {
  allowed: boolean;
  /** True when there's no signed-in user — distinguish from "signed-in but not allowed". */
  unauthenticated: boolean;
};

/**
 * Server-side check usable from page handlers, route handlers, and server
 * actions. Returns `{ allowed: true }` for any authenticated user.
 */
export async function checkGhlAccess(): Promise<GhlAccess> {
  const session = await getSession();
  if (!session.connected) {
    return { allowed: false, unauthenticated: true };
  }
  return { allowed: true, unauthenticated: false };
}

/** @deprecated Use checkGhlAccess */
export const checkGhlDevAccess = checkGhlAccess;

/**
 * Convenience for API route handlers: returns a 404 Response when the
 * caller is not authenticated.
 */
export async function requireGhlAccessForApi(): Promise<Response | null> {
  const { allowed } = await checkGhlAccess();
  if (allowed) return null;
  return Response.json({ error: "not_found" }, { status: 404 });
}

/** @deprecated Use requireGhlAccessForApi */
export const requireGhlDevAccessForApi = requireGhlAccessForApi;

/**
 * Synchronous check for callers that already have a Session loaded.
 */
export function isGhlAllowed(session: Session | null | undefined): boolean {
  if (!session || !session.connected) return false;
  return true;
}

/** @deprecated Use isGhlAllowed */
export const isGhlDevAllowed = isGhlAllowed;
