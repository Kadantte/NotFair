import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/campaigns";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Check if user already has a linked MCP session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [existing] = await db()
      .select({ id: schema.mcpSessions.id })
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.userId, user.id))
      .limit(1);

    if (!existing) {
      // No Google Ads connected — send to onboarding
      return NextResponse.redirect(`${origin}/connect`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
