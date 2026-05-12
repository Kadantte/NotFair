import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { setProfileCookie, setSessionCookies } from "@/lib/auth-cookies";
import { stopCreatingMcpSessions } from "@/lib/connections/feature-flags";
import { loadGoogleConnection } from "@/lib/connections/google-read";
import { recordUserAttribution } from "@/lib/db/attribution";
import { db, schema } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { flushServerEvents, trackServerEvent } from "@/lib/analytics-server";
import { getClientIp } from "@/lib/request-ip";
import { buildXSignupConversionId, X_SIGNUP_ID_COOKIE } from "@/lib/x-signup";
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

/**
 * Decide how to handle an email-magic-link sign-in for a returning user.
 *
 * Connection-first: ad_platform_connections is the source of truth post
 * phase-4 step 2. When it carries a non-empty `activeAccountId`, the user
 * already has a Google connection — we don't need to mint or reissue any
 * mcp_sessions cookie; identity is carried by Supabase sb-* cookies.
 *
 * Falls back to a legacy mcp_sessions lookup so older users on the
 * adsagent_token cookie path still get their cookie reissued.
 *
 * Return shape:
 *   - { hasGoogleConnection: true, legacyAccessToken? } — returning Google-
 *     connected user. legacyAccessToken set only when an mcp_sessions row
 *     exists (cookie reissue path).
 *   - null — no prior Google connection on either table.
 */
async function findExistingConnectedSession(
  userId: string,
): Promise<{ hasGoogleConnection: true; legacyAccessToken?: string } | null> {
  const conn = await loadGoogleConnection(userId);
  const hasGoogleConnection = !!conn?.customerId;

  const [legacyRow] = await db()
    .select({
      accessToken: schema.mcpSessions.accessToken,
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

  if (!hasGoogleConnection && !legacyRow) return null;

  return {
    hasGoogleConnection: true,
    ...(legacyRow ? { legacyAccessToken: legacyRow.accessToken } : {}),
  };
}

/**
 * Has this user signed in before? Connection-first; mcp_sessions kept for
 * legacy users. Drives the `user_signed_up` event so we don't double-fire
 * for returning users whose signup pre-dated phase-4 step 2.
 */
async function hasAnySession(userId: string) {
  const [mcpRow, connRow] = await Promise.all([
    db()
      .select({ id: schema.mcpSessions.id })
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.userId, userId))
      .limit(1),
    db()
      .select({ id: schema.adPlatformConnections.id })
      .from(schema.adPlatformConnections)
      .where(eq(schema.adPlatformConnections.userId, userId))
      .limit(1),
  ]);

  return mcpRow.length > 0 || connRow.length > 0;
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

  if (existingSession?.legacyAccessToken) {
    // Returning user with a legacy mcp_sessions row. Reissue the cookie even
    // when STOP_CREATING_MCP_SESSIONS is on — this path doesn't create new
    // state, just rebinds the browser to the row that's already there.
    setSessionCookies(response, existingSession.legacyAccessToken);
  } else if (!existingSession && !stopCreatingMcpSessions()) {
    const accessToken = await mintEmailOnlySession(user);
    setSessionCookies(response, accessToken);
  }
  // else: returning user with a connection row but no mcp_sessions row, OR
  // STOP_CREATING_MCP_SESSIONS on with no existing row → identity carried
  // entirely by Supabase sb-* cookies (preserved below). No mcp_sessions
  // row, no adsagent_token cookie. Google connection (if any) lives on
  // ad_platform_connections; the Google OAuth callback writes/refreshes it.

  setProfileFromSupabaseUser(response, user);
  // Header-size mitigation pre-bridge. Once STOP_CREATING_MCP_SESSIONS is on,
  // sb-* cookies ARE the session, so they must be preserved here regardless
  // of the bridge flag — clearing them would log the user straight back out.
  if (!stopCreatingMcpSessions()) {
    await clearSupabaseCookies(response);
  }

  if (!hadPriorSession) {
    const clientIp = getClientIp(request);
    const xConversionId = buildXSignupConversionId(user.id);
    response.cookies.set(X_SIGNUP_ID_COOKIE, xConversionId, { path: "/", maxAge: 600 });
    trackServerEvent(user.id, "user_signed_up", {
      ...attributionMetadata,
      google_email: user.email,
      signup_method: "email_magic_link",
      ...(clientIp ? { $ip: clientIp } : {}),
    });
  }

  return response;
}
