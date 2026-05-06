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

  // Check for adsagent session cookie
  const token = request.cookies.get(COOKIE_NAMES.token)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/connect";
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
