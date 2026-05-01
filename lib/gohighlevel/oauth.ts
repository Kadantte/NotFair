import { getEnv, getRequiredEnv } from "@/lib/env";

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
const LOCATION_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/locationToken";
const API_VERSION = "2021-07-28";

export const GOHIGHLEVEL_READONLY_SCOPES = [
  "locations.readonly",
  "contacts.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "opportunities.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
] as const;

function clientId(): string {
  return getRequiredEnv("GOHIGHLEVEL_CLIENT_ID");
}

function clientSecret(): string {
  return getRequiredEnv("GOHIGHLEVEL_CLIENT_SECRET");
}

export function getGoHighLevelInstallUrl(): string {
  return getRequiredEnv("GOHIGHLEVEL_INSTALL_URL");
}

export function getGoHighLevelRedirectUri(origin: string): string {
  return getEnv("GOHIGHLEVEL_REDIRECT_URI") ?? `${origin}/api/oauth/gohighlevel/callback`;
}

export type GoHighLevelTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token: string;
  scope?: string;
  refreshTokenId?: string;
  userType?: "Company" | "Location" | string;
  companyId?: string;
  locationId?: string;
  userId?: string;
  isBulkInstallation?: boolean;
  traceId?: string;
};

export function parseScopes(scope: string | undefined): string[] {
  return (scope ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json.message === "string"
      ? json.message
      : typeof json.error === "string"
        ? json.error
        : `HTTP ${res.status}`;
    throw new Error(`HighLevel OAuth request failed: ${message}`);
  }
  return json as Record<string, unknown>;
}

export async function exchangeCodeForToken(opts: {
  code: string;
  redirectUri: string;
  userType?: "Company" | "Location";
}): Promise<GoHighLevelTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "authorization_code",
    code: opts.code,
    user_type: opts.userType ?? "Company",
    redirect_uri: opts.redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return (await parseJsonResponse(res)) as GoHighLevelTokenResponse;
}

export async function refreshAccessToken(opts: {
  refreshToken: string;
  redirectUri: string;
  userType?: "Company" | "Location";
}): Promise<GoHighLevelTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    user_type: opts.userType ?? "Company",
    redirect_uri: opts.redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return (await parseJsonResponse(res)) as GoHighLevelTokenResponse;
}

export async function createLocationAccessToken(opts: {
  agencyAccessToken: string;
  companyId: string;
  locationId: string;
}): Promise<GoHighLevelTokenResponse> {
  const res = await fetch(LOCATION_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Version: API_VERSION,
      Authorization: `Bearer ${opts.agencyAccessToken}`,
    },
    body: JSON.stringify({
      companyId: opts.companyId,
      locationId: opts.locationId,
    }),
  });
  return (await parseJsonResponse(res)) as GoHighLevelTokenResponse;
}
