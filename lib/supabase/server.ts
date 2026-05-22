import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — can't set cookies.
            // The middleware handles session refresh.
          }
        },
      },
    },
  );
}

/**
 * Route-handler-flavored Supabase client.
 *
 * Why this exists: in a Route Handler that returns its own `NextResponse`
 * (e.g. `/auth/callback` returning a redirect), cookies written via Next's
 * `cookies()` store do NOT reliably get merged onto the explicit response
 * object. The Supabase SSR docs therefore prescribe the double-set
 * pattern: collect pending cookie writes, then apply them to the response
 * you're about to return. See `lib/supabase/refresh-session.ts` for the
 * same pattern in middleware.
 *
 * Returns:
 *   - `client` — the Supabase server client. Calling
 *     `signInWithIdToken` / `signOut` etc. routes its cookie writes
 *     through `setAll`, which we buffer.
 *   - `applyPendingCookies(response)` — applies the buffered cookie writes
 *     to the given response. Call this exactly once, immediately before
 *     returning the response from the route handler.
 */
export async function createRouteHandlerClient(): Promise<{
  client: SupabaseClient;
  applyPendingCookies: (response: NextResponse) => void;
}> {
  const cookieStore = await cookies();
  const pending: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) {
            pending.push(c);
          }
        },
      },
    },
  );

  return {
    client,
    applyPendingCookies(response) {
      for (const { name, value, options } of pending) {
        response.cookies.set(name, value, options);
      }
    },
  };
}
