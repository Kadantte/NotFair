import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh Supabase auth cookies for the current request. Every
 * protected-path request must call this so Supabase can rotate the
 * access/refresh tokens before they expire. Without it, sessions that
 * live longer than the access-token TTL (~1h) silently break and force
 * the user to sign in again.
 *
 * Pattern lifted from the canonical Supabase SSR docs:
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // The double-set pattern is load-bearing: cookies must be applied
          // to BOTH the inbound request (so any subsequent reads in this
          // handler see the refreshed values) AND the outbound response
          // (so the browser stores them). The Supabase SSR docs flag this
          // explicitly.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession()) is what triggers the cookie
  // refresh. getSession() reads from local cookies without server validation,
  // so it skips the refresh path entirely.
  await supabase.auth.getUser();

  return supabaseResponse;
}
