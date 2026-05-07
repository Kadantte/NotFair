import "server-only";

import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq, gte, and, desc } from "drizzle-orm";
import { COOKIE_NAMES, type ActivePlatform } from "@/lib/auth-cookies";
import { deriveCustomerName, parseCustomerIds, type AuthContext, type ConnectedAccount } from "@/lib/google-ads";
import { DEV_EMAILS } from "@/lib/dev-access";
import { resolveActivePlatform } from "@/lib/active-platform";
import { readGoogleFromConnections, readUserIdFromSupabase } from "@/lib/connections/feature-flags";
import {
  compareForShadowRead,
  loadGoogleConnection,
  type GoogleConnectionView,
} from "@/lib/connections/google-read";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type Session = {
  connected: true;
  /**
   * True when the user finished Google OAuth but has no Google Ads account
   * to connect (e.g. brand-new Google identity that's never used Google Ads).
   * The session row exists with `customerId === ""`, so the user can browse
   * the app while we wait for them to either create a Google Ads account on
   * the same identity or connect a different platform (Meta, etc.).
   *
   * Server actions that touch the Google Ads API still get "Not authenticated"
   * from getSessionAuth/getAuthContext — those gates intentionally stay strict.
   */
  pendingSetup: boolean;
  token: string;
  userId: string | null;
  customerId: string;
  customerName: string;
  customerIds: { id: string; name: string }[];
  /** Linked Meta ad accounts (curated subset). Empty if user has no Meta connection. */
  metaAccounts: { id: string; name: string }[];
  /** Active Meta account id from `ad_platform_connections.active_account_id`. */
  activeMetaAccountId: string | null;
  /** Which platform's UI the user picked in the navbar dropdown. Drives sidebar gating. */
  activePlatform: ActivePlatform;
  googleEmail: string | null;
  /** Display name from Supabase user_metadata.full_name (Google OAuth provides this) */
  displayName: string | null;
  /** Google profile picture, read live from Supabase user_metadata.avatar_url */
  picture: string | null;
  isDev: boolean;
  impersonating?: boolean;
} | {
  connected: false;
};

type SessionRow = {
  refreshToken: string;
  customerId: string;
  customerIds: string;
  loginCustomerId: string | null;
  userId: string | null;
  googleEmail: string | null;
};

type LoadSessionResult = {
  token: string;
  row: SessionRow;
  impersonating?: { sessionId: number; realEmail: string };
};

/**
 * Stage 1: identify the user and load device-level fields from `mcp_sessions`
 * (cookie binding, dev impersonation). Returns the legacy SessionRow shape so
 * stage-2 code can layer connection-row data on top without rewriting callers.
 *
 * Phase-2 note: this still reads Google connection state (refreshToken,
 * customerId, customerIds, loginCustomerId, googleEmail) from mcp_sessions for
 * back-compat with rows that haven't been dual-written yet. The
 * `mergeWithConnection` step below replaces those fields with values from
 * `ad_platform_connections` when `READ_GOOGLE_FROM_CONNECTIONS=true`.
 *
 * Phase-4 step 1 note: when `READ_USERID_FROM_SUPABASE=true`, identity comes
 * from the Supabase session cookie (refreshed by middleware) and we look up
 * the user's mcp_sessions row by `user_id` rather than by `access_token`.
 * This severs identity resolution from the `adsagent_token` cookie so
 * step 3 can drop it entirely. Falls back to the cookie path when no
 * Supabase user is present.
 */
async function loadDeviceSession(): Promise<LoadSessionResult | null> {
  const cookieStore = await cookies();

  // Phase-4 step 1: try Supabase Auth first.
  if (readUserIdFromSupabase()) {
    const supabaseResult = await loadDeviceSessionViaSupabase();
    if (supabaseResult) return supabaseResult;
    // No Supabase user → fall through to cookie path so existing users who
    // haven't re-signed-in since the bridge flipped keep working.
  }

  const token = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!token) return null;

  const [realRow] = await db()
    .select({
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      loginCustomerId: schema.mcpSessions.loginCustomerId,
      userId: schema.mcpSessions.userId,
      googleEmail: schema.mcpSessions.googleEmail,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, token),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  // Empty customerId is a valid "ads-less" session — user signed in via Google
  // but has no Google Ads account to connect yet. Pending account-selection
  // tokens also have customerId="", but those are passed via URL (?pending=…),
  // never set as the cookie, so they don't leak through this lookup.
  if (!realRow) return null;

  const row: SessionRow = { ...realRow, userId: realRow.userId ?? null, loginCustomerId: realRow.loginCustomerId ?? null };

  // Check for dev impersonation
  const impersonateId = cookieStore.get(COOKIE_NAMES.impersonate)?.value;
  if (impersonateId && row.googleEmail && DEV_EMAILS.includes(row.googleEmail)) {
    if (!/^\d+$/.test(impersonateId)) return { token, row }; // malformed cookie → ignore, return real session
    const sessionId = parseInt(impersonateId, 10);

    const [targetRow] = await db()
      .select({
        refreshToken: schema.mcpSessions.refreshToken,
        customerId: schema.mcpSessions.customerId,
        customerIds: schema.mcpSessions.customerIds,
        loginCustomerId: schema.mcpSessions.loginCustomerId,
        userId: schema.mcpSessions.userId,
        googleEmail: schema.mcpSessions.googleEmail,
      })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.id, sessionId),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);

    // Impersonation requires a real, connected target session — never let a
    // dev "impersonate" an ads-less placeholder, since the whole point of dev
    // impersonation is to read another user's actual Google Ads data.
    if (!targetRow || !targetRow.customerId) return null;

    return {
      token,
      row: { ...targetRow, userId: targetRow.userId ?? null, loginCustomerId: targetRow.loginCustomerId ?? null },
      impersonating: { sessionId, realEmail: row.googleEmail },
    };
  }

  return { token, row };
}

/**
 * Phase-4 step 1: Supabase-anchored device-session loader.
 *
 * Resolves identity from the Supabase Auth cookies (refreshed per request by
 * the proxy middleware), then looks up the user's mcp_sessions row by
 * `user_id`. Returns null when:
 *   - No Supabase user (caller falls through to the legacy cookie path).
 *   - Supabase user present but no live mcp_sessions row (caller falls
 *     through; this can happen for users mid-onboarding or with corrupted
 *     state — step 2 will make this state expected for new signups, at
 *     which point we'll synthesize a SessionRow from ad_platform_connections
 *     instead).
 *
 * Dev impersonation: the impersonation cookie still uses `mcp_sessions.id`
 * (int) values in step 1. We honor it the same way as the cookie path —
 * read the impersonate cookie, look up by id, swap target. Step 4 migrates
 * the cookie value to userId (uuid).
 */
async function loadDeviceSessionViaSupabase(): Promise<LoadSessionResult | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user: supabaseUser } } = await supabase.auth.getUser();
  if (!supabaseUser) return null;

  const cookieStore = await cookies();

  const [realRow] = await db()
    .select({
      accessToken: schema.mcpSessions.accessToken,
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      loginCustomerId: schema.mcpSessions.loginCustomerId,
      userId: schema.mcpSessions.userId,
      googleEmail: schema.mcpSessions.googleEmail,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.userId, supabaseUser.id),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .orderBy(desc(schema.mcpSessions.createdAt))
    .limit(1);

  if (!realRow) return null;

  // Email source-of-truth swap: trust Supabase's email over mcp_sessions.
  // Supabase Auth keeps it current via OIDC; mcp_sessions.googleEmail is
  // a one-time copy that can drift if a user ever reconnects with a
  // different Google identity.
  const googleEmail = supabaseUser.email ?? realRow.googleEmail;

  const row: SessionRow = {
    refreshToken: realRow.refreshToken,
    customerId: realRow.customerId,
    customerIds: realRow.customerIds,
    loginCustomerId: realRow.loginCustomerId ?? null,
    userId: realRow.userId ?? supabaseUser.id,
    googleEmail,
  };

  // Dev impersonation — same int-id semantics as the cookie path. Step 4
  // migrates this cookie value to userId (uuid).
  const impersonateId = cookieStore.get(COOKIE_NAMES.impersonate)?.value;
  if (impersonateId && googleEmail && DEV_EMAILS.includes(googleEmail)) {
    if (!/^\d+$/.test(impersonateId)) {
      return { token: realRow.accessToken, row };
    }
    const sessionId = parseInt(impersonateId, 10);

    const [targetRow] = await db()
      .select({
        accessToken: schema.mcpSessions.accessToken,
        refreshToken: schema.mcpSessions.refreshToken,
        customerId: schema.mcpSessions.customerId,
        customerIds: schema.mcpSessions.customerIds,
        loginCustomerId: schema.mcpSessions.loginCustomerId,
        userId: schema.mcpSessions.userId,
        googleEmail: schema.mcpSessions.googleEmail,
      })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.id, sessionId),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);

    if (!targetRow || !targetRow.customerId) return null;

    return {
      token: targetRow.accessToken,
      row: {
        refreshToken: targetRow.refreshToken,
        customerId: targetRow.customerId,
        customerIds: targetRow.customerIds,
        loginCustomerId: targetRow.loginCustomerId ?? null,
        userId: targetRow.userId ?? null,
        googleEmail: targetRow.googleEmail,
      },
      impersonating: { sessionId, realEmail: googleEmail },
    };
  }

  return { token: realRow.accessToken, row };
}

/**
 * Stage 2: layer Google `ad_platform_connections` fields on top of the
 * mcp_sessions row when `READ_GOOGLE_FROM_CONNECTIONS=true`. Always shadow-
 * reads (and emits `google_connection_mismatch` on diff) so we can validate
 * parity in both flag states.
 *
 * Returns the same `SessionRow` shape so all downstream getters
 * (getSession/getSessionAuth/getAuthContext) stay unchanged.
 */
async function mergeWithConnection(args: {
  result: LoadSessionResult;
  source: string;
}): Promise<LoadSessionResult> {
  const { result, source } = args;
  const userId = result.row.userId;
  if (!userId) return result;

  const conn = await loadGoogleConnection(userId);

  compareForShadowRead({
    userId,
    fromSession: {
      refreshToken: result.row.refreshToken,
      customerId: result.row.customerId,
      customerIds: result.row.customerIds,
      loginCustomerId: result.row.loginCustomerId,
      googleEmail: result.row.googleEmail,
    },
    fromConnection: conn,
    source,
  });

  if (!readGoogleFromConnections() || !conn) return result;

  return {
    ...result,
    row: projectConnectionOntoSessionRow(result.row, conn),
  };
}

function projectConnectionOntoSessionRow(
  base: SessionRow,
  conn: GoogleConnectionView,
): SessionRow {
  return {
    ...base,
    refreshToken: conn.refreshToken,
    customerId: conn.customerId,
    customerIds: stringifyCustomerIds(conn.customerIds),
    loginCustomerId: conn.loginCustomerId,
    // googleEmail keeps falling back to the session row when the connection
    // row doesn't carry it — phase 4 finishes the move once Supabase Auth
    // owns the identity record.
    googleEmail: conn.googleEmail ?? base.googleEmail,
  };
}

function stringifyCustomerIds(accounts: ConnectedAccount[]): string {
  return JSON.stringify(
    accounts.map((a) => ({
      id: a.id,
      name: a.name,
      ...("loginCustomerId" in a ? { loginCustomerId: a.loginCustomerId } : {}),
    })),
  );
}

async function loadSessionRow(source: string): Promise<LoadSessionResult | null> {
  const result = await loadDeviceSession();
  if (!result) return null;
  return mergeWithConnection({ result, source });
}

/**
 * Read display name + avatar from the dedicated profile cookie set by
 * /auth/callback. We can't query Supabase live here because the auth callback
 * deletes all sb-* cookies after a successful sign-in (header-size mitigation),
 * so the Supabase user object isn't available on subsequent requests.
 */
async function readProfileCookie(): Promise<{ displayName: string | null; picture: string | null }> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(COOKIE_NAMES.profile)?.value;
    if (!raw) return { displayName: null, picture: null };
    const parsed = JSON.parse(decodeURIComponent(raw)) as { name?: string | null; picture?: string | null };
    return {
      displayName: parsed.name ?? null,
      picture: parsed.picture ?? null,
    };
  } catch {
    return { displayName: null, picture: null };
  }
}

export async function getSession(): Promise<Session> {
  const result = await loadSessionRow("getSession");
  if (!result) return { connected: false };

  // isDev is always based on the real user's email, not the impersonated one
  const devEmail = result.impersonating?.realEmail ?? result.row.googleEmail;
  // Pull display name + avatar from the profile cookie. Skip when impersonating
  // so the dev viewing someone else's account doesn't see their own profile.
  const profile = result.impersonating
    ? { displayName: null, picture: null }
    : await readProfileCookie();

  // For pending account-selection rows, customerIds stores the candidate set
  // the user can pick from — NOT accounts they've actually selected. Surfacing
  // it would have the navbar's AccountSwitcher pre-show every account they
  // could connect, which looks like they're already managing all of them.
  // The /connect picker reads candidates from the URL; nothing else needs
  // them at this stage.
  const pendingSetup = !result.row.customerId;

  // Pull Meta connection (if any) so the navbar dropdown can offer Meta
  // accounts alongside Google. One extra DB hit per session render —
  // tolerable; the row is keyed by (userId, platform) and uniquely indexed.
  let metaAccounts: { id: string; name: string }[] = [];
  let activeMetaAccountId: string | null = null;
  if (result.row.userId) {
    const [metaRow] = await db()
      .select({
        accountIds: schema.adPlatformConnections.accountIds,
        activeAccountId: schema.adPlatformConnections.activeAccountId,
      })
      .from(schema.adPlatformConnections)
      .where(
        and(
          eq(schema.adPlatformConnections.userId, result.row.userId),
          eq(schema.adPlatformConnections.platform, "meta_ads"),
        ),
      )
      .limit(1);
    if (metaRow) {
      metaAccounts = (metaRow.accountIds ?? []).map((a) => ({
        id: a.id,
        name: a.name || `Ad Account ${a.id}`,
      }));
      activeMetaAccountId = metaRow.activeAccountId ?? null;
    }
  }

  // Resolve which platform's UI the navbar + sidebar should render. The
  // `connections` array order is the priority used when no cookie pick
  // exists — first connected platform wins. To add a new platform later,
  // extend ActivePlatform and append a {platform, connected} entry here.
  const cookieStore = await cookies();
  const rawActivePlatform = cookieStore.get(COOKIE_NAMES.activePlatform)?.value;
  const activePlatform: ActivePlatform = resolveActivePlatform({
    cookie: rawActivePlatform,
    connections: [
      { platform: "google_ads", connected: !pendingSetup && !!result.row.customerId },
      { platform: "meta_ads", connected: metaAccounts.length > 0 },
    ],
  });

  return {
    connected: true,
    pendingSetup,
    token: result.token,
    userId: result.row.userId,
    customerId: result.row.customerId,
    customerName: pendingSetup ? "" : deriveCustomerName(result.row.customerIds),
    customerIds: pendingSetup ? [] : parseCustomerIds(result.row.customerIds),
    metaAccounts,
    activeMetaAccountId,
    activePlatform,
    googleEmail: result.row.googleEmail,
    displayName: profile.displayName,
    picture: profile.picture,
    isDev: !!devEmail && DEV_EMAILS.includes(devEmail),
    ...(result.impersonating && { impersonating: true }),
  };
}

/**
 * Refresh token for the current session, regardless of pendingSetup state.
 * /manage-ads-accounts uses this to re-list connectable Google Ads accounts and decide
 * whether to render the empty-state warning or send the user straight to
 * the picker. Returns null when there's no session at all.
 */
export async function getCurrentRefreshToken(): Promise<string | null> {
  const result = await loadSessionRow("getCurrentRefreshToken");
  return result?.row.refreshToken ?? null;
}

export async function getSessionAuth(): Promise<SessionRow> {
  const result = await loadSessionRow("getSessionAuth");
  // Reject ads-less sessions: callers of getSessionAuth do Google Ads work
  // that requires a real customerId. The user-facing route handlers catch
  // this and bounce the user back to /connect, which is the right behavior
  // for "you signed in but haven't connected an Ads account yet."
  if (!result || !result.row.customerId) throw new Error("Not authenticated");
  return result.row;
}

export async function getAuthContext(): Promise<{ auth: AuthContext; session: SessionRow }> {
  const result = await loadSessionRow("getAuthContext");
  if (!result || !result.row.customerId) throw new Error("Not authenticated");
  return {
    auth: {
      refreshToken: result.row.refreshToken,
      customerId: result.row.customerId,
      customerIds: parseCustomerIds(result.row.customerIds),
      loginCustomerId: result.row.loginCustomerId,
      ...(result.impersonating && { realGoogleEmail: result.impersonating.realEmail }),
    },
    session: result.row,
  };
}
