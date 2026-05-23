import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type IdentityResolution = {
  userId: string;
  googleEmail: string | null;
};

/**
 * Single source of truth for "who is the request from?" — used by every
 * server route that needs to identify the user. Resolves the Supabase user
 * from `sb-*` cookies. Returns `null` when the request has no identifiable
 * user (caller should 401 / redirect to sign-in).
 */
export async function identifyUser(): Promise<IdentityResolution | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    userId: user.id,
    googleEmail: user.email ?? null,
  };
}
