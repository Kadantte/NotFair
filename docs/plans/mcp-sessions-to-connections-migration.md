# Migration: `mcp_sessions` → `ad_platform_connections` + Supabase Auth

## Status

| Phase | Status |
|---|---|
| 1 — Dual-write Google connection state | ✅ **Complete 2026-05-07** (shipped 2026-05-05, bake concluded after 2 days clean) |
| 2 — Reads + OAuth tokens move to connections | **Code in place behind `READ_GOOGLE_FROM_CONNECTIONS` + `SUPABASE_SESSION_BRIDGE` flags (2026-05-06); both flags off in prod** |
| 3 — Direct-bearer MCP cutoff | Telemetry-only prep shipped 2026-05-06 (`mcp_direct_bearer_used`); cutoff steps not started |
| 4 — Switch web cookie to Supabase Auth | Not started |
| 5 — Drop `mcp_sessions` | Not started |

### Phase 1 — closed out 2026-05-07

- **Deploy commit:** `c74e4da` (`feat(connections): phase-1 dual-write google ads to ad_platform_connections`).
- **Backfill applied:** 437 `ad_platform_connections` rows seeded on deploy (484 live `mcp_sessions` rows → 437 distinct users; 52 ads-less / pending; 47 multi-device duplicates collapsed).
- **Final sweep before phase-2 work:** `pnpm db:backfill-google-connections --apply` on 2026-05-07 — **0 creates**, 474 idempotent updates. Zero drift confirmed independently of the live invariant.
- **Tests:** 1,286 passing (4 new dual-write assertions).
- **Bake outcome:** plan called for ≥7 days; closed early at day 2 on owner judgment after live gates returned clean numbers two days running.

#### Final gate readout (2026-05-07)

| Gate | Result |
|---|---|
| `pnpm db:check-google-connection-invariant` (every live mcp_sessions user has a google_ads connection row) | **0 missing** |
| Active-account consistency (`mcp_sessions.customer_id` vs `ad_platform_connections.active_account_id`) | **0 mismatches** across 543 live sessions |
| Dual-write firing for fresh signups | **20 fresh users on 2026-05-06**, **17 more on 2026-05-07** (each with distinct user_id, no upserts) — proves dual-write is alive for new users at expected volume |
| Final backfill sweep | **0 new rows** to create, 474 no-op refreshes — independent confirmation of gate 1 |

#### Bake-time checklist (closed)

- [x] `pnpm db:check-google-connection-invariant` returns OK — passed days 1 + 2; bake closed early.
- [x] Fresh-signup dual-write firing — 20 + 17 fresh users on days 1 + 2.
- [x] Account-switch consistency — 0 mismatches.
- [x] Final `pnpm db:backfill-google-connections --apply` sweep — 0 creates, 474 no-op upserts (2026-05-07).

## Goal

Retire the `mcp_sessions` table entirely. Move Google Ads connection state to `ad_platform_connections` (where Meta already lives), let Supabase Auth own web sessions, and let `oauth_access_tokens` (RFC 6749) + `oauth_clients` (RFC 7591 DCR) own MCP authentication.

## End state

```
auth.users                  ← Supabase-owned: identity (email, name, picture)
auth.sessions               ← Supabase-owned: web session JWTs (replaces adsagent_token cookie)

ad_platform_connections     ← canonical connection state for both Google + Meta
oauth_clients               ← DCR client metadata (incl. client_name, client_version)
oauth_access_tokens         ← issued MCP tokens, FK → ad_platform_connections.id
authorization_codes         ← DCR auth codes, FK → ad_platform_connections.id
```

No `mcp_sessions`. No `adsagent_token` cookie. Direct-bearer MCP path removed.

## Why this shape

`mcp_sessions` is doing four jobs at once:

1. **Connection state** (`refreshToken`, `customerId`, `customerIds`, `loginCustomerId`, `googleEmail`) — duplicates `ad_platform_connections`.
2. **Web session cookie** (`accessToken`, `expiresAt`) — Supabase Auth handles this natively (we already mint a Supabase session in the callback and throw it away).
3. **Direct-bearer MCP token** (`accessToken` again) — legacy path, predates OAuth 2.0 MCP.
4. **MCP client telemetry** (`clientName`, `clientVersion`) — RFC 7591 DCR records this on `oauth_clients` automatically.

Once OAuth 2.0 is the only MCP path and Supabase owns web sessions, every job above moves to a more appropriate table and `mcp_sessions` has nothing left to do.

## Design decisions (locked)

- **Supabase Auth owns the web session.** `adsagent_token` and the custom rotation endpoint go away.
- **OAuth 2.0 owns MCP.** Direct-bearer (`Authorization: Bearer <hex>`) is cut off in phase 3.
- **No new columns on `ad_platform_connections`.** The schema as-is fits Google:
  - `customerId` → `activeAccountId`
  - `customerIds` (text JSON) → `accountIds` (jsonb), same shape `[{id, name, loginCustomerId?}]`
  - `googleEmail` → `auth.users.email` (Supabase) or `platformMetadata.googleEmail` if needed
  - `loginCustomerId` (top-level) → derived from `accountIds[i].loginCustomerId` via helper
  - `pendingSetup` → derived as `activeAccountId IS NULL`
- **`loginCustomerId` lives only in `accountIds` jsonb.** A central helper (`activeLoginCustomerId(conn)`) reads it; callers consume `AuthContext.loginCustomerId` exactly as today.

## Phase plan

Five phases. Phases 1–2 are the bulk of the work. Phase 3 is the user-facing risk. Phase 4 is the cookie cutover. Phase 5 is the cleanup.

---

### Phase 1 — Dual-write Google connection state to `ad_platform_connections` ✅ SHIPPED

**Status:** shipped on 2026-05-05 in `c74e4da`. In bake — see [Phase 1 progress](#phase-1-progress-as-of-2026-05-05) above.

**Goal:** every write site for `mcp_sessions` Google data also upserts `ad_platform_connections` with `platform = "google_ads"`. Reads still go to `mcp_sessions`. Zero behavior change for users.

#### Field mapping

| `mcp_sessions` (Google) | `ad_platform_connections` |
|---|---|
| `userId` | `userId` (skip dual-write if NULL) |
| `refreshToken` | `refreshToken` |
| `customerId` (`""` ads-less) | `activeAccountId` (NULL ads-less) |
| `customerIds` (text JSON) | `accountIds` (jsonb), same shape |
| `loginCustomerId` (top-level) | embedded per-row in `accountIds[i].loginCustomerId` (already supported) |
| `googleEmail` | `platformMetadata.googleEmail` |
| n/a | `platform: "google_ads"` |
| n/a | `platformMetadata: {}` (extend as needed) |
| `accessToken`, `expiresAt`, `clientName`, `clientVersion` | **stay on `mcp_sessions` only** — device-level fields removed in later phases |

#### Helper

Add `lib/connections/google.ts`:

```ts
export async function upsertGoogleConnection(args: {
  userId: string;
  refreshToken: string;
  activeAccountId: string | null;
  accountIds: ConnectedAccount[];     // [{id, name, loginCustomerId?}]
  googleEmail: string | null;
}): Promise<void>
```

Implementation: `INSERT … ON CONFLICT (userId, platform) DO UPDATE SET …` keyed on `(userId, "google_ads")`. Always wrap caller-side in `db().transaction(...)` with the `mcp_sessions` write so a connection-write failure rolls back both.

#### Call sites to update

| File:Line | Change |
|---|---|
| `app/auth/callback/route.ts` ~339–347 (`mintAdsLessSession`) | Add upsert: `activeAccountId=null`, `accountIds=[]` |
| `app/auth/callback/route.ts` ~432–441 (single-account branch) | Add upsert with full account |
| `app/auth/callback/route.ts` ~497–505 (multi-account pending) | Add upsert: `activeAccountId=null`, full candidate `accountIds` |
| `app/auth/callback/route.ts` ~575–583 (`reuseExistingSession`) | Add upsert: refresh token + email |
| `app/api/auth/select-account/route.ts` ~165–172 | Update `activeAccountId`, `accountIds` |
| `app/api/auth/switch-account/route.ts` ~52–55 | Update `activeAccountId` only |
| `app/api/auth/add-account/route.ts` | Update `accountIds` (append) |
| `app/api/auth/select-account/route.ts` ~175–183 | DELETE duplicate `mcp_sessions`; **do NOT delete the connection row** |
| `app/api/dev/reset-account/route.ts` | DELETE both `mcp_sessions` and the connection |
| `lib/demo/seed.ts`, `app/api/demo/start/route.ts` | Mirror dual-write for demo flows |

`/api/auth/rotate-token` and `lib/mcp/handler-factory.ts:460` (capture `clientName`) write only `mcp_sessions` — pure device-level, no dual-write needed.

#### Backfill

Add `scripts/backfill-google-connections.ts`:

- Iterate `mcp_sessions WHERE userId IS NOT NULL AND expiresAt >= now()`, dedupe by `userId` (most recent row wins).
- For each user: parse `customerIds`, ensure each account record has `loginCustomerId` (fallback to row-level `loginCustomerId` if missing — this is the legacy path documented in `lib/google-ads/types.ts:91–95`).
- Upsert into `ad_platform_connections`.
- Idempotent. Log diffs to a CSV for audit.

Run twice: once mid-phase to seed the historical set, once at the end of phase 1 to catch anything written between (dual-write should have caught it; this is belt-and-braces).

#### Verification gate

CI invariant query — must return `0`:

```sql
SELECT count(*)
FROM mcp_sessions s
LEFT JOIN ad_platform_connections c
  ON c.user_id = s.user_id AND c.platform = 'google_ads'
WHERE s.user_id IS NOT NULL
  AND s.expires_at >= now()::text
  AND c.id IS NULL;
```

Add an integration test that runs the full callback flow and asserts both rows exist with consistent fields.

**Bake time:** ≥1 week of dual-write before moving to phase 2.

#### Estimated scope

2–3 PRs, ~600 LOC. Helper + 7 write-site dual-writes + backfill script + invariant check + tests.

---

### Phase 2 — Reads + OAuth tokens move to `ad_platform_connections`

**Goal:** `lib/session.ts` reads Google connection state from `ad_platform_connections`. New OAuth tokens for Google use `connectionId` (not `sessionId`). Supabase session bridge starts running alongside `adsagent_token`.

#### Phase 2 progress (as of 2026-05-06)

Connection-read + token-binding work landed behind `READ_GOOGLE_FROM_CONNECTIONS` (default off). Flag flip is gated on phase-1 bake completion (≥2026-05-12) plus a clean shadow-read week.

What shipped:

- `lib/connections/feature-flags.ts` — `readGoogleFromConnections()` predicate sourcing from `READ_GOOGLE_FROM_CONNECTIONS` env var.
- `lib/connections/google-read.ts` — `loadGoogleConnection(userId)` projects `ad_platform_connections` into the legacy SessionRow shape; `activeLoginCustomerIdFor` derives session-level loginCustomerId; `compareForShadowRead` emits PostHog `google_connection_mismatch` (kind: `missing_connection_row` or `field_diff`) with fingerprinted refresh tokens and per-field diffs.
- `lib/session.ts` — split into `loadDeviceSession` (mcp_sessions, cookie + impersonation) and `mergeWithConnection` (ad_platform_connections). Always shadow-reads on every session-load surface (`getSession`, `getSessionAuth`, `getAuthContext`, `getCurrentRefreshToken`); flag-on swaps source of truth, flag-off keeps mcp_sessions reads but still emits mismatches.
- `app/api/auth/select-account/route.ts`, `app/api/auth/switch-account/route.ts` — flag-on reads candidate accountIds from the connection row; flag-off keeps reading from mcp_sessions. Both routes now shadow-read the full session/connection diff (extended SELECTs to pull `loginCustomerId` + `googleEmail` for parity comparison).
- `app/api/oauth/token/route.ts` — flag-on translates Google sessionId-bound auth codes to connectionId-bound tokens at exchange time. The auth code itself is left alone (10-min TTL); the issued `oauth_access_tokens` row gets `connectionId` set / `sessionId = NULL`. `oauth_clients.session_id` UPDATE is skipped on translated rows so we don't write a connection id into an mcp_sessions FK. Falls back to sessionId binding when no connection row exists for the user (logs gap, doesn't block exchange). Token-prefix selection unchanged.
- `lib/mcp/handler-factory.ts` — Google branch now resolves bindings dual-aware. SELECT-then-branch on the token row: `connectionId !== null` → JOIN `ad_platform_connections` and build `AuthContext` directly (mirrors Meta path); `sessionId !== null` → existing mcp_sessions JOIN + expiry check. Audience check (Google vs Meta platform) runs before either branch. Time-based expiry on the connectionId path is intentionally not enforced — connection-bound Google tokens are revocable via row deletion only, matching Meta's behavior (see "expiresAt semantics" below).
- Tests: 15 new `google-read.test.ts` (projection, derivation, shadow-read), 4 new `oauth-token-route.test.ts` cases for translation (flag-on success, missing-connection fallback, null-userId no-translate, flag-off legacy). Full suite: 1308 passing.
- **Verified locally** with a 16-cell matrix (4 token variants × 2 routes × 2 flag states): both Google prefixes (`oat_*`, `oat_google_ads_*`) × both bindings (sessionId, connectionId) × both routes (`/api/mcp`, `/api/mcp/google_ads`) × flag on/off — all 16 return 200 against a real prod connection.

Supabase bridge scaffolding (commit `db3ef7c`):

- `lib/supabase/refresh-session.ts` — request-scoped helper; calls `supabase.auth.getUser()` to rotate `sb-*` cookies before the access token expires. No-op when no `sb-*` cookies present (the default state today).
- `lib/supabase/middleware.ts` (existing `updateSession`) — invokes the refresh helper on protected paths when `SUPABASE_SESSION_BRIDGE=true`. Flag-off path keeps the current behavior (one fewer Supabase round-trip per request).
- `app/auth/callback/route.ts` — gates the `clearSupabaseCookies` calls (success path + scope-failure path) behind the flag. When on, `sb-*` cookies survive the callback; when off, the 8KB-header-mitigation deletion that prevented HTTP 431 errors stays in place.
- Boot-tested under both flag states; `/api/health` returns 200 in both.

What's still pending in phase 2:

- **`lib/session.ts` dual-read** — prefer Supabase user_id from the refreshed `sb-*` session, fall back to `adsagent_token` → `mcp_sessions.userId`. Deferred from the scaffolding PR because it's inert until the bridge flag is actually live; landing it now would just add dead code paths. Will land alongside the prod flag flip.
- **Header-size audit** — measure aggregate cookie size on a real session before flipping `SUPABASE_SESSION_BRIDGE` in prod. Adding `sb-*` (~1–2KB) on top of `adsagent_*` cookies could re-trigger the original HTTP 431 incident.
- **Flag rollout**: flip on staging post-bake, monitor `google_connection_mismatch` event count for ≥1 week, then flip in prod. Any non-zero `field_diff` count is a dual-write gap that must be fixed before proceeding.

Explicitly **not** in scope for phase 2 (or this migration at all): a token-level `expires_at` on `oauth_access_tokens`. The earlier plan flagged this as a phase-2 follow-up; on closer reading of phase 5 it isn't a blocker (the cleanup script force-deletes orphaned sessionId-only tokens directly). Connection-bound Google tokens become revocation-only, same as Meta. If hard TTLs are wanted later, do them platform-wide as a standalone change.



#### `lib/session.ts` refactor

Today: `loadSessionRow()` (line 63) loads everything from `mcp_sessions` by cookie token.

After: Split into two stages.

```ts
// Stage 1: identify the user (still cookie-driven this phase)
const { userId, deviceFields } = await loadDeviceSession(token);

// Stage 2: load both platforms' connections
const conns = await loadConnections(userId);  // single query, both platforms

// Stage 3: merge into Session
return mergeSession(deviceFields, conns);
```

The merged `Session` shape stays identical — callers don't change. What changes is the source of `customerId`/`customerIds`/`loginCustomerId`/`refreshToken`/`googleEmail` (now from the Google connection row, not the session row).

`pendingSetup` becomes `!googleConn?.activeAccountId`.

`auth.loginCustomerId` is populated via:

```ts
function activeLoginCustomerId(conn: AdPlatformConnection): string | null {
  return conn.accountIds.find(a => a.id === conn.activeAccountId)?.loginCustomerId ?? null;
}
```

#### `oauth_access_tokens` polymorphism flip (Google side)

Migration 0032 already supports `connectionId` (XOR with `sessionId`). Today Meta uses `connectionId`, Google uses `sessionId`.

Note on Google token prefixes: Google has **two** live prefixes, both bound to `mcp_sessions` today. Phase 2 flips both to `connectionId`-binding; prefix-selection logic is untouched.

| Prefix | Resource path | Origin |
|---|---|---|
| `oat_` (legacy) | `/api/mcp` | Pre-multi-platform Claude clients that registered before platform-explicit paths existed. Kept forever for back-compat. |
| `oat_google_ads_` | `/api/mcp/google_ads` | New platform-explicit path; stamped when the auth code carries `resource=/api/mcp/google_ads`. |

The prefix is derived from the auth code's `resource_url` in `app/api/oauth/token/route.ts:255–264` — independent of which table the token binds to.

Phase 2 changes:

- `app/api/oauth/token/route.ts` — when issuing a Google token (either prefix), set `connectionId` (looked up from `ad_platform_connections` by `userId + platform="google_ads"`), leave `sessionId = NULL`. Token-prefix selection is unchanged.
- `lib/mcp/handler-factory.ts:250–287` — change the Google JOIN from `oauth_access_tokens.sessionId → mcp_sessions` to `oauth_access_tokens.connectionId → ad_platform_connections`. Applies to both Google resource entries in `MCP_RESOURCES` (`/api/mcp` and `/api/mcp/google_ads`). Returns the same `AuthContext` shape (refreshToken, customerId, customerIds, loginCustomerId, userId).
- Existing tokens with `sessionId` set — both flavors — keep working: make the JOIN dual-aware. If `connectionId` is set use it, else fall back to `sessionId`. Existing tokens roll over via natural expiry (1 year) or get force-revoked at the start of phase 5.

#### Supabase session bridge

Today `app/auth/callback/route.ts` calls `supabase.auth.signInWithIdToken()` and discards the returned session.

Phase 2 changes:

- Install `@supabase/ssr` (if not already present), add `createServerClient` helpers.
- Add a Next.js middleware (or per-route helper) that calls `supabase.auth.getSession()` and refreshes cookies on every request. Vercel-friendly pattern: `middleware.ts` at the repo root.
- In the callback, **persist** the Supabase session — set the `sb-<project>-auth-token` cookie alongside the existing `adsagent_token`.
- `lib/session.ts` now has two paths to find `userId`:
  1. Supabase session cookie (preferred)
  2. `adsagent_token` → `mcp_sessions.userId` (fallback for users who haven't re-signed-in this phase)

This is the dual-auth window. Both cookies live side by side.

#### Read-site updates

| File:Line | Today | After |
|---|---|---|
| `app/api/oauth/token/route.ts` ~189–198 | reads `mcp_sessions.expiresAt` for token-exchange validity | also accept `ad_platform_connections` row as the binding target — for new tokens, expiry comes from `oauth_access_tokens.expiresAt` (already on the row) |
| `lib/mcp/handler-factory.ts` ~250–287 (Google OAuth path) | JOIN to `mcp_sessions` | JOIN to `ad_platform_connections` (with fallback for legacy tokens) |
| `lib/mcp/handler-factory.ts` ~289–302 (direct bearer) | reads `mcp_sessions` row | unchanged — still works during phase 2 |
| `app/api/auth/select-account/route.ts` ~76–87 | reads `mcp_sessions.customerIds` for candidate set | reads `ad_platform_connections.accountIds` |
| `app/api/auth/switch-account/route.ts` ~27–40 | validates against `mcp_sessions.customerIds` | validates against `ad_platform_connections.accountIds` |

#### Rollout

Behind env flag `READ_GOOGLE_FROM_CONNECTIONS=true`:

1. Deploy with flag off — code present but inert. Verify dual-write still healthy.
2. Enable in staging. Run shadow-read for one deploy: read both, log mismatches via PostHog event `google_connection_mismatch`. Fix any drift.
3. Enable in prod. Keep dual-write running in case rollback needed.

**Bake time:** ≥1 week of clean reads from connections before moving to phase 3.

#### Estimated scope

2–3 PRs, ~800 LOC. `lib/session.ts` refactor + handler-factory changes + Supabase middleware + flag-gated rollout + shadow-read instrumentation.

---

### Phase 3 — Direct-bearer MCP cutoff

**Goal:** stop accepting `Authorization: Bearer <hex>` (the `mcp_sessions.accessToken` cookie value as MCP bearer). Force all MCP traffic onto OAuth 2.0.

This is the riskiest phase because it can break working Claude Code installs that have the cookie value baked into `~/.mcp-settings.json`.

#### Phase 3 progress (as of 2026-05-06)

- **Step 1 (telemetry) shipped early** to run during phase-1/2 bake. `mcp_direct_bearer_used` event fires on every successful direct-bearer auth in `lib/mcp/handler-factory.ts`'s `acceptDirectBearer` branch. Properties: `client_name` (raw, unnormalized), `client_version`, `resource_url`, `platform`, `user_agent`. Distinct id = `userId` (or anonymous for null-userId rows). No behavior change. Build a PostHog dashboard grouping by `client_name` to size the migration cohort before step 2.

#### Steps

1. **Telemetry first.** Add a PostHog event `mcp_direct_bearer_used` in `lib/mcp/handler-factory.ts:289–302` capturing `userId`, `clientName`, request path. Run for ≥1 week to find affected users. ✅ Shipped 2026-05-06.
2. **Build a one-click migration endpoint.** `POST /api/migrate-mcp-token`:
   - Authenticated via existing `adsagent_token` cookie or direct bearer.
   - Looks up the user's `ad_platform_connections.id` (Google).
   - Mints an `oat_google_ads_*` token bound to that connection (insert into `oauth_access_tokens` with `connectionId`).
   - Returns the new token + setup instructions.
3. **In-app banner.** For users seen using direct bearer in the last 30d, show a dismissible banner: "Your MCP setup needs a one-time refresh. [Click here]." Banner triggers the migration endpoint and shows the new token with copy-to-clipboard.
4. **Email + 2–4 week notice.** Send to affected users with the same migration URL.
5. **Stop accepting direct bearer.** Set `acceptDirectBearer: false` on `/api/mcp` (handler-factory.ts:289–302). Direct-bearer requests now 401 with `WWW-Authenticate: Bearer realm="ads-agent", error="invalid_token", error_description="Direct bearer auth removed; visit notfair.co/migrate-mcp"`.
6. **Wait for zero-direct-bearer signal.** PostHog event count goes to zero for 1 week. Then proceed.

#### Verification

PostHog dashboard: `mcp_direct_bearer_used` daily count → must trend to 0 before phase 4.

#### Estimated scope

2 PRs, ~300 LOC. Telemetry + migration endpoint + banner + handler change.

---

### Phase 4 — Switch web cookie to Supabase Auth

**Goal:** `lib/session.ts` no longer reads `adsagent_token`. Every server-side caller of `getSession()` reads userId from the Supabase session cookie.

Phase 2 already set up the bridge. This phase finishes the move.

#### Code changes

| File | Change |
|---|---|
| `lib/session.ts` | Drop `loadSessionRow()` cookie path; userId comes only from Supabase session. |
| `lib/auth-cookies.ts` | Remove `adsagent_token` constant + helpers. |
| `app/auth/callback/route.ts` | Stop creating `mcp_sessions` rows for new web logins. Stop setting `adsagent_token`. (Still upserts `ad_platform_connections`.) |
| `app/api/auth/rotate-token/route.ts` | **Delete the route** — Supabase rotates refresh tokens natively. |
| `app/api/auth/signout/route.ts` | Replace cookie-clearing with `supabase.auth.signOut()`. |
| `lib/session.ts` (profile cookie) | Drop `adsagent_profile`. Read `displayName`/`picture` from `auth.users.user_metadata` (Google identity provider populates these). |
| `lib/session.ts` (impersonation) | `adsagent_impersonate` cookie value changes from `mcp_sessions.id` (int) to `userId` (uuid). Update dev impersonation lookup accordingly. |
| `lib/auth-cookies.ts` | Drop `adsagent_customer` cookie — derive customer name from connection on render. |

#### Forced re-auth

Users whose Supabase session expired during the phase 2 → 4 window get redirected to `/login`. Acceptable cost; communicate via banner if measurable.

#### What stays

- `adsagent_active_platform` (UI state, not auth)
- `adsagent_last_attempt_email` (5-minute error display)

#### OAuth `/authorize` flow

Today `/api/oauth/authorize` reads `adsagent_token` to identify who's authorizing. After phase 4 it reads the Supabase session. Make sure the Supabase cookie is set before this phase ships — phase 2's bridge handles that.

#### Estimated scope

1–2 PRs, ~400 LOC. Bulk of LOC is rewiring `lib/session.ts` + every server route that reads it.

---

### Phase 5 — Drop `mcp_sessions`

**Goal:** delete the table and all dead code referencing it.

By phase 5 nothing reads or writes `mcp_sessions`. `oauth_access_tokens` may still have legacy rows with `sessionId` set (from phase 2 fallback) — clean those up first.

#### Pre-cleanup

```sql
-- Force-revoke remaining legacy Google tokens (sessionId-only, no connectionId)
DELETE FROM oauth_access_tokens
WHERE session_id IS NOT NULL AND connection_id IS NULL;

DELETE FROM authorization_codes
WHERE session_id IS NOT NULL AND connection_id IS NULL;
```

(Affected users will need to re-do OAuth in their MCP client — phase 3's migration handled the bulk; this catches the long-tail.)

#### Schema cleanup

```sql
-- oauth_access_tokens: drop sessionId
ALTER TABLE oauth_access_tokens DROP COLUMN session_id;
ALTER TABLE oauth_access_tokens ALTER COLUMN connection_id SET NOT NULL;
ALTER TABLE oauth_access_tokens DROP CONSTRAINT oauth_access_tokens_xor_check;

-- authorization_codes: same
ALTER TABLE authorization_codes DROP COLUMN session_id;
ALTER TABLE authorization_codes ALTER COLUMN connection_id SET NOT NULL;
ALTER TABLE authorization_codes DROP CONSTRAINT authorization_codes_xor_check;

-- oauth_clients: drop legacy sessionId (pre-bound DCR clients, removed 2026-04)
ALTER TABLE oauth_clients DROP COLUMN session_id;

-- operations: drop sessionId (use userId for "who")
ALTER TABLE operations DROP COLUMN session_id;

-- Take logical backup before this:
DROP TABLE mcp_sessions;
```

#### Code cleanup

- `lib/db/schema.ts` — remove `mcpSessions` export and references.
- Delete dead helpers: anything in `lib/auth-cookies.ts` for `adsagent_token`, profile-cookie helpers in `lib/session.ts`, the (now-deleted) rotate-token route.
- Delete tests that exclusively cover `mcp_sessions` plumbing.
- Grep for `mcp_sessions`, `mcpSessions`, `adsagent_token` — should be zero hits.

#### Estimated scope

1 PR, ~200 LOC of deletions + 1 Drizzle migration.

---

## Cross-cutting concerns

### Multi-device behavior change

Today: each browser/device gets its own `mcp_sessions` row; `customerId` is per-row, so device A and device B can have different active accounts.

After migration: `ad_platform_connections.activeAccountId` is per-(user, platform); switching account on device A switches it on device B too. Same as Meta works today.

This is a UX change worth flagging. If per-device active account is a real requirement, add `device_active_account_overrides` (userId, platform, deviceId, accountId) later. Don't block this migration on it.

### Cookie size

Supabase JWTs are ~1–2KB; with both access + refresh cookies + display state you can flirt with the 4KB header limit on Vercel. Audit cookie size after phase 2 ships.

### `expiresAt` semantics — accepted state, not a phase blocker

Pre-migration, Google MCP tokens implicitly expired by JOINing to `mcp_sessions.expiresAt` (sliding 1yr). Meta tokens have never had a time-based expiry — the resolver does no expiry check on `oauth_access_tokens` for Meta. Phase 2 lands connectionId-bound Google tokens in the same shape as Meta: revocable via row deletion, no time-based ceiling.

This is a mild security drift on Google (loss of implicit 1yr ceiling) in exchange for parity with Meta. Phase 5 does NOT depend on a token-level `expiresAt` column — its cleanup script `DELETE FROM oauth_access_tokens WHERE session_id IS NOT NULL AND connection_id IS NULL` removes orphaned legacy tokens directly, so there's nothing left to enforce expiry against once `mcp_sessions` is dropped.

If we later want hard TTLs on MCP tokens, do it as a standalone change covering **both** Google and Meta in one go — not as part of this migration. Adding `expires_at` to only Google would re-introduce the cross-platform inconsistency we just removed.

### Operations table

`operations.sessionId` is the only outbound reference that meaningfully tracks "which client did this." Drop it in phase 5 — `userId` is good enough for "who," and we have audit/log infrastructure elsewhere for "which client" (PostHog events, DCR `client_name`).

## Rollback plan

| Phase | Rollback |
|---|---|
| 1 | Revert dual-write code. Orphan `ad_platform_connections` rows are harmless. |
| 2 | Flip `READ_GOOGLE_FROM_CONNECTIONS=false`. Dual-write still running, reads fall back to `mcp_sessions`. |
| 3 | Re-enable `acceptDirectBearer: true`. Existing `mcp_sessions.accessToken` values still valid. |
| 4 | Restore `adsagent_token` minting in callback + restore `lib/session.ts` cookie fallback. Risk: users who re-auth during phase 4 will not have `mcp_sessions` rows; they'll need to log in again on rollback. |
| 5 | **Irreversible without a restore.** Take a logical backup of `mcp_sessions`, `oauth_access_tokens.session_id`, `authorization_codes.session_id`, `oauth_clients.session_id`, `operations.session_id` immediately before the drop. Plan: 7-day point-in-time recovery window in Supabase. |

## Risks summary

1. **Direct-bearer holdouts** (phase 3) — non-zero users will ignore migration banners. Hard cutoff date + clear error message + email needed.
2. **Supabase middleware refresh** (phase 2) — adds latency to every request. Benchmark before/after on a representative route.
3. **Cookie size** (phase 2) — Vercel 4KB header limit. Audit.
4. **Dev impersonation** keys off `mcp_sessions.id` — repointable to `userId`, but easy to miss. Catch in phase 4 review.
5. **Per-device active account regression** — flag during phase 2 review; decide whether to add overrides.

## Estimated total scope

| Phase | LOC | PRs | Bake time |
|---|---|---|---|
| 1 | ~600 | 2–3 | 1 week |
| 2 | ~800 | 2–3 | 1 week |
| 3 | ~300 | 2 | 2–4 weeks (user notice) |
| 4 | ~400 | 1–2 | 1 week |
| 5 | ~200 | 1 | — |
| **Total** | **~2,300** | **8–11** | **~6–8 weeks** |

## What shipped in phase 1 (`c74e4da`)

- `lib/connections/google.ts` — three helpers: `upsertGoogleConnection`, `refreshGoogleConnectionCredentials` (preserves curation), `setGoogleConnectionActiveAccount`.
- `lib/db/schema.ts` — type-only extension to `accountIds` jsonb adding `loginCustomerId?: string \| null` per row (no migration; jsonb is permissive).
- Dual-write at every Google `mcp_sessions` write site, each wrapped in `db().transaction()`:
  - `app/auth/callback/route.ts` — `mintAdsLessSession`, single-account, multi-account-pending, `reuseExistingSession`.
  - `app/api/auth/select-account/route.ts` — curated selection mirror.
  - `app/api/auth/switch-account/route.ts` — `activeAccountId` flip via `setGoogleConnectionActiveAccount`.
- `scripts/backfill-google-connections.ts` — dry-run by default, `--apply` to persist; idempotent on `(user_id, platform)`.
- `scripts/check-google-connection-invariant.ts` — exits 1 if any live `mcp_sessions` user lacks a matching `google_ads` connection row.
- npm scripts: `db:backfill-google-connections`, `db:check-google-connection-invariant`.
- Tests: extended `auth-callback.test.ts` and `select-account-route.test.ts` with dual-write assertions.

## Next action

Run the bake-time checklist (top of doc) for ≥7 days. When all gates are green, kick off [Phase 2](#phase-2--reads--oauth-tokens-move-to-ad_platform_connections).
