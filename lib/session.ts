import "server-only";

import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq, gte, and, desc } from "drizzle-orm";
import { COOKIE_NAMES, type ActivePlatform } from "@/lib/auth-cookies";
import { deriveCustomerName, parseCustomerIds, type AuthContext, type ConnectedAccount } from "@/lib/google-ads";
import { DEV_EMAILS } from "@/lib/dev-access";
import { resolveActivePlatform } from "@/lib/active-platform";
import { loadGoogleConnection } from "@/lib/connections/google-read";
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
 * Identify the user via Supabase Auth cookies (refreshed per protected
 * request by `lib/supabase/middleware.ts`), then load Google connection
 * state from `ad_platform_connections`.
 *
 * Touches `mcp_sessions` only for:
 *   - The optional `Session.token` (surfaced on /connect for direct-bearer
 *     setup display, which is the frozen legacy cohort we keep serving).
 *   - Dev impersonation, which still uses `mcp_sessions.id` cookie values
 *     (slated to move to userId, see [phase-4-step-4 in migration doc]).
 */
async function loadSessionRow(): Promise<LoadSessionResult | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user: supabaseUser } } = await supabase.auth.getUser();
  if (!supabaseUser) return null;

  let userId = supabaseUser.id;
  let googleEmail: string | null = supabaseUser.email ?? null;
  let impersonating: LoadSessionResult["impersonating"] | undefined;

  // Dev impersonation — still uses `mcp_sessions.id` (int) cookie values.
  // Resolve the target's userId + email from mcp_sessions, then proceed
  // with the connection lookup against the *target* user. Step 4 migrates
  // the impersonate cookie to userId (uuid) which removes this lookup.
  const cookieStore = await cookies();
  const impersonateId = cookieStore.get(COOKIE_NAMES.impersonate)?.value;
  if (
    impersonateId
    && googleEmail
    && DEV_EMAILS.includes(googleEmail)
    && /^\d+$/.test(impersonateId)
  ) {
    const sessionId = parseInt(impersonateId, 10);
    const [targetRow] = await db()
      .select({
        userId: schema.mcpSessions.userId,
        googleEmail: schema.mcpSessions.googleEmail,
        customerId: schema.mcpSessions.customerId,
      })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.id, sessionId),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);

    if (!targetRow || !targetRow.userId || !targetRow.customerId) {
      // Target session missing or ads-less — never let a dev impersonate a
      // placeholder session, the whole point is to read real ads data.
      return null;
    }

    impersonating = { sessionId, realEmail: googleEmail };
    userId = targetRow.userId;
    googleEmail = targetRow.googleEmail;
  }

  // Connection is the source of truth for Google ads state.
  const conn = await loadGoogleConnection(userId);

  // Optional `mcp_sessions` lookup for `Session.token` — surfaced on /connect
  // for direct-bearer Bearer-token setup. The direct-bearer cohort is
  // intentionally preserved (scope change 2026-05-07); a missing row degrades
  // cleanly (UI hides the direct-bearer block).
  const [legacyTokenRow] = await db()
    .select({ accessToken: schema.mcpSessions.accessToken })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.userId, userId),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .orderBy(desc(schema.mcpSessions.createdAt))
    .limit(1);

  const row: SessionRow = conn
    ? {
        refreshToken: conn.refreshToken,
        customerId: conn.customerId,
        customerIds: stringifyCustomerIds(conn.customerIds),
        loginCustomerId: conn.loginCustomerId,
        userId,
        // Supabase email beats connection metadata (current via OIDC).
        googleEmail: googleEmail ?? conn.googleEmail,
      }
    : {
        refreshToken: "",
        customerId: "",
        customerIds: "[]",
        loginCustomerId: null,
        userId,
        googleEmail,
      };

  return {
    token: legacyTokenRow?.accessToken ?? "",
    row,
    ...(impersonating ? { impersonating } : {}),
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
  const result = await loadSessionRow();
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
  const result = await loadSessionRow();
  return result?.row.refreshToken ?? null;
}

export async function getSessionAuth(): Promise<SessionRow> {
  const result = await loadSessionRow();
  // Reject ads-less sessions: callers of getSessionAuth do Google Ads work
  // that requires a real customerId. The user-facing route handlers catch
  // this and bounce the user back to /connect, which is the right behavior
  // for "you signed in but haven't connected an Ads account yet."
  if (!result || !result.row.customerId) throw new Error("Not authenticated");
  return result.row;
}

export async function getAuthContext(): Promise<{ auth: AuthContext; session: SessionRow }> {
  const result = await loadSessionRow();
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
