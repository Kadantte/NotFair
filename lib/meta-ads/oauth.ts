/**
 * Meta Marketing API OAuth + account enumeration helpers.
 *
 * The flow we implement is "Facebook Login for Business" with the long-lived
 * token exchange:
 *
 *   1. Browser redirects to https://www.facebook.com/{ver}/dialog/oauth with
 *      `config_id` (our pre-built Login Configuration), state, and redirect.
 *   2. User consents on Meta. Meta redirects to /api/oauth/meta/callback with
 *      `code` and `state`.
 *   3. Server exchanges code for a SHORT-lived token (~1 hour) at
 *      /v{ver}/oauth/access_token.
 *   4. Server exchanges short-lived token for a LONG-lived token (~60 days)
 *      via grant_type=fb_exchange_token.
 *   5. Server enumerates the user's ad accounts via Graph API and persists
 *      everything in `ad_platform_connections`.
 *
 * Env vars required:
 *   META_APP_ID
 *   META_APP_SECRET
 *   META_LOGIN_CONFIG_ID
 *   META_GRAPH_API_VERSION  (e.g. "v21.0")
 */

import { getRequiredEnv, getEnv } from "@/lib/env";

const DEFAULT_API_VERSION = "v21.0";

function apiVersion(): string {
  return getEnv("META_GRAPH_API_VERSION") ?? DEFAULT_API_VERSION;
}

function appId(): string {
  return getRequiredEnv("META_APP_ID");
}

function appSecret(): string {
  return getRequiredEnv("META_APP_SECRET");
}

function loginConfigId(): string {
  return getRequiredEnv("META_LOGIN_CONFIG_ID");
}

/**
 * Build the URL to redirect the user to for Meta consent.
 * Login for Business uses `config_id` instead of `scope` — the configuration
 * (managed in the Meta dev portal) bakes in the permission set + asset
 * selection UI.
 */
export function buildMetaAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    config_id: loginConfigId(),
    response_type: "code",
  });
  return `https://www.facebook.com/${apiVersion()}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange the authorization code (from the callback's `code` query param)
 * for a short-lived (~1 hour) user access token.
 */
export async function exchangeCodeForShortLivedToken(opts: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; expiresIn: number; tokenType: string }> {
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", appId());
  url.searchParams.set("client_secret", appSecret());
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code", opts.code);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `Meta short-lived token exchange failed: ${json.error?.message ?? res.status} (${json.error?.type ?? "unknown"})`,
    );
  }
  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 3600,
    tokenType: json.token_type ?? "bearer",
  };
}

/**
 * Exchange a short-lived token for a long-lived (~60 day) one. The long-
 * lived token is what we persist as `ad_platform_connections.refresh_token`
 * — Meta has no separate refresh-token endpoint; you re-exchange this token
 * before it expires, or the user must re-OAuth.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId());
  url.searchParams.set("client_secret", appSecret());
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `Meta long-lived token exchange failed: ${json.error?.message ?? res.status} (${json.error?.type ?? "unknown"})`,
    );
  }
  // Long-lived tokens come back without expires_in sometimes (Meta treats
  // "no expires_in" as the standard 60-day lifetime). Normalize to a number.
  const expiresIn = typeof json.expires_in === "number"
    ? json.expires_in
    : 60 * 24 * 60 * 60; // 60 days
  return { accessToken: json.access_token, expiresIn };
}

/**
 * Shape of an enumerated Meta ad account, normalized across direct-access
 * and Business-Manager-routed accounts. Matches the JSONB schema on
 * `ad_platform_connections.account_ids`.
 */
export type MetaAdAccount = {
  /** Always the unprefixed numeric id (no leading "act_"). */
  id: string;
  name?: string;
  currency?: string;
  timezone?: string;
  /** Business Manager id when the ad account is owned by / shared via a BM. */
  business_id?: string;
};

type GraphPage<T> = { data: T[]; paging?: { cursors?: unknown; next?: string } };

async function graphGet<T>(path: string, accessToken: string, fields?: string[]): Promise<GraphPage<T>> {
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);
  if (fields && fields.length > 0) url.searchParams.set("fields", fields.join(","));
  // Meta paginates; we cap at 100 per page (max). Loops below follow `paging.next`.
  url.searchParams.set("limit", "100");
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `Meta Graph API GET ${path} failed: ${json.error?.message ?? res.status}`,
    );
  }
  return json as GraphPage<T>;
}

async function graphGetAllPages<T>(path: string, accessToken: string, fields?: string[]): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined;
  let pageUrl = (() => {
    const u = new URL(`https://graph.facebook.com/${apiVersion()}/${path.replace(/^\//, "")}`);
    u.searchParams.set("access_token", accessToken);
    if (fields && fields.length > 0) u.searchParams.set("fields", fields.join(","));
    u.searchParams.set("limit", "100");
    return u.toString();
  })();

  // Hard cap on pages to avoid pathological loops if Meta misbehaves.
  for (let i = 0; i < 20; i++) {
    const res = await fetch(pageUrl);
    const json = (await res.json()) as GraphPage<T>;
    if ("error" in json && (json as { error?: { message?: string } }).error) {
      throw new Error(
        `Meta Graph API page fetch failed: ${(json as { error?: { message?: string } }).error?.message}`,
      );
    }
    out.push(...(json.data ?? []));
    next = json.paging?.next;
    if (!next) break;
    pageUrl = next;
  }
  return out;
}

type RawAdAccount = {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  business?: { id?: string; name?: string };
};

function normalizeAdAccount(raw: RawAdAccount, businessId?: string): MetaAdAccount | null {
  // Meta returns ids in the `act_<digits>` form most places, plain digits in
  // some. Strip `act_` so the JSONB shape is uniform.
  const rawId = raw.id ?? raw.account_id;
  if (!rawId) return null;
  const id = rawId.replace(/^act_/, "");
  return {
    id,
    name: raw.name,
    currency: raw.currency,
    timezone: raw.timezone_name,
    business_id: businessId ?? raw.business?.id,
  };
}

/**
 * Enumerate every ad account the user can access through this token.
 *
 * Sources (deduped on `id`):
 *   - GET /me/adaccounts            — direct-access + accounts the user is
 *                                     a User on (covers most cases).
 *   - GET /me/businesses            — Business Manager memberships.
 *   - For each BM:
 *       GET /{bm_id}/owned_ad_accounts   — accounts the BM owns
 *       GET /{bm_id}/client_ad_accounts  — accounts the BM has been granted
 *
 * Returns a deduped array. If the user has no ad accounts at all, returns
 * []. Caller decides what to show in the UI.
 */
export async function enumerateAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const fields = ["id", "account_id", "name", "currency", "timezone_name", "business"];
  const seen = new Map<string, MetaAdAccount>();

  // 1. Direct-access ad accounts.
  try {
    const directs = await graphGetAllPages<RawAdAccount>("/me/adaccounts", accessToken, fields);
    for (const raw of directs) {
      const norm = normalizeAdAccount(raw);
      if (norm) seen.set(norm.id, norm);
    }
  } catch {
    // Continue — BM enumeration may still work even if /me/adaccounts errors.
  }

  // 2. Business Manager → owned + client ad accounts.
  try {
    const businesses = await graphGetAllPages<{ id?: string; name?: string }>(
      "/me/businesses",
      accessToken,
      ["id", "name"],
    );
    for (const biz of businesses) {
      if (!biz.id) continue;
      for (const subPath of ["/owned_ad_accounts", "/client_ad_accounts"] as const) {
        try {
          const accounts = await graphGetAllPages<RawAdAccount>(`/${biz.id}${subPath}`, accessToken, fields);
          for (const raw of accounts) {
            const norm = normalizeAdAccount(raw, biz.id);
            if (norm && !seen.has(norm.id)) seen.set(norm.id, norm);
            else if (norm && seen.has(norm.id) && !seen.get(norm.id)!.business_id) {
              // Existing direct-access entry didn't carry a BM; backfill it.
              seen.set(norm.id, { ...seen.get(norm.id)!, business_id: biz.id });
            }
          }
        } catch {
          // Per-BM 403s are common (no permission on a specific BM); skip.
        }
      }
    }
  } catch {
    // No BMs or business_management permission denied.
  }

  return Array.from(seen.values());
}

/**
 * Fetch the upstream Meta user identity. Used at callback time to
 * link the connection to a specific FB user (stored in platform_metadata
 * for support / debugging — we don't use it as the primary key).
 */
export async function fetchMetaUser(accessToken: string): Promise<{ id: string; email?: string; name?: string }> {
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/me`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", "id,email,name");
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Meta /me failed: ${json.error?.message ?? res.status}`);
  }
  return { id: json.id, email: json.email, name: json.name };
}
