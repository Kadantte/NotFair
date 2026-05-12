import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { supabaseSessionBridge } from "@/lib/connections/feature-flags";
import { refreshSupabaseSession } from "@/lib/supabase/refresh-session";

const PROTECTED_PATHS = ["/campaigns", "/operations", "/tools", "/chat"];

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) {
    return NextResponse.next({ request });
  }

  // Authenticated when EITHER:
  //   - legacy `adsagent_token` cookie is set (user came through Google
  //     OAuth signin), OR
  //   - any Supabase `sb-*` cookie is set (user came through magic link
  //     / Supabase OAuth — they may not have connected a Google account
  //     yet, so no adsagent_token exists).
  //
  // This is a UX filter, not a security boundary — server actions and
  // layout-level session checks still do proper auth validation. A cheap
  // cookie presence check is enough; calling Supabase getUser() here
  // would add a round-trip on every protected request.
  const hasLegacyToken = Boolean(request.cookies.get(COOKIE_NAMES.token)?.value);
  const hasSupabaseSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasLegacyToken && !hasSupabaseSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Phase-2 Supabase session bridge — refresh sb-* cookies if present so
  // they don't expire underneath us. No-op when SUPABASE_SESSION_BRIDGE is
  // off (callback deletes sb-* in that case, so getUser() finds nothing
  // to refresh). Calling unconditionally costs one extra Supabase API hit
  // per protected-path request; gate on the flag to avoid that round-trip
  // until the bridge is actually wanted.
  if (supabaseSessionBridge()) {
    return refreshSupabaseSession(request);
  }

  return NextResponse.next({ request });
}
