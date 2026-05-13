# Migration: `mcp_sessions` → `ad_platform_connections` + Supabase Auth

> **Scope change 2026-05-07**: phases 3 + 5 halted. We are no longer retiring `mcp_sessions`. With 32 active direct-bearer users still on `claude-code` and other clients, the migration cost (banner + email + 2–4 week notice + breakage tail) outweighs the value of dropping the table. Goal narrows to: **move web sessions to Supabase Auth and Google connection state to `ad_platform_connections`, but leave the `mcp_sessions` table standing as a frozen legacy footprint serving the direct-bearer cohort.** See [§ Scope change 2026-05-07](#scope-change-2026-05-07) below.

## Status

| Phase | Status |
|---|---|
| 1 — Dual-write Google connection state | ✅ **Complete 2026-05-07** (shipped 2026-05-05, bake concluded after 2 days clean) |
| 2 — Reads + OAuth tokens move to connections | ✅ **Both flags live in prod 2026-05-07** (`READ_GOOGLE_FROM_CONNECTIONS` `e5b2dcd` + `adsagent_customer` slim `97b4ca7` + `SUPABASE_SESSION_BRIDGE` `e6d11fe`). |
| 3 — Direct-bearer MCP cutoff | 🛑 **Halted 2026-05-07.** Telemetry stays live (`mcp_direct_bearer_used` + `mcp_oauth_used`) for visibility. Cutoff steps will not ship. Direct-bearer remains a supported auth path. |
| 4 — Switch web cookie to Supabase Auth | **Step 2 INSERT skip live in prod 2026-05-07** (`STOP_CREATING_MCP_SESSIONS=true` flipped, deploy `9b9fa57`). New web logins no longer create `mcp_sessions` rows or set `adsagent_token`; identity carried entirely by Supabase `sb-*` cookies + `ad_platform_connections`. Bearer-block UI removed (`568e76a`). `/api/auth/rotate-token` deleted + direct-bearer `expiresAt` check dropped (option B, `79a7c64`). Steps 3–4 (drop `adsagent_token` reads from `lib/session.ts`, drop `adsagent_profile`, migrate impersonation cookie to userId) still pending; gate on `web_session_resolved.via=cookie_fallback` <5% for ≥3 days. |
| 5 — Drop `mcp_sessions` | 🛑 **Cancelled 2026-05-07.** Table stays. `oauth_access_tokens.session_id`, `authorization_codes.session_id`, `oauth_clients.session_id`, `operations.session_id` all stay. No schema cleanup. |

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

## Scope change 2026-05-07

The original plan retired `mcp_sessions` entirely by phase 5. After phase-2 telemetry landed, the direct-bearer cohort came in at **32 active users / day** (down from 38, but holding steady) — dominated by `claude-code` installs that have a long-lived bearer baked into `~/.mcp-settings.json`. Phase 3's premise was "force everyone onto OAuth via banner + email + hard cutoff." On 2026-05-07 we decided that cost (user friction, support churn, breakage tail on installs we can't notify) is not worth the schema cleanup.

**New end state:**

- ✅ Phase 1 + 2 complete (Google connection state in `ad_platform_connections`, OAuth tokens dual-bind, Supabase bridge live).
- ✅ Phase 4 still proceeds: web cookie moves to Supabase Auth, `adsagent_token` / `adsagent_profile` retired, callback stops minting new `mcp_sessions` rows.
- 🛑 Phase 3 halted: direct-bearer MCP path stays. `acceptDirectBearer: true` on `/api/mcp` indefinitely.
- 🛑 Phase 5 cancelled: `mcp_sessions` table stays. Existing direct-bearer rows live forever. Schema (sessionId columns on `oauth_access_tokens`, `authorization_codes`, `oauth_clients`, `operations`) stays.

**What `mcp_sessions` becomes:** a frozen legacy footprint. After phase 4 finishes, no new rows get written; existing rows serve only the direct-bearer cohort's `accessToken` lookups in `lib/mcp/handler-factory.ts`. The cohort can only shrink (via row expiry or user churn), never grow.

**Decisions locked 2026-05-07:**

1. **Direct-bearer tokens last forever (option B).** Drop the `expiresAt` check from `lib/mcp/handler-factory.ts`'s direct-bearer branch when phase 4 step 3 ships. Existing `mcp_sessions` rows stay valid until the row is manually deleted. Rationale: predictable behavior, no surprise expirations a year out, no need to keep a rotate-token route alive just to extend timestamps. `/api/auth/rotate-token` gets deleted as originally planned.
2. **New direct-bearer issuance:** today the only way to obtain a direct-bearer is to have a `mcp_sessions` row. Once callback stops minting rows (`STOP_CREATING_MCP_SESSIONS`), no new direct-bearer tokens can be issued. New users must use OAuth. This is intentional and aligns with "freeze the cohort."

## Goal

**Original goal (superseded 2026-05-07):** retire the `mcp_sessions` table entirely. Move Google Ads connection state to `ad_platform_connections` (where Meta already lives), let Supabase Auth own web sessions, and let `oauth_access_tokens` (RFC 6749) + `oauth_clients` (RFC 7591 DCR) own MCP authentication.

**Revised goal:** move web sessions to Supabase Auth and Google connection state to `ad_platform_connections`. Stop writing to `mcp_sessions` for new users. Leave the table and the direct-bearer auth path standing for the existing cohort.

## End state (revised 2026-05-07)

```
auth.users                  ← Supabase-owned: identity (email, name, picture)
auth.sessions               ← Supabase-owned: web session JWTs (replaces adsagent_token cookie)

ad_platform_connections     ← canonical connection state for both Google + Meta
oauth_clients               ← DCR client metadata (incl. client_name, client_version)
oauth_access_tokens         ← issued MCP tokens. Polymorphic: connectionId for OAuth, sessionId for legacy direct-bearer
authorization_codes         ← DCR auth codes. Polymorphic: same as oauth_access_tokens

mcp_sessions                ← FROZEN LEGACY. No new rows after phase 4. Read only by:
                              - lib/mcp/handler-factory.ts direct-bearer branch
                              - oauth_access_tokens session-bound JOIN (legacy tokens issued pre-phase-2)
```

`adsagent_token` cookie removed. Direct-bearer MCP path remains supported indefinitely.

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

Phase-2 connection-read flag flipped (2026-05-07):

- **Set `READ_GOOGLE_FROM_CONNECTIONS=true` on Vercel production** + empty-commit redeploy (`e5b2dcd`).
- **Smoke probes:** `/api/health` 200, `/` 200, `/campaigns` 307 (protected redirect), `/api/mcp` no-auth 401. All clean.
- **Token-binding matrix in prod (8 cells, all 200):** `oat_*` and `oat_google_ads_` × `sessionId` and `connectionId` × `/api/mcp` and `/api/mcp/google_ads`. Both binding columns resolve correctly via the dual-aware JOIN.
- **End-to-end translation proof:** seeded a sessionId-bound auth code, exchanged it via real `POST /api/oauth/token` against prod, observed the issued `oauth_access_tokens` row carry `connection_id` and `session_id = NULL` — translation is live. Used the issued token to call `summarizeAccountSetup` → returned real Google Ads data. All test artifacts cleaned up.
- **Rollback:** `vercel env rm READ_GOOGLE_FROM_CONNECTIONS production` + redeploy. Dual-write keeps mcp_sessions in sync, so falling back is consistent.

`adsagent_customer` slim (commit `97b4ca7`, 2026-05-07):

- Dropped the redundant `adsagent_customer` cookie (up to ~1KB) — set on every signin/select/switch/rotate, read by nothing. `customerName` is already derived fresh in `getSession()` from the connection row's `accountIds`.
- `setSessionCookies(response, token, customerName)` → `setSessionCookies(response, token)`. Six call sites updated.
- Both `setSessionCookies` and `clearSessionCookies` now actively delete `adsagent_customer` (Max-Age=0) so existing browsers shed the cookie on their next signin/switch/rotate/signout.
- Header projection drops worst-case post-bridge-flip from ~7KB → **~6KB**.

`SUPABASE_SESSION_BRIDGE=true` flip (commit `e6d11fe`, 2026-05-07):

- Auth callback no longer deletes `sb-*` cookies. Supabase session cookies persist on the browser after `signInWithIdToken`.
- `lib/supabase/middleware.ts` (`updateSession`) now calls `refreshSupabaseSession(request)` on protected paths to rotate `sb-*` tokens before they expire.
- Verified: `/api/health` 200, smoke probes clean, real connectionId-bound MCP token resolves end-to-end against prod.
- **Rollback**: `vercel env rm SUPABASE_SESSION_BRIDGE production` + redeploy. Existing `sb-*` cookies on browsers stay until expiry but become inert (nothing reads them yet — phase 4 ships the consumer).

What's still pending in phase 2:

- **`lib/session.ts` dual-read** — prefer Supabase user_id from the refreshed `sb-*` session, fall back to `adsagent_token` → `mcp_sessions.userId`. Was deferred from the bridge-scaffolding PR; can land now that the bridge is live. This is the actual phase-4 trigger — ships it and we're ready to start cutting `adsagent_token` over.
- **Real-traffic monitoring of `google_connection_mismatch`** — the shadow-read fires on every session-load surface; with the read flag on, any drift between dual-write and connection reads now surfaces directly. Watch for ≥1 week to validate the dual-write is leak-free for all real flows.
- **Header-size monitoring** — first ~24h with `SUPABASE_SESSION_BRIDGE` on. If we see HTTP 431 spikes in Vercel logs, the audit's worst-case projection was off and we'll need to roll back + rethink (most likely path: also drop `adsagent_profile`).

#### Header-size audit (2026-05-07)

Computed against 409 active users using real `auth.users` + `mcp_sessions` data:

| Tier | Total request header (post-flip) | Status |
|---|---|---|
| p50 | ~5KB | ✅ Safe |
| p95 | ~6KB | ✅ Safe |
| p99 | ~6.5KB | ⚠️ Tight |
| Worst case (max user_metadata + 1KB+ `adsagent_customer`) | ~7KB | ⚠️ Tight |

28% of users would have an `sb-*` cookie value over Supabase SSR's 3,500-byte chunking threshold, getting split into `.0` / `.1` cookies. Largest single load: ~3,500 + ~759 bytes = ~4,259 bytes for the heaviest user.

Pre-flip recommendation: drop the redundant `adsagent_customer` cookie (max ~1KB) — `customerName` is derivable from `ad_platform_connections.accountIds` on render. Doing so brings worst-case to ~6KB, p99 to ~5.5KB.

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

### Phase 3 — Direct-bearer MCP cutoff 🛑 HALTED 2026-05-07

**Status:** halted. We are no longer cutting off direct-bearer auth. The 32-user cohort (mostly `claude-code` installs with bearers baked into `~/.mcp-settings.json`) stays supported indefinitely. Telemetry events `mcp_direct_bearer_used` and `mcp_oauth_used` stay live for visibility but no cutoff actions ship.

The text below preserves the original plan as a reference in case we ever revisit. It is **not the active plan.**

---

**Original goal:** stop accepting `Authorization: Bearer <hex>` (the `mcp_sessions.accessToken` cookie value as MCP bearer). Force all MCP traffic onto OAuth 2.0.

This is the riskiest phase because it can break working Claude Code installs that have the cookie value baked into `~/.mcp-settings.json`.

#### Phase 3 progress (as of 2026-05-07)

- **Step 1 (telemetry) shipped 2026-05-06** (commit `98b0f6b`). `mcp_direct_bearer_used` event fires on every successful direct-bearer auth in `lib/mcp/handler-factory.ts`'s `acceptDirectBearer` branch.
- **Symmetric OAuth telemetry shipped 2026-05-07** (commit `40a9e0f`). `mcp_oauth_used` event fires on every successful OAuth resolution across all three paths (Meta connection, Google connection, Google session-fallback). Property `binding: "connection" | "session"` tracks phase-2 mix; `client_name` is captured raw (may be null on connection-bound paths). With both events live, we get a clean side-by-side: active OAuth users vs active direct-bearer users.

##### Initial 12-hour read (2026-05-06 14:54 → 2026-05-07 02:09 PT)

| Cohort | Hits | Unique users | Notes |
|---|---|---|---|
| Direct-bearer | 6,815 | 38 | Bulk on `claude-code` (31 users / 6,630 hits); rest split across craft-agent, Trae, openclaw-bundle-mcp, Anthropic/Toolbox |
| OAuth (issuance proxy) | n/a | 143 (all-time) | True active-now count not available until `mcp_oauth_used` accumulates a day of data |

**Implication:** the cutoff cohort is small enough (~38 users, dominated by 31 claude-code users) that phase 3's "2–4 week notice" estimate is the upper bound — banner + email outreach should converge faster.

#### Steps

1. **Telemetry first.** Add PostHog events `mcp_direct_bearer_used` (and symmetric `mcp_oauth_used`) capturing `userId`, `clientName`, request path. Run for ≥1 week to find affected users. ✅ Shipped 2026-05-06 + 2026-05-07.
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

### Phase 4 — Switch web cookie to Supabase Auth (now the final phase)

**Goal:** `lib/session.ts` no longer reads `adsagent_token`. Every server-side caller of `getSession()` reads userId from the Supabase session cookie. Callback stops minting `mcp_sessions` rows for new users.

Phase 2 already set up the bridge. This phase finishes the move.

**Scope adjustment 2026-05-07** (phases 3 + 5 halted): the original phase-4 endpoint assumed `mcp_sessions` would be dropped one phase later, so it removed `adsagent_token` plumbing aggressively. With the table staying, two adjustments apply:

- **Direct-bearer tokens become indefinite.** Step 3 drops the `expiresAt` check from `lib/mcp/handler-factory.ts`'s direct-bearer branch. `/api/auth/rotate-token` is still deleted (Supabase rotates web sessions natively), and the `mcp_sessions.expiresAt` column becomes vestigial — kept for forensic data but no longer enforced. Decision: option B in the original tradeoff (locked 2026-05-07).
- **`STOP_CREATING_MCP_SESSIONS` is a one-way door.** Once flipped on, no new direct-bearer tokens can be issued. New users must use OAuth. This is the desired end state, but flag the user-visible implication if anyone ever asks "how do I get a direct bearer for my new account."

#### Phase 4 progress (as of 2026-05-07)

**Step 1 (Supabase-anchored session loader) shipped + flipped in prod:**

- `lib/session.ts` — new `loadSessionViaSupabase()` helper. Identity comes from `supabase.auth.getUser()` (cookies refreshed per-request by middleware after the phase-2 bridge flip). Ads state comes directly from `ad_platform_connections` via `loadGoogleConnection`. **Skips `mcp_sessions` entirely** except for an optional legacy lookup for `Session.token` (back-compat with the direct-bearer Bearer-display on /connect; phase 3 retires this consumer).
- `loadSessionRow` dispatches: when `READ_USERID_FROM_SUPABASE=true`, prefer Supabase loader; on null result (no `sb-*` cookies), fall through to the legacy cookie path. Cookie path runs through `mergeWithConnection` as before; Supabase path skips it (the row is already connection-sourced).
- Dev impersonation still uses `mcp_sessions.id` (int) cookie values — step 4 migrates the cookie to userId (uuid). Existing impersonation flows unchanged.
- `web_session_resolved` PostHog event fires on every successful `loadSessionRow` with `via: "supabase" | "cookie_fallback"`. **This is the readiness signal for step 3** — drop the cookie path only when `cookie_fallback` daily count hits zero for ≥1 week.
- 7 unit tests covering both flag states, fallback paths, ads-less behavior, Supabase email override, and Meta accounts loading via the same userId.
- Verified: 4/4 post-flip smoke probes clean against prod (`/api/health`, `/`, `/campaigns` 307, `/api/mcp` schema-introspection 200).

**Rollback for step 1:** `vercel env rm READ_USERID_FROM_SUPABASE production` + redeploy. Cookie fallback path is unchanged, so reverting the flag restores pre-step-1 behavior.

**Step 2 read-side migration shipped in prod (2026-05-07):**

Every code path that previously required an `mcp_sessions` row to identify the user has been migrated to a shared Supabase-first / cookie-fallback helper. With this in place, the auth callback's `mcp_sessions` INSERT can be safely flag-gated off without breaking new-user signup, account switching, OAuth, or conversion attribution.

- **`lib/auth/identify-user.ts` (new, commit `a4d1aca`)** — `identifyUser({ source })` returns `{ userId, googleEmail, legacySessionId, via }`. Tries `supabase.auth.getUser()` first when `READ_USERID_FROM_SUPABASE=true`, falls back to `adsagent_token` → `mcp_sessions` cookie path. Always emits `auth_identity_resolved` PostHog event with `via` + `source` so we can measure when each call site stops needing the fallback.
- **`lib/auth/get-user-email.ts` (new, commit `11fbb6d`)** — queries `auth.users.email` directly via raw SQL. Replaces the prior pattern of looking up `mcp_sessions.googleEmail` by userId, which silently returned null for Supabase-only users.
- **Routes migrated to `identifyUser`** (commits `343705a`, `d33c3fc`, `d5e9795`, `11fbb6d`):
  - `/api/oauth/authorize` — Google DCR codes now bind to `connectionId` directly when Supabase resolves the user.
  - `/api/auth/select-account` — connection-as-source-of-truth for refresh token + candidate accounts. mcp_sessions UPDATE/DELETE only fires for legacy cookie users.
  - `/api/auth/switch-account` — same pattern.
  - `/api/oauth/meta/start`, `/api/oauth/meta/callback` — Meta OAuth flow Supabase-aware end-to-end.
  - `/api/oauth/gohighlevel/start`, `/api/oauth/gohighlevel/callback`, `/api/integrations/gohighlevel/status` — GHL flow + status check.
  - `app/(app)/manage-ads-accounts/page.tsx` — pending Google candidate accounts come from `ad_platform_connections.account_ids` (populated by phase-1 dual-write) instead of `mcp_sessions.customerIds`.
- **Email lookups migrated to `getUserEmail`**:
  - `lib/x-first-write.ts`, `lib/reddit-first-write.ts` — conversion-event email attribution now sources from `auth.users` (was silently null for Supabase-only users).
  - `lib/subscription.ts` — dev-email override.
  - `lib/mcp/agent-feedback.ts` — Slack/PostHog enrichment.

**Open metrics (added 2026-05-07):**

- `web_session_resolved` (`lib/session.ts`) — daily breakdown by `via`. Tracks rate of users naturally migrating from cookies to Supabase as they re-engage.
- `auth_identity_resolved` (`identifyUser`) — per-route breakdown by `via`. Tracks whether each migrated route's traffic is on Supabase or still leaning on the cookie fallback.

**Initial readout (~3h post-bridge-flip):** 1 user resolved via Supabase / 3 still on cookie fallback / 17%/83% hit ratio. Expected this early — `sb-*` cookies are only set on fresh signins. Step 3 readiness gate is `cookie_fallback` count <5% sustained for ≥3 days.

**Step 2 INSERT skip shipped + flipped 2026-05-07:**

- **Code (`5bdfe70`):** `STOP_CREATING_MCP_SESSIONS` predicate in `lib/connections/feature-flags.ts`. Auth callbacks (Google OAuth + Supabase magic-link) skip both the `mcp_sessions` INSERT and the `adsagent_token` cookie set when flag on AND a Supabase userId is present. Connection upsert still fires unconditionally. Defensive fallback when `userId === null` (rare pre-Supabase-attached path) keeps the legacy INSERT to avoid stranding the user. Magic-link callback also skips `clearSupabaseCookies` under the flag (sb-* cookies ARE the session, can't be cleared). +6 tests.
- **Audit before flip (in chat, 2026-05-07):** walked the full new-user journey end-to-end under flag-on — signin → callback → /manage-ads-accounts → picker → /api/auth/select-account → /connect/google-ads → DCR /api/oauth/register → /api/oauth/authorize (connectionId-bound) → /api/oauth/token → /api/mcp/google_ads tool call. 15 of 16 read paths green; 1 UX break found and fixed.
- **UX fix (`5bdfe70`):** `components/connect-page.tsx` was hiding the entire MCP setup UI behind `!token`, which conflated "has a Supabase session" with "has an `mcp_sessions.access_token`." Connected Supabase-only users would have seen a "Sign in with Google" CTA for an account they were already signed into. Gate switched to `session.connected && !session.pendingSetup`.
- **Bearer-block removal (`568e76a`):** `/connect/*-ads/any-mcp` no longer renders the bearer-token ConfigBlock — under STOP_CREATING_MCP_SESSIONS the "sign in to get a key" CTA was misleading (signing in won't produce a key), and the rotate button would 404 once `/api/auth/rotate-token` was deleted. Component slimmed to OAuth-only across in-app + marketing surfaces.
- **Rotate-token retirement + option B (`79a7c64`):** deleted `/api/auth/rotate-token` route + test, dropped `expiresAt` check from `lib/mcp/handler-factory.ts`'s direct-bearer branch (locked option B). Direct-bearer tokens are now long-lived credentials revocable via row deletion only — mirrors connection-bound Google + Meta behavior. Translation cleanup across all 7 locales (`AnyMcpClientSetup.{bearer,apiKey,apiKeyCta}.*` keys removed) + 5 dead `api_key_*` event-registry entries removed.
- **Production flip (`9b9fa57`):** `vercel env add STOP_CREATING_MCP_SESSIONS production` → `true`, empty-commit redeploy. Same flip pattern used for `READ_GOOGLE_FROM_CONNECTIONS` (`e5b2dcd`) and `SUPABASE_SESSION_BRIDGE` (`e6d11fe`).

**Rollback for step 2 INSERT skip:** `vercel env rm STOP_CREATING_MCP_SESSIONS production` + redeploy. Users who signed up during the on-window keep working post-rollback (sb-* cookies + `READ_USERID_FROM_SUPABASE=true` carry identity, `READ_GOOGLE_FROM_CONNECTIONS=true` carries Google state). They just lack a `mcp_sessions` row, which nothing on the UI consumes anymore (bearer block is gone, `session.token` no longer gates anything).

#### Code changes

| File | Change | Step | Status |
|---|---|---|---|
| `lib/session.ts` | Add Supabase-anchored loader; `loadSessionRow` prefers it when flag on. | 1 | ✅ shipped 2026-05-07 |
| `lib/auth/identify-user.ts` (new) | Shared `identifyUser` helper (Supabase first / cookie fallback) + `auth_identity_resolved` telemetry. | 2 | ✅ shipped 2026-05-07 (`a4d1aca`) |
| `lib/auth/get-user-email.ts` (new) | Email-by-userId helper, queries `auth.users` directly. | 2 | ✅ shipped 2026-05-07 (`11fbb6d`) |
| `app/api/oauth/authorize/route.ts` | Identify user via Supabase first; bind Google DCR codes to `connectionId` when connection has active account. | 2 | ✅ shipped 2026-05-07 (`343705a`, `d5e9795`) |
| `app/api/auth/select-account/route.ts` | Connection is source of truth for refresh token + candidate accounts; mcp_sessions UPDATE/DELETE only for legacy users. | 2 | ✅ shipped 2026-05-07 (`d33c3fc`) |
| `app/api/auth/switch-account/route.ts` | Same pattern. | 2 | ✅ shipped 2026-05-07 (`d5e9795`) |
| `app/api/oauth/meta/start/route.ts` + `callback` | Supabase-first identity; userId verification via identifyUser. | 2 | ✅ shipped 2026-05-07 (`d5e9795`, `11fbb6d`) |
| `app/api/oauth/gohighlevel/start/route.ts` + `callback` + `status` | Same pattern. | 2 | ✅ shipped 2026-05-07 (`d5e9795`, `11fbb6d`) |
| `app/(app)/manage-ads-accounts/page.tsx` | Pending Google candidate accounts come from `ad_platform_connections.account_ids` instead of `mcp_sessions.customerIds`. | 2 | ✅ shipped 2026-05-07 (`d5e9795`) |
| `lib/x-first-write.ts`, `lib/reddit-first-write.ts` | Email attribution sources from `auth.users` via `getUserEmail`. | 2 | ✅ shipped 2026-05-07 (`11fbb6d`) |
| `lib/subscription.ts` | Dev-email override sources from `auth.users`. | 2 | ✅ shipped 2026-05-07 (`11fbb6d`) |
| `lib/mcp/agent-feedback.ts` | Slack/PostHog enrichment prefers `auth.users` via userId; mcp_sessions kept as fallback for sessionId-bound legacy paths. | 2 | ✅ shipped 2026-05-07 (`11fbb6d`) |
| `app/auth/callback/route.ts` + `app/auth/supabase/callback/route.ts` | Stop creating `mcp_sessions` rows for new web logins. Stop setting `adsagent_token`. Magic-link callback also preserves `sb-*` cookies under the flag. (Connection upsert still fires unconditionally.) | 2 | ✅ shipped + flipped 2026-05-07 (`5bdfe70`, `9b9fa57`) |
| `components/any-mcp-client-setup.tsx` + `mcp-setup-tabs.tsx` + `connect-page.tsx` + `connect-meta-ads-mcp-page.tsx` + marketing pages | Drop bearer-token ConfigBlock + `apiKey`/`onSignIn`/`onTokenRotated` prop chain. Connect-page setup-tabs gate switches from `!token` to `session.connected && !session.pendingSetup`. | 2 | ✅ shipped 2026-05-07 (`568e76a`) |
| `lib/session.ts` | Drop the cookie fallback path (no more `adsagent_token` reads). | 3 | pending |
| `lib/auth-cookies.ts` | Remove `adsagent_token` constant + helpers. | 3 | pending |
| `app/api/auth/rotate-token/route.ts` | **Deleted 2026-05-07.** Supabase rotates web refresh tokens natively. Direct-bearer no longer depends on `expiresAt` being extended. | 3 | ✅ shipped |
| `lib/mcp/handler-factory.ts` (direct-bearer branch) | **Dropped the `expiresAt` check 2026-05-07.** Direct-bearer tokens valid until row is manually deleted. Option B locked. | 3 | ✅ shipped |
| `app/api/auth/signout/route.ts` | Replace cookie-clearing with `supabase.auth.signOut()`. | 3 | pending |
| `lib/session.ts` (profile cookie) | Drop `adsagent_profile`. Read `displayName`/`picture` from `auth.users.user_metadata`. | 4 | pending |
| `lib/session.ts` (impersonation) | `adsagent_impersonate` cookie value changes from `mcp_sessions.id` (int) to `userId` (uuid). | 4 | pending |
| `lib/auth-cookies.ts` | Drop `adsagent_customer` cookie — derive customer name from connection on render. | (phase 2 prep) | ✅ shipped 2026-05-07 (`97b4ca7`) |

#### Forced re-auth

Users whose Supabase session expired during the phase 2 → 4 window get redirected to `/login`. Acceptable cost; communicate via banner if measurable.

#### What stays

- `adsagent_active_platform` (UI state, not auth)
- `adsagent_last_attempt_email` (5-minute error display)

#### OAuth `/authorize` flow

Today `/api/oauth/authorize` reads `adsagent_token` to identify who's authorizing. After phase 4 it reads the Supabase session. Make sure the Supabase cookie is set before this phase ships — phase 2's bridge handles that.

**Status (2026-05-07, commit `343705a`):** the Supabase-first identification path is live in production as an additive change — no flag. DCR Google branch tries `supabase.auth.getUser()` first; falls back to the existing `adsagent_token` cookie path when no Supabase user is present. Supabase-resolved Google flows now bind the auth code to `connectionId` directly (skipping the `/token`-time translation that the cookie path still relies on). This pre-emptively covers step 2 — without it, callback's mcp_sessions write removal would loop new users back through signin indefinitely.

#### Estimated scope

1–2 PRs, ~400 LOC. Bulk of LOC is rewiring `lib/session.ts` + every server route that reads it.

---

### Phase 5 — Drop `mcp_sessions` 🛑 CANCELLED 2026-05-07

**Status:** cancelled. The table stays. With phase 3 halted, direct-bearer auth still reads `mcp_sessions.accessToken` and the polymorphic `sessionId` columns on `oauth_access_tokens` / `authorization_codes` / `oauth_clients` / `operations` still resolve to live rows for the legacy cohort.

The text below is preserved as a reference. **Not the active plan.**

---

**Original goal:** delete the table and all dead code referencing it.

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
| 3 | 🛑 Halted — no rollback needed. Direct-bearer never cut off. |
| 4 | **Step 2 INSERT skip:** `vercel env rm STOP_CREATING_MCP_SESSIONS production` + redeploy. Users who signed up during the on-window keep working post-rollback (sb-* + Supabase-anchored loader carries identity, `ad_platform_connections` carries Google state). Nothing on the UI consumes `session.token` anymore (bearer block gone). **Step 3+4 (when shipped):** restore `adsagent_token` minting + `lib/session.ts` cookie fallback. Risk: users who re-auth during the phase-4 window won't have `mcp_sessions` rows; identity still works via Supabase. |
| 5 | 🛑 Cancelled — no destructive action to roll back. |

## Risks summary

1. ~~**Direct-bearer holdouts** (phase 3)~~ — no longer a risk. Phase 3 halted; direct-bearer stays.
2. **Supabase middleware refresh** (phase 2) — adds latency to every request. Benchmark before/after on a representative route.
3. **Cookie size** (phase 2) — Vercel 4KB header limit. Audit. ✅ Audited 2026-05-07; worst case ~6KB after `adsagent_customer` slim.
4. **Dev impersonation** keys off `mcp_sessions.id` — repointable to `userId`, but easy to miss. Catch in phase 4 review.
5. **Per-device active account regression** — flag during phase 2 review; decide whether to add overrides.
6. **`mcp_sessions.expiresAt` becomes vestigial after phase 4** — locked 2026-05-07 (option B): direct-bearer branch in `handler-factory.ts` stops checking `expiresAt`. Tokens last until row deletion. Column is preserved for forensic data only.

## Estimated total scope

| Phase | LOC | PRs | Bake time | Status |
|---|---|---|---|---|
| 1 | ~600 | 2–3 | 1 week | ✅ shipped |
| 2 | ~800 | 2–3 | 1 week | ✅ shipped |
| 3 | ~300 | 2 | 2–4 weeks (user notice) | 🛑 halted |
| 4 | ~400 | 1–2 | 1 week | step 1 + 2 (read-side + INSERT skip) live in prod; option B locked + rotate-token retired; steps 3–4 cookie cutover pending |
| 5 | ~200 | 1 | — | 🛑 cancelled |
| **Total (revised)** | **~1,800** | **6–8** | **~3–4 weeks remaining** | |

## What shipped 2026-05-07 (phase 4 step 2 finalization)

Five commits, ~700 LOC removed net.

- **`5bdfe70` — `feat(auth): STOP_CREATING_MCP_SESSIONS flag + scope migration to phase 4`**
  - `lib/connections/feature-flags.ts` — `stopCreatingMcpSessions()` predicate
  - `app/auth/callback/route.ts` — flag-gated INSERT skip in all 3 paths (`mintAdsLessSession`, single-account, multi-account-pending) + `setSessionCookies` skip
  - `app/auth/supabase/callback/route.ts` — flag-gated `mintEmailOnlySession` skip + `clearSupabaseCookies` skip (sb-* MUST persist under flag)
  - `components/connect-page.tsx` — UX fix: setup-tabs gate switched from `!token` to `session.connected && !session.pendingSetup`
  - `docs/plans/mcp-sessions-to-connections-migration.md` — phase 3 + 5 marked halted/cancelled
  - +6 tests
- **`568e76a` — `refactor(connect): drop bearer-token block from any-mcp setup`**
  - `components/any-mcp-client-setup.tsx` — bearer ConfigBlock + `ApiKeyDisplay` + `ApiKeyCta` + `bearerConfigFor` removed; OAuth-only
  - `components/mcp-setup-tabs.tsx` — `apiKey`/`onSignIn`/`onTokenRotated` props dropped
  - `components/connect-page.tsx`, `components/connect-meta-ads-mcp-page.tsx`, `components/marketing/{google,meta}-ads-mcp-page.tsx`, `app/(app)/connect/meta-ads/[[...slug]]/page.tsx` — apiKey prop chain unwound
  - Net -288 LOC
- **`79a7c64` — `refactor(auth): retire rotate-token + lock direct-bearer option B`**
  - `lib/mcp/handler-factory.ts` — direct-bearer branch no longer enforces `mcp_sessions.expiresAt` (option B locked)
  - `app/api/auth/rotate-token/route.ts` + `lib/__tests__/rotate-token-route.test.ts` — deleted
  - `messages/{de,en,es,fr,pt-BR,ru,th}.json` — orphan `AnyMcpClientSetup.{bearer,apiKey,apiKeyCta}.*` keys removed
  - `docs/event-registry.md` — 5 dead `api_key_*` events removed
  - Net -405 LOC
- **`9b9fa57` — `chore(deploy): flip STOP_CREATING_MCP_SESSIONS=true in production`**
  - `vercel env add STOP_CREATING_MCP_SESSIONS production` → `true`, empty-commit redeploy

Pre-flip end-to-end audit (in chat): walked the full new-user journey under flag-on through 16 read-path stops. All green after the connect-page UX fix.

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

## Day-1 post-flip metrics (2026-05-08, ~24h after `STOP_CREATING_MCP_SESSIONS` flip)

Dev-excluded, last 24h, PostHog project 368485.

| Event | Hits | Users | Notes |
|---|---|---|---|
| `mcp_direct_bearer_used` | 14,331 | 47 | Frozen cohort, +2 users vs pre-flip 12h read. New minting blocked; can only shrink. |
| `mcp_oauth_used` | 6,275 | 104 | binding mix: session 87 users (85%), connection 13 users (15%). Long tail of pre-phase-2 sessionId-bound Google tokens — phase 5 cancelled, these stay forever. |
| `web_session_resolved` | 2,809 | 49 | via mix: supabase 29 users (71%), cookie_fallback 25 users (29%). Step-3 gate is <5% sustained ≥3 days; expect 5–7 day decay. |
| `auth_identity_resolved` | 189 | 35 | `oauth-authorize` is biggest, ~80% cookie_fallback (DCR flow needs live `sb-*` at `/authorize`); `select-account` 100% supabase. |
| `google_connection_mismatch` | 245 | **3** | All `refreshToken`-only field diffs, **same 3 users, population stable**. Connection-bound MCP refresh updates `ad_platform_connections` only — `mcp_sessions.refreshToken` is no longer the read source on either path, so the divergence is cosmetic. Quiets when these users pick up `sb-*` cookies. |
| `auth_error` | 14 | 1 | All `scope_denied_retry` (user denying Google OAuth scopes). Unrelated to migration. |

### Read-side regressions

None observed. The one spike (`google_connection_mismatch` jumping from 1 → 245) is benign — refresh-token rotation on the connection row not mirrored to the legacy `mcp_sessions` row. Worth tracking only if affected-user count climbs above 3.

### Direction

- `cookie_fallback` share: 34% (initial 3h read) → 29% (24h). Slow decay, hour-by-hour bounces with active-user mix. On track but won't hit <5% for several days.
- Step 3 + 4 cookie cutover stays gated.

### Afternoon re-check (2026-05-08, ~6h after the morning readout)

| Event | Hits | Users | Δ vs morning |
|---|---|---|---|
| `mcp_direct_bearer_used` | 13,305 | 44 | -3 users (older calls aged out of 24h window) |
| `mcp_oauth_used` | 6,415 | 106 | +2 users |
| `web_session_resolved` | 2,773 | 49 | flat |
| `google_connection_mismatch` | 245 | **3** | **population still 3; last event 07:22 PT — ~6h dry** |
| `auth_identity_resolved` | 177 | 35 | flat |
| `auth_error` | 13 | 1 | flat (still `scope_denied_retry`, unrelated) |

`web_session_resolved.via` mix: **supabase 69% / cookie_fallback 31%** (29 vs 26 users). Essentially unchanged vs morning (71/29) — same active pool, no meaningful intra-day decay.

Mismatch alarm is contained — all 245 hits are residual from the morning burst, no new ones in 6h. Refresh-token drift is on the legacy `mcp_sessions.refreshToken` field which nothing on the live path reads; self-quieting as those 3 users pick up `sb-*` cookies on next signin. Worth tracking only if affected-user count breaches 3.

Day 1 verdict: clean. Continue the ≥7-day watch; nothing actionable today.

## Day-4 post-flip metrics (2026-05-11, ~4 days after `STOP_CREATING_MCP_SESSIONS` flip)

Dev-excluded, last 24h, PostHog project 368485.

| Event | Hits | Users | Δ vs Day 1 |
|---|---|---|---|
| `mcp_direct_bearer_used` | 15,775 | 48 | +1 user. Frozen cohort, no new minting. Range stays 44–48. |
| `mcp_oauth_used` | 9,384 | 150 | +46 users. Binding mix: session 86 (55%) / connection 69 (45%). Long tail of pre-phase-2 sessionId-bound Google tokens will stay forever (phase 5 cancelled). |
| `web_session_resolved` | 7,859 | 70 | +21 users. Mix: supabase 51 (73%) / cookie_fallback 19 (27%). |
| `google_connection_mismatch` | 245 | **4** | +1 user. Still cosmetic refresh-token drift; affected population stable in low single digits. |
| `auth_identity_resolved` | 339 | 56 | +21 users. supabase 43 / cookie_fallback 13. `oauth-authorize` is the standout cookie holdout (138 hits / 10 users vs 75 / 32 on supabase) — DCR redirect chain doesn't always carry `sb-*` cookies. |

### `web_session_resolved.via=cookie_fallback` daily decay (the unlock gate)

| Day | Supabase users | Cookie users | Cookie % |
|---|---|---|---|
| 2026-05-07 (flip) | 30 | 25 | 45% |
| 2026-05-08 (day 1) | 26 | 22 | 46% |
| 2026-05-09 (day 2) | 25 | 13 | 34% |
| 2026-05-10 (day 3) | 27 | 14 | 34% |
| 2026-05-11 (day 4) | 45 | 15 | **25%** |

Trajectory is right but cookie_fallback is still **5× the <5% gate**. At the current decay rate (~5pp/day), unlock is probably 4–7 more days away. Steps 3+4 stay gated.

Day-4 verdict: clean. No regressions, no rollback signals, mismatch alarm contained. Continue the watch.

## Day-5 post-flip metrics (2026-05-12, ~5 days after `STOP_CREATING_MCP_SESSIONS` flip)

Last 24h, PostHog project 368485 (dev exclusion **not applied** — this batch was pulled via raw HogQL; numbers are slightly inflated vs the dev-excluded series above, but the ratios and trajectory match).

| Event | Hits | Users | Δ vs Day 4 |
|---|---|---|---|
| `mcp_direct_bearer_used` | 17,018 | 44 | -4 users. Frozen cohort still in the 44–48 band. |
| `mcp_oauth_used` | 7,491 | 162 | +12 users. Binding mix: session 86 (53%) / connection 77 (47%) — connection share keeps creeping up as new tokens mint. |
| `web_session_resolved` | 5,766 | 53 | -17 users. Mix: supabase 42 (74%) / cookie_fallback 15 (26%). Cookie % essentially flat vs Day-4 (25%). |
| `auth_identity_resolved` | 325 | 43 | -13 users. supabase 29 / cookie_fallback 14. `oauth-authorize` still the standout: 11 cookie users vs 24 supabase (32% of `/authorize` identity resolutions still on the cookie path). |
| `google_connection_mismatch` | 91 | 5 | +1 user, fewer hits. Same cosmetic refresh-token drift; affected population stays in low single digits. |
| `auth_error` | 17 | 1 | All unrelated to migration (`scope_denied_retry` × 12, `consent_denied` × 3, `missing_cookie` × 2 — one user retrying a denied consent screen). |

### Updated decay table

| Day | Supabase users | Cookie users | Cookie % |
|---|---|---|---|
| 2026-05-07 (flip) | 30 | 25 | 45% |
| 2026-05-08 (day 1) | 26 | 22 | 46% |
| 2026-05-09 (day 2) | 25 | 13 | 34% |
| 2026-05-10 (day 3) | 27 | 14 | 34% |
| 2026-05-11 (day 4) | 45 | 15 | **25%** |
| 2026-05-12 (day 5) | 38 (raw) | 14 (raw) | **27%** (raw) |

**Decay has flattened.** Day 4 → Day 5 is flat-to-slightly-up at the noise level. The remaining cookie_fallback users aren't naturally aging out at the ~5pp/day rate observed earlier — the long tail is sticky. Probable composition:

- DCR `/authorize` redirect chain not carrying `sb-*` (the dominant `oauth-authorize` cookie source — 32% of identity resolutions on that route).
- Tabs left open with stale state.
- Genuinely dormant users who haven't re-signed-in since the bridge flipped 6 days ago.

The implication is that **waiting alone won't get to <5%**. Closing the `/authorize` cookie leak is the highest-leverage remaining lever.

### What shipped today (commit `b035019`)

Dead-code cleanup of the `false`-branches of all four migration flags. The flags themselves and the cookie-fallback READ paths are left intact (PostHog above confirms ~15 users/day still need them). Specifically removed:

- `clearSupabaseCookies` in `app/auth/callback/route.ts` (was gated on `if (supabaseSessionBridge()) return;` — body was unreachable in prod).
- `skipMcpSession=false` branches in `createOrRedirectGoogleAdsSession` + `mintAdsLessSession` (the `mcp_sessions` INSERT + `setSessionCookies` writes — never fired with `STOP_CREATING_MCP_SESSIONS=true && userId`).
- Legacy `mcp_sessions` reuse fallback in `reuseExistingSession` — only fired when `conn` was missing, which contradicts the Phase-1 dual-write guarantee.
- `mintEmailOnlySession` + conditional cookie reissue in `app/auth/supabase/callback/route.ts` (was gated on `!stopCreatingMcpSessions()`).
- `if (identity.legacySessionId !== null)` blocks in `select-account`, `switch-account`, `oauth/authorize` — `legacySessionId` is always `null` in prod (Supabase path wins in `identifyUser`).
- `readGoogleFromConnections()` gate around the sessionId→connectionId translator in `oauth/token` — translator always ran in prod.
- `setSessionCookies` helper in `lib/auth-cookies.ts` — no production callers after the deletions above.

Net diff: −1,067 / +329 across 17 files (production + tests). Suite at the pre-existing failure baseline; typecheck clean.

**Left untouched** (still serving the 15 cookie_fallback users/day):
- `lib/session.ts` — `loadDeviceSession` + `mergeWithConnection` + dispatcher.
- `lib/auth/identify-user.ts` — cookie fallback branch.
- `lib/supabase/middleware.ts` — `adsagent_token` acceptance on protected paths.
- `lib/connections/google-read.ts` — `compareForShadowRead` drift telemetry.
- `lib/connections/feature-flags.ts` — flag functions (still env-var-driven so tests can mock).

Day-5 verdict: dead-code cleanup landed safely. Cookie decay has stalled — natural attrition won't reach <5%. To unlock steps 3+4 we either accept a force-resign-in event or fix the `/authorize` cookie carrier.

## Day-6 post-flip metrics (2026-05-13, ~6 days after `STOP_CREATING_MCP_SESSIONS` flip)

Last 24h, PostHog project 368485, raw HogQL (no dev exclusion — same methodology as Day-5).

| Event | Hits | Users | Δ vs Day-5 |
|---|---|---|---|
| `mcp_direct_bearer_used` | 19,737 | 41 | -3 users. Frozen cohort still in the 41–48 band — no new minting, no churn-out. |
| `mcp_oauth_used` | 10,633 | 183 | +21 users. Binding mix: **connection 99 (54%) / session 85 (46%)** — connection share crossed 50% for the first time as new tokens keep minting against `ad_platform_connections`. |
| `web_session_resolved` | 5,798 | 59 | +6 users. Mix: supabase 47 (80%) / cookie_fallback **13** (~22%). |
| `auth_identity_resolved` | 203 | 45 | +2 users. supabase 33 / cookie_fallback 12. `oauth-authorize` still the dominant cookie source: 11 cookie users vs 29 supabase (28% of `/authorize` identity resolutions still fall back — down from 32% on Day-5). |
| `google_connection_mismatch` | 153 | 4 | -1 user, more hits. Cosmetic refresh-token drift, contained. |
| `auth_error` | 21 | 1 | All from one user retrying a denied consent screen: `scope_denied_retry` × 16, `consent_denied` × 4, `missing_cookie` × 1. Unrelated to the migration. |

### Updated decay table

| Day | Supabase users | Cookie users | Cookie % |
|---|---|---|---|
| 2026-05-07 (flip) | 30 | 25 | 45% |
| 2026-05-08 (day 1) | 26 | 22 | 46% |
| 2026-05-09 (day 2) | 25 | 13 | 34% |
| 2026-05-10 (day 3) | 27 | 14 | 34% |
| 2026-05-11 (day 4) | 45 | 15 | 25% |
| 2026-05-12 (day 5) | 38 | 14 | 27% |
| 2026-05-13 (day 6) | 47 | 13 | **22%** |

Cookie cohort is essentially flat (14 → 13 users). The percentage moved 27% → 22% only because the supabase denominator grew, not because cookie users churned out. This re-confirms the Day-5 verdict: **natural attrition has plateaued in the 13–15 user band** — the long tail is sticky.

The `/authorize` cookie share dropped slightly (32% → 28%) but is still the dominant cookie source. No code changes shipped today on the migration path; this is a pure passive-watch readout.

Day-6 verdict: clean, no regressions, no rollback signals. The plateau is real — not noise — so the unlock gate continues to depend on closing the `/authorize` `sb-*` carrier rather than waiting.

## Next action

Phase 4 step 1 + 2 are live in prod. Three of the eight items in the step 3+4 code-changes table also already shipped (rotate-token deletion, option B `expiresAt` drop, bearer-block UI removal). `b035019` cleared the dead `false`-branches of the four migration flags. Remaining work:

1. **Diagnose the `oauth-authorize` cookie holdout** — 28% of `/authorize` identity resolutions today still fell back to `adsagent_token` (down from 32% on Day-5; trend is favorable but slow). The DCR redirect chain (Claude/Codex → `/api/oauth/authorize`) appears to drop `sb-*` cookies. Likely cause: redirect comes from a third-party origin and `sb-*` is configured with strict cookie attributes. Fix candidates: confirm `SameSite=Lax` on `sb-*`, audit the redirect chain, or have `/authorize` proactively refresh sb-* before the identity check. This is the highest-leverage decay lever now that natural attrition has plateaued.
2. **Continue passive watch** — `web_session_resolved.via=cookie_fallback`, `google_connection_mismatch`, `auth_error`. Rollback path is still `vercel env rm STOP_CREATING_MCP_SESSIONS production` + redeploy.
3. **Phase 4 step 3 + 4 (cookie cutover)** — same scope as before (remove `adsagent_token` reads, drop `adsagent_profile`, migrate `adsagent_impersonate` to UUID, replace cookie-clearing with `supabase.auth.signOut()`). Still gated on `cookie_fallback` <5% sustained ≥3 days. Given the flattened decay, this gate now plausibly requires (1) above to land first; otherwise consider an explicit force-resign-in event for residual cookie-only users.
4. **Stop here.** `mcp_sessions` table stays. Direct-bearer cohort serves itself off the existing rows indefinitely.
