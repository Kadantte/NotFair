import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAMES } from "@/lib/auth-cookies";

const PROTECTED_PATHS = ["/dashboard", "/campaigns", "/operations", "/tools", "/chat"];

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

  return NextResponse.next({ request });
}
