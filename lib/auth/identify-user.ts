import "server-only";

import { cookies } from "next/headers";
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/analytics-server";

export type IdentityResolution = {
  userId: string;
  googleEmail: string | null;
  /**
   * `mcp_sessions.id` when resolved via the legacy cookie fallback. Null
   * when resolved via Supabase. Lets routes that still need to UPDATE
   * mcp_sessions for back-compat target the right row; phase-4 step-3
   * code-cleanup removes the field.
   */
  legacySessionId: number | null;
  via: "supabase" | "cookie_fallback";
};

/**
 * Single source of truth for "who is the request from?" — used by every
 * server route that needs to identify the user.
 *
 * Resolution order:
 *   1. Supabase `sb-*` cookies → `supabase.auth.getUser()`. Primary path
 *      for all post-migration sign-ins.
 *   2. Fall back to `adsagent_token` cookie → `mcp_sessions` lookup for
 *      users who haven't re-signed-in since the Supabase migration.
 *
 * Emits `auth_identity_resolved` with a `source` tag so we can track when
 * the cookie fallback can finally be dropped (gate: `via: "cookie_fallback"`
 * count hitting zero for ≥1 week).
 *
 * Returns `null` when the request has no identifiable user (caller should
 * 401 / redirect to signin).
 */
export async function identifyUser(args: { source: string }): Promise<IdentityResolution | null> {
  const { source } = args;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const resolution: IdentityResolution = {
      userId: user.id,
      googleEmail: user.email ?? null,
      legacySessionId: null,
      via: "supabase",
    };
    trackResolution(resolution, source);
    return resolution;
  }

  // Cookie fallback — same contract as the legacy adsagent_token path.
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAMES.token)?.value;
  if (!sessionToken) return null;

  const [session] = await db()
    .select({
      id: schema.mcpSessions.id,
      userId: schema.mcpSessions.userId,
      googleEmail: schema.mcpSessions.googleEmail,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, sessionToken),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!session?.userId) return null;

  const resolution: IdentityResolution = {
    userId: session.userId,
    googleEmail: session.googleEmail,
    legacySessionId: session.id,
    via: "cookie_fallback",
  };
  trackResolution(resolution, source);
  return resolution;
}

function trackResolution(resolution: IdentityResolution, source: string): void {
  trackServerEvent(resolution.userId, "auth_identity_resolved", {
    via: resolution.via,
    source,
  });
}
