import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth-cookies";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Best-effort Supabase sign-out; app session cookies are authoritative.
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
