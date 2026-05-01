import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { storeOAuthNonce } from "@/lib/oauth-nonce";
import { getGoHighLevelInstallUrl } from "@/lib/gohighlevel/oauth";

const STATE_COOKIE = "nf_ghl_oauth_state";

function getSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/connect/gohighlevel?status=connected";
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = getSafeNext(requestUrl.searchParams.get("next"));
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!sessionToken) {
    const signinUrl = new URL("/api/auth/signin", requestUrl);
    signinUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
    return NextResponse.redirect(signinUrl.toString());
  }

  const [session] = await db()
    .select({ id: schema.mcpSessions.id, userId: schema.mcpSessions.userId })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, sessionToken),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        sql`${schema.mcpSessions.customerId} <> ''`,
      ),
    )
    .limit(1);

  if (!session?.userId) {
    const signinUrl = new URL("/api/auth/signin", requestUrl);
    signinUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
    return NextResponse.redirect(signinUrl.toString());
  }

  const nonce = randomBytes(16).toString("hex");
  await storeOAuthNonce(nonce);

  const state = Buffer.from(JSON.stringify({ nonce, userId: session.userId, next })).toString("base64url");
  const installUrl = new URL(getGoHighLevelInstallUrl());
  // HighLevel's Marketplace install link is generated in their UI. If it
  // preserves unknown query params, this gives us normal OAuth CSRF `state`.
  // If it drops them, the callback still verifies the httpOnly cookie below.
  installUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(installUrl.toString());
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
