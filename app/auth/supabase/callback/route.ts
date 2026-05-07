import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { setProfileCookie, setSessionCookies } from "@/lib/auth-cookies";
import { recordUserAttribution } from "@/lib/db/attribution";
import { db, schema } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { flushServerEvents, trackServerEvent } from "@/lib/analytics-server";
import { getClientIp } from "@/lib/request-ip";
import {
  attributionToUserMetadata,
  isInternalAttributionReferrer,
  parseAttributionCookie,
} from "@/lib/utm";

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
  created_at?: string | null;
  user_metadata?: Record<string, unknown> & {
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

async function hasAnySession(userId: string) {
  const [existingSession] = await db()
    .select({ id: schema.mcpSessions.id })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.userId, userId))
    .limit(1);

  return !!existingSession;
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
  after(flushServerEvents);

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

  const hadPriorSession = await hasAnySession(user.id);
  const attribution = parseAttributionCookie(request.headers.get("cookie"));
  if (
    attribution?.signup_referrer &&
    isInternalAttributionReferrer(attribution.signup_referrer, new URL(request.url).hostname)
  ) {
    delete attribution.signup_referrer;
    delete attribution.signup_referrer_domain;
  }
  const attributionMetadata = attributionToUserMetadata(attribution);
  if (Object.keys(attributionMetadata).length > 0) {
    const existingMeta = user.user_metadata ?? {};
    if (!existingMeta.attribution_captured_at && !existingMeta.utm_source && !existingMeta.signup_referrer) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: attributionMetadata,
      });
      if (updateError) {
        console.warn("[supabase/callback] Attribution metadata update failed:", updateError);
      }
    }
  }
  await recordUserAttribution({
    userId: user.id,
    email: user.email ?? null,
    signupMethod: "email_magic_link",
    attribution,
    attributionSource: attribution ? "supabase_magic_link_cookie" : "supabase_magic_link_missing",
  });

  const response = NextResponse.redirect(`${origin}${next}`);
  const existingSession = await findExistingConnectedSession(user.id);

  if (existingSession) {
    setSessionCookies(response, existingSession.accessToken);
  } else {
    const accessToken = await mintEmailOnlySession(user);
    setSessionCookies(response, accessToken);
  }

  setProfileFromSupabaseUser(response, user);
  await clearSupabaseCookies(response);

  if (!hadPriorSession) {
    const clientIp = getClientIp(request);
    trackServerEvent(user.id, "user_signed_up", {
      ...attributionMetadata,
      google_email: user.email,
      signup_method: "email_magic_link",
      ...(clientIp ? { $ip: clientIp } : {}),
    });
  }

  return response;
}
