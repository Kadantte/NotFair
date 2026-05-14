import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Look up a user's email from `auth.users` (Supabase Auth). Returns null
 * when no row matches.
 *
 * Phase-4 step 2: replaces the prior pattern of querying
 * `mcp_sessions.googleEmail` by userId, which silently returns null for
 * Supabase-only users (no mcp_sessions row). Every userId we have was
 * created by Supabase Auth via signInWithIdToken, so auth.users is the
 * authoritative source.
 *
 * Used by reddit-first-write, subscription, and agent feedback paths that
 * need the user's email for conversion / billing / audit trails.
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  // Drizzle doesn't model the Supabase auth schema by default; query directly.
  const result = await db().execute(
    sql`SELECT email FROM auth.users WHERE id = ${userId}::uuid LIMIT 1`,
  );
  // pg returns rows as `result.rows` or as an array depending on driver/runtime.
  const rows = (result as unknown as { rows?: Array<{ email: string | null }> }).rows
    ?? (result as unknown as Array<{ email: string | null }>);
  const email = rows?.[0]?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}
