import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { setProfileCookie, setSessionCookies } from "@/lib/auth-cookies";
import { db, schema } from "@/lib/db";
import { deriveCustomerName } from "@/lib/google-ads";
import { createClient } from "@/lib/supabase/server";

function getSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/manage-ads-accounts";
  }

  return next;
}

function redirectToLogin(origin: string, reason: string) {
  return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${reason}`);
}

type SupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
    avatar_url?: string | null;
    picture?: string | null;
  } | null;
};

async function findExistingConnectedSession(userId: string) {
  const [existingSession] = await db()
    .select({
      accessToken: schema.mcpSessions.accessToken,
      customerIds: schema.mcpSessions.customerIds,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.userId, userId),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        sql`${schema.mcpSessions.customerId} <> ''`,
      ),
    )
    .orderBy(desc(schema.mcpSessions.createdAt))
    .limit(1);

  return existingSession ?? null;
}

async function mintEmailOnlySession(user: SupabaseUser): Promise<string> {
  const accessToken = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db().insert(schema.mcpSessions).values({
    accessToken,
    refreshToken: "",
    customerId: "",
    customerIds: "[]",
    userId: user.id,
    googleEmail: user.email ?? null,
    expiresAt: expiresAt.toISOString(),
  });

  return accessToken;
}

function setProfileFromSupabaseUser(response: NextResponse, user: SupabaseUser) {
  const meta = user.user_metadata ?? {};
  setProfileCookie(response, {
    name: meta.full_name ?? meta.name ?? user.email ?? null,
    picture: meta.avatar_url ?? meta.picture ?? null,
  });
}

async function clearSupabaseCookies(response: NextResponse) {
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeNext(searchParams.get("next"));

  if (!code) {
    return redirectToLogin(origin, "missing_code");
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[supabase/callback] Code exchange failed:", exchangeError);
    return redirectToLogin(origin, "supabase_auth");
  }

  const { data, error: userError } = await supabase.auth.getUser();
  const user = data?.user as SupabaseUser | null | undefined;
  if (userError || !user?.id) {
    console.error("[supabase/callback] User lookup failed:", userError);
    return redirectToLogin(origin, "supabase_auth");
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  const existingSession = await findExistingConnectedSession(user.id);

  if (existingSession) {
    setSessionCookies(
      response,
      existingSession.accessToken,
      deriveCustomerName(existingSession.customerIds),
    );
  } else {
    const accessToken = await mintEmailOnlySession(user);
    setSessionCookies(response, accessToken, "");
  }

  setProfileFromSupabaseUser(response, user);
  await clearSupabaseCookies(response);
  return response;
}
