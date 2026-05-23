import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyOAuthNonce } from "@/lib/oauth-nonce";
import { getAppOrigin } from "@/lib/app-url";
import { identifyUser } from "@/lib/auth/identify-user";
import { getEnv } from "@/lib/env";
import {
  exchangeCodeForToken,
  getGoHighLevelRedirectUri,
  type GoHighLevelTokenResponse,
} from "@/lib/gohighlevel/oauth";
import { expandBulkInstall, upsertGoHighLevelConnection } from "@/lib/gohighlevel/install";

const STATE_COOKIE = "nf_ghl_oauth_state";

type DecodedState = {
  nonce: string;
  userId: string;
  next: string;
};

function getSafeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) {
    return "/connect/gohighlevel";
  }
  return next;
}

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
      next: getSafeNext(json.next),
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
  const url = new URL(getSafeNext(opts.next), getAppOrigin());
  url.searchParams.set("platform", "gohighlevel");
  url.searchParams.set("status", opts.status);
  if (opts.reason) url.searchParams.set("reason", opts.reason);
  return NextResponse.redirect(url.toString());
}

async function exchangeWithFallback(code: string, redirectUri: string): Promise<GoHighLevelTokenResponse> {
  // Single attempt only. We previously tried Company → Location on failure,
  // but OAuth auth codes are single-use, so the Location retry is guaranteed
  // to 400 with `invalid_grant` and the original error wins anyway. Removed
  // to clean up logs and avoid implying a working dual-mode flow.
  return await exchangeCodeForToken({ code, redirectUri, userType: "Company" });
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

  const identity = await identifyUser();
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

  const appId = getEnv("GOHIGHLEVEL_APP_ID") ?? null;

  let agency;
  try {
    agency = await upsertGoHighLevelConnection({ userId: state.userId, token, appId });
  } catch (e) {
    console.error("[gohighlevel-oauth] persist failed:", e);
    return redirectToSurface({ status: "error", reason: "persist_failed", next });
  }

  // Bulk-install fan-out. We do this best-effort so a single broken location
  // doesn't fail the whole connect: per-location errors are logged into the
  // returned `locations` array and we continue with whatever succeeded.
  if (token.isBulkInstallation && agency.userType === "Company" && agency.companyId && appId) {
    try {
      const expansion = await expandBulkInstall({
        agency,
        agencyAccessToken: token.access_token,
        appId,
      });
      const failed = expansion.locations.filter((l) => l.status === "failed");
      if (failed.length > 0) {
        console.warn("[gohighlevel-oauth] bulk install: some locations failed", failed);
      }
    } catch (e) {
      console.warn("[gohighlevel-oauth] bulk install expansion failed:", e);
    }
  }

  const response = redirectToSurface({ status: "connected", next });
  response.cookies.delete(STATE_COOKIE);
  return response;
}
