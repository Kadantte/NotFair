import { NextResponse } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { setProfileCookie } from "@/lib/auth-cookies";
import { recordUserAttribution } from "@/lib/db/attribution";
import { db, schema } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { flushServerEvents, trackServerEvent } from "@/lib/analytics-server";
import { getClientIp } from "@/lib/request-ip";
import { sendXConversion } from "@/lib/x-capi";
import { buildXSignupConversionId, X_SIGNUP_ID_COOKIE } from "@/lib/x-signup";
import {
  attributionToUserMetadata,
  isInternalAttributionReferrer,
  paidTouchToUserMetadata,
  parseAttributionCookie,
  parsePaidTouchCookie,
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
 * Has this user signed in before? Checks both `ad_platform_connections` and
 * the legacy `mcp_sessions` table — drives the `user_signed_up` event so we
 * don't double-fire for returning users whose signup pre-dated the
 * Supabase-anchored auth migration.
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

function setProfileFromSupabaseUser(response: NextResponse, user: SupabaseUser) {
  const meta = user.user_metadata ?? {};
  setProfileCookie(response, {
    name: meta.full_name ?? meta.name ?? user.email ?? null,
    picture: meta.avatar_url ?? meta.picture ?? null,
  });
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
  const latestPaidTouch = parsePaidTouchCookie(request.headers.get("cookie"));
  if (
    attribution?.signup_referrer &&
    isInternalAttributionReferrer(attribution.signup_referrer, new URL(request.url).hostname)
  ) {
    delete attribution.signup_referrer;
    delete attribution.signup_referrer_domain;
  }
  const attributionMetadata = attributionToUserMetadata(attribution);
  const paidTouchMetadata = paidTouchToUserMetadata(latestPaidTouch);
  if (Object.keys(attributionMetadata).length > 0 || Object.keys(paidTouchMetadata).length > 0) {
    const existingMeta = user.user_metadata ?? {};
    const metadataUpdate = {
      ...(!existingMeta.attribution_captured_at && !existingMeta.utm_source && !existingMeta.signup_referrer
        ? attributionMetadata
        : {}),
      ...(!existingMeta.paid_captured_at && !existingMeta.paid_source && !existingMeta.paid_twclid
        ? paidTouchMetadata
        : {}),
    };
    if (Object.keys(metadataUpdate).length > 0) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: metadataUpdate,
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
    paidTouch: latestPaidTouch,
    attributionSource: attribution ? "supabase_magic_link_cookie" : "supabase_magic_link_missing",
  });

  // Identity is carried entirely by Supabase sb-* cookies — no mcp_sessions
  // row, no adsagent_token cookie. Google connection state (if any) lives
  // on ad_platform_connections; the Google OAuth callback owns it.
  const response = NextResponse.redirect(`${origin}${next}`);
  setProfileFromSupabaseUser(response, user);

  if (!hadPriorSession) {
    const clientIp = getClientIp(request);
    const xConversionId = buildXSignupConversionId(user.id);
    response.cookies.set(X_SIGNUP_ID_COOKIE, xConversionId, { path: "/", maxAge: 600 });
    after(
      sendXConversion({
        conversionId: xConversionId,
        email: user.email ?? null,
        twclid: latestPaidTouch?.twclid ?? attribution?.twclid ?? null,
        valueDecimal: 1.0,
        currency: "USD",
      }),
    );
    trackServerEvent(user.id, "user_signed_up", {
      ...attributionMetadata,
      ...paidTouchMetadata,
      google_email: user.email,
      signup_method: "email_magic_link",
      ...(clientIp ? { $ip: clientIp } : {}),
    });
  }

  return response;
}
