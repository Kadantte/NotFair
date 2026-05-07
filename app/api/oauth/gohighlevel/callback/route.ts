import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { verifyOAuthNonce } from "@/lib/oauth-nonce";
import { getAppOrigin } from "@/lib/app-url";
import { identifyUser } from "@/lib/auth/identify-user";
import {
  exchangeCodeForToken,
  getGoHighLevelRedirectUri,
  parseScopes,
  type GoHighLevelTokenResponse,
} from "@/lib/gohighlevel/oauth";

const STATE_COOKIE = "nf_ghl_oauth_state";

type DecodedState = {
  nonce: string;
  userId: string;
  next: string;
};

function decodeState(raw: string | null): DecodedState | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (
      typeof json !== "object" || json === null
      || typeof json.nonce !== "string"
      || typeof json.userId !== "string"
    ) return null;
    return {
      nonce: json.nonce,
      userId: json.userId,
      next: typeof json.next === "string" && json.next.startsWith("/") ? json.next : "/connect/gohighlevel",
    };
  } catch {
    return null;
  }
}

function redirectToSurface(opts: {
  status: "connected" | "error";
  reason?: string;
  next?: string;
}): NextResponse {
  const url = new URL(opts.next ?? "/connect/gohighlevel", getAppOrigin());
  url.searchParams.set("platform", "gohighlevel");
  url.searchParams.set("status", opts.status);
  if (opts.reason) url.searchParams.set("reason", opts.reason);
  return NextResponse.redirect(url.toString());
}

async function exchangeWithFallback(code: string, redirectUri: string): Promise<GoHighLevelTokenResponse> {
  try {
    return await exchangeCodeForToken({ code, redirectUri, userType: "Company" });
  } catch (companyError) {
    try {
      return await exchangeCodeForToken({ code, redirectUri, userType: "Location" });
    } catch {
      throw companyError;
    }
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const cookieStore = await cookies();
  const state = decodeState(searchParams.get("state") ?? cookieStore.get(STATE_COOKIE)?.value ?? null);
  const next = state?.next;

  if (errorParam) {
    const response = redirectToSurface({ status: "error", reason: "denied", next });
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  if (!code) return redirectToSurface({ status: "error", reason: "missing_code", next });
  if (!state) return redirectToSurface({ status: "error", reason: "invalid_state", next });

  const nonceOk = await verifyOAuthNonce(state.nonce);
  if (!nonceOk) return redirectToSurface({ status: "error", reason: "nonce_expired", next });

  // Phase-4 step 2: verify state.userId matches current session via
  // identifyUser (Supabase first, cookie fallback). Drops the legacy
  // `customerId <> ''` gate; GHL connections don't strictly require Google
  // Ads to be connected first, and the UI surfaces enforce prerequisites.
  const identity = await identifyUser({ source: "gohighlevel-oauth-callback" });
  if (!identity || identity.userId !== state.userId) {
    return redirectToSurface({ status: "error", reason: "no_session", next });
  }

  let token: GoHighLevelTokenResponse;
  try {
    token = await exchangeWithFallback(code, getGoHighLevelRedirectUri(getAppOrigin()));
  } catch (e) {
    console.error("[gohighlevel-oauth] exchange failed:", e);
    return redirectToSurface({ status: "error", reason: "exchange_failed", next });
  }

  const userType = token.userType ?? (token.locationId ? "Location" : "Company");
  const connectionKey = token.locationId
    ? `location:${token.companyId ?? "unknown"}:${token.locationId}`
    : `company:${token.companyId ?? token.userId ?? "unknown"}`;
  const accessTokenExpiresAt = new Date(Date.now() + (token.expires_in ?? 86400) * 1000);
  const scopes = parseScopes(token.scope);
  const platformMetadata = {
    upstream_user_id: token.userId ?? null,
    refresh_token_id: token.refreshTokenId ?? null,
    is_bulk_installation: token.isBulkInstallation ?? null,
    trace_id: token.traceId ?? null,
    connected_at: new Date().toISOString(),
  };

  await db()
    .insert(schema.goHighLevelConnections)
    .values({
      userId: state.userId,
      connectionKey,
      companyId: token.companyId ?? null,
      locationId: token.locationId ?? null,
      userType,
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      accessTokenExpiresAt,
      scopes,
      platformMetadata,
    })
    .onConflictDoUpdate({
      target: [
        schema.goHighLevelConnections.userId,
        schema.goHighLevelConnections.connectionKey,
      ],
      set: {
        userType,
        refreshToken: token.refresh_token,
        accessToken: token.access_token,
        accessTokenExpiresAt,
        scopes,
        platformMetadata,
        updatedAt: new Date(),
      },
    });

  const response = redirectToSurface({ status: "connected", next });
  response.cookies.delete(STATE_COOKIE);
  return response;
}
