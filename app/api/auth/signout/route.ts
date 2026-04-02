import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSessionCookies } from "@/lib/auth-cookies";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const cookieStore = await cookies();
  const requestCookies = cookieStore.getAll();

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Best-effort Supabase sign-out; app session cookies are authoritative.
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);

  // Also expire any leftover Supabase sb-* cookies
  for (const { name } of requestCookies) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}
