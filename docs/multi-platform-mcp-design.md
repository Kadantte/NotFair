# Multi-Platform MCP Architecture

How NotFair supports Google Ads, Meta Ads, and future ad platforms (TikTok, LinkedIn, etc.) — one MCP server per platform, sharing infrastructure under the hood.

## Decision

**One MCP server per ad platform.** Each platform is a separate MCP namespace with its own endpoint, tool set, OAuth flow, and tokens. They share database, auth scaffolding, and telemetry libraries — but are independent from the LLM's perspective.

## Why separate MCPs (not one combined)

| Combined MCP (rejected) | Separate MCPs (chosen) |
|---|---|
| One server, all tools share a process and tool list | Independent servers, independent lifecycles |
| Cross-platform tools must reconcile schema | Each MCP is honest to its platform |
| New platform = audit/refactor unified layer | New platform = new MCP, no impact on existing |
| One connector install for users | Two connector installs (small UX cost) |
| Shared auth surface | Per-MCP auth (cleaner isolation) |
| Tool list grows monolithically as platforms are added | Each MCP's tool list stays platform-scoped |

(Tools are NOT prefixed; platform identity lives in the URL, the token prefix, and the server's `serverInfo.name`. See [Tool naming](#tool-naming).)

The trade we're accepting: cross-platform queries ("total spend this week across Google + Meta") require the user to install both connectors and the agent calls each MCP separately. This is how Claude.ai handles multi-MCP setups today (GitHub + Linear + Notion in one conversation). Works fine.

## Architecture

```
NotFair (one Next.js app, one DB, one OAuth authorization server)
│
├── Authorization Server                            (shared by all MCPs)
│   ├── /.well-known/oauth-authorization-server    (singular)
│   ├── /api/oauth/authorize                       (reads ?resource=, dispatches per-platform)
│   ├── /api/oauth/token                           (stamps prefix from `resource`)
│   ├── /api/oauth/register                        (DCR; one client covers all MCPs)
│   ├── /api/oauth/google/callback                 (internal — Google posts here)
│   └── /api/oauth/meta/callback                   (internal — Meta posts here)
│
├── Google Ads MCP                                  (existing surface, unchanged tool names)
│   ├── Resource: /api/mcp                         (kept permanently for backward compat)
│   ├── Resource: /api/mcp/google_ads              (new canonical path — platform-first)
│   ├── Resource doc: /.well-known/oauth-protected-resource{/api/mcp,/api/mcp/google_ads}
│   ├── Server name: notfair-google-ads-mcp        (returned in `serverInfo`)
│   ├── Tools:    createCampaign, pauseKeyword, runScript, ... (~60 tools, no prefix)
│   └── Tokens:   oat_*               (legacy, valid forever for backward compat)
│                 oat_google_ads_*    (new format for new tokens)
│
├── Meta Ads MCP                                    (new)
│   ├── Resource: /api/mcp/meta_ads
│   ├── Resource doc: /.well-known/oauth-protected-resource/api/mcp/meta_ads
│   ├── Server name: notfair-meta-ads-mcp
│   ├── Tools:    createCampaign, pauseAdSet, runScript, getInsights, ... (~25-30 tools, no prefix)
│   └── Tokens:   oat_meta_ads_*
│
└── Future: /api/mcp/tiktok_ads       → tiktok_ads_*   tools, oat_tiktok_ads_*  tokens
         /api/mcp/linkedin_ads      → linkedin_ads_* tools, oat_linkedin_ads_* tokens
```

Same Next.js app, same database, **one shared OAuth authorization server**, separate MCP resources. Each MCP is a distinct OAuth protected resource with its own resource-metadata document; they all point at the same authorization server.

## Tool naming

**No platform prefix on tool names.** Tools keep their plain camelCase form: `createCampaign`, `pauseKeyword`, `runScript`, `searchGeoTargets`, etc. — the same names they had before the multi-platform refactor.

Examples:
- Google MCP: `createCampaign`, `pauseKeyword`, `runScript`, `getRecommendations`
- Meta MCP: `createCampaign`, `pauseAdSet`, `runScript`, `getInsights` (each platform's own surface)

Platform separation lives elsewhere, not in the tool name:

1. **URL** — `/api/mcp/google_ads` vs `/api/mcp/meta_ads`. Each MCP is a distinct server.
2. **Token prefix** — `oat_google_ads_*` vs `oat_meta_ads_*`. Per-resource audience binding.
3. **Server identity in `tools/list`** — `serverInfo.name` is `notfair-google-ads-mcp` / `notfair-meta-ads-mcp`. Modern MCP clients (Claude.ai, Cursor, Codex) namespace tools by server before showing them to the model, so the platform identity is already disambiguated for the LLM without `google_ads_` / `meta_ads_` baked into the inner name.

### Why we considered (and rejected) a prefix

A prior version of this design proposed `google_ads_*` / `meta_ads_*` prefixes on every tool. The argument was that MCP clients might flatten tool lists and produce `createCampaign` collisions when both connectors are installed. In practice:

- Every modern client namespaces by server before display (`notfair-google-ads__createCampaign` etc.) — collision-by-name is not a real failure mode.
- Telemetry can carry `platform` as a separate column rather than embedding it in the tool name.
- Prefixes burn 10–11 chars of the 64-char tool-name budget on every tool, which limits future tool-name headroom (especially for Meta's verbose Custom Audience tools).
- Inside the in-app chat agent, only one platform is ever bound per thread — prefixes are pure noise there.

The rare edge case (a power user piping multiple MCPs into a homemade non-namespacing agent) does not justify the cost.

### Where platform-name does appear

- Token prefix: `oat_google_ads_*` (load-bearing for audience routing).
- Resource URL path: `/api/mcp/google_ads` (load-bearing for routing).
- `serverInfo.name` returned by each MCP server: `notfair-google-ads-mcp`.
- Database `tool_permissions.tool_name` rows: stay flat (`pauseKeyword`, etc.), no migration needed.

Both `/api/mcp` (legacy) and `/api/mcp/google_ads` (new) expose identical tool surfaces under the same plain names — they are two URLs to the same handler.

## `runScript` per platform

Each platform MCP has its own `runScript` with a sandbox tailored to that platform.

**Google `runScript` sandbox:**
- `ads.gaql(query)`, `ads.gaqlParallel([queries])`
- `ads.queries.*` (pre-built query builders)
- `ads.helpers.*` (utilities)

**Meta `runScript` sandbox:**
- `ads.graph(path, params)`, `ads.graphParallel([calls])`
- `ads.insights(adAccountId, options)`
- `ads.batch([requests])` (Graph API batch endpoint)

No cross-platform `ads` namespace. Each script reasons about one platform.

## OAuth surface

**One authorization server, N protected resources.** This matches the spec shape of RFC 9728 (Protected Resource Metadata) + RFC 8414 (Authorization Server Metadata) + MCP 2025-06-18: `oauth-protected-resource` is per-resource (one document per MCP path), `oauth-authorization-server` is per-AS (singular). Both MCPs list the same AS in their `authorization_servers` array.

### Why shared AS, not split

| Single AS (chosen) | Two ASes (rejected) |
|---|---|
| One DCR client covers both connectors | Each connector forces its own DCR registration |
| One NotFair sign-in, both connectors reuse the session | User signs into NotFair separately per connector |
| Tokens isolate at the *resource* layer via `aud`/prefix | Isolation at the AS layer — same DB, same app, redundant |
| `/api/oauth/{authorize,token,register}` exists once | Three routes per platform, more surface to keep in sync |
| RFC 8707 `resource` parameter does real dispatch work | `resource` param redundant — each AS implies its resource |

A NotFair user is one identity. Google and Meta are *what they connect through* NotFair, not separate identities. One AS reflects that.

### URL shape

Protocol-first: every NotFair MCP server lives under `/api/mcp/*`, with the platform identifier as the sub-path. This mirrors the legacy `/api/mcp` URL (which becomes a sibling, not an outlier) and matches how MCP servers in the wild are conventionally namespaced (e.g. GitHub's `api.githubcopilot.com/mcp/`, Linear's `mcp.linear.app/`).

Resource URLs:
- `/api/mcp` — legacy, kept forever for back-compat.
- `/api/mcp/google_ads` — new platform-explicit Google.
- `/api/mcp/meta_ads` — Meta (when activated).
- `/api/mcp/<platform>` — pattern for future platforms.

There is no trailing `/mcp` transport segment on the platform-explicit URLs. The factory mounts mcp-handler with an explicit `streamableHttpEndpoint` (rather than the basePath-derived shape the legacy route uses). SSE is not exposed for new platforms — every modern client uses streamable-HTTP. The legacy `/api/mcp` keeps its `[transport]` dynamic file structure unchanged for back-compat.

### Discovery shape

```
/.well-known/oauth-authorization-server                       → ONE doc (NotFair AS)
/.well-known/oauth-protected-resource                         → resource: /api/mcp        (legacy default)
/.well-known/oauth-protected-resource/api/mcp                 → resource: /api/mcp        (path-appended form)
/.well-known/oauth-protected-resource/api/mcp/google_ads      → resource: /api/mcp/google_ads
/.well-known/oauth-protected-resource/api/mcp/meta_ads        → resource: /api/mcp/meta_ads
```

The existing catch-all at `app/.well-known/oauth-protected-resource/[[...path]]/route.ts` returns the same body for every path today. It needs to become **path-aware**: read `params.path`, derive the `resource` URI from it, validate against an allowlist of known MCP paths, 404 otherwise. All resources point at the same `authorization_servers: [origin]`.

The `oauth-authorization-server` document stays as-is — singular, advertising `/api/oauth/authorize|token|register`. No `/api/oauth/meta/authorize` in well-known.

### Authorization flow (Meta connector example)

1. Claude.ai hits `/api/mcp/meta_ads` with no token → 401 with `WWW-Authenticate: Bearer resource_metadata=".../oauth-protected-resource/api/mcp/meta_ads"`.
2. Claude fetches that doc → sees `resource: ".../api/mcp/meta_ads"`, `authorization_servers: [".../"]`.
3. Claude fetches `/.well-known/oauth-authorization-server` → discovers `/api/oauth/authorize` etc.
4. DCR at `/api/oauth/register` (or reuses an existing client). One registration covers both MCPs.
5. Claude redirects user to `/api/oauth/authorize?resource=.../api/mcp/meta_ads&client_id=...&...`.
6. NotFair's authorize endpoint reads `resource`, sees it's a Meta resource, and kicks off Meta's upstream OAuth. Meta posts back to `/api/oauth/meta/callback`, which finishes the upstream leg and issues NotFair's authorization code.
7. Claude exchanges the code at `/api/oauth/token` → NotFair stamps an `oat_meta_ads_*` token bound to the Meta resource (token's `aud` = the resource URL).
8. Claude calls `/api/mcp/meta_ads` with the token → MCP route validates prefix matches its expected platform.

The `resource` parameter (RFC 8707) is what makes step 5–6 dispatch correctly and what lets the issued token carry the right `aud` so resource A's tokens never authenticate at resource B.

### Tokens

**Per-resource tokens, audience-scoped.** Each token is valid only for the resource it was issued for:

- Google legacy: `oat_*` — existing tokens, audience = `/api/mcp`. Kept valid forever for backward compat.
- Google new: `oat_google_ads_*` — issued for any new Google connection. Audience = `/api/mcp/google_ads` (also accepted at `/api/mcp` since both serve the same handler).
- Meta: `oat_meta_ads_*` — audience = `/api/mcp/meta_ads`.
- Future: `oat_tiktok_ads_*`, `oat_linkedin_ads_*`, etc.

Each MCP's auth resolver checks the prefix and the token's resource binding. No cross-platform token validation. The verbose prefix scheme makes platform routing trivial and tokens self-documenting in logs/dashboards.

The token row stores `resource_url` so a token issued for `/api/mcp/google_ads` cannot be replayed against `/api/mcp/meta_ads` even if the prefix were spoofed.

### Internal upstream callbacks (not in well-known)

`/api/oauth/google/callback` and `/api/oauth/meta/callback` are the URLs registered in Google's and Meta's developer portals. They're plumbing — the user's Claude.ai client never sees them, and they're not advertised in any well-known document.

## Database

**Keep `mcp_sessions` for Google (backward compat). Add `ad_platform_connections` for Meta and future platforms.**

```
mcp_sessions (existing, untouched)
├── refreshToken, customerId, customerIds[]
└── Used by: Google Ads MCP

ad_platform_connections (new)
├── id, user_id, platform, refresh_token, access_token, expires_at
├── account_ids JSONB (e.g., [{id, name, currency, timezone}])
├── platform_metadata JSONB (platform-specific extras: business_id, etc.)
└── Used by: Meta MCP, future platform MCPs
```

When (if) we eventually want unified user-level connection queries ("what platforms does this user have connected?"), backfill Google sessions into `ad_platform_connections`. For now, two tables is fine.

## Shared infrastructure

These are shared between MCPs as **libraries**, not exposed as MCP surfaces:

| Component | Why shared |
|---|---|
| `lib/db/*` | One database, one connection pool |
| `lib/mcp/handler-factory.ts` (new) | DRY the `mcp-handler` setup boilerplate |
| `lib/mcp/auth/*` | Per-token-prefix resolver, shared `AsyncLocalStorage` pattern |
| `lib/mcp/telemetry.ts` | One PostHog stream, one product |
| User identity (NotFair user ID) | Same user, multiple platform connections |

The "no shared MCP tools" rule applies only to LLM-facing tools. Server plumbing is shared aggressively.

## Frontend

### `/connect` page
Becomes a list of platforms with per-platform tiles:

```
Connect your ad accounts
─────────────────────────────────────
[✓] Google Ads          3 accounts connected   [Manage]
[ ] Meta Ads                                    [Connect]
[ ] TikTok Ads                                  [Coming soon]
[ ] LinkedIn Ads                                [Coming soon]
```

Each tile kicks off its platform's OAuth flow. Connection status is read from `mcp_sessions` (Google) or `ad_platform_connections` (others) for the current user.

After connecting Meta, the tile shows the connected ad accounts and a "Manage" link.

### Account picker

Where the dashboard currently shows a Google account selector, it becomes per-platform. The user picks a platform context first ("I want to look at Meta") then an account within that platform. We don't unify the picker — keeps the mental model platform-local, matches how the agent operates.

### Connector install copy

Each platform tile, after connection, surfaces a "Add to Claude" button (or equivalent for Cursor / Codex) that installs the platform-specific MCP into the user's MCP client. Two installs total for a user with both platforms.

## Cross-platform questions

User asks: "What's my total ad spend this week across Google + Meta?"

User has both NotFair connectors installed in Claude.ai. The agent sees `runScript` from both MCPs (different servers, same tool name — Claude.ai shows them as `notfair_google__runScript` and `notfair_meta__runScript` or similar). The agent:

1. Calls Google MCP `runScript` → returns Google spend
2. Calls Meta MCP `runScript` → returns Meta spend
3. Sums in its reasoning, presents to user

No server-side cross-platform logic. The agent does the aggregation, which is what it's good at.

## Endpoint coexistence: `/api/mcp` and `/api/mcp/google_ads`

**Both paths are first-class.** They serve identical handlers — not redirects, not aliases via rewrite. Both exist permanently:

- `/api/mcp` — for existing tokens and connectors. Backward compat, kept indefinitely.
- `/api/mcp/google_ads` — for new connectors registered after the multi-platform shape lands.

New OAuth flows direct connectors to `/api/mcp/google_ads` so their connector entry says "NotFair Google Ads" naturally. Old tokens at `/api/mcp` keep working forever; we don't deprecate.

`/api/mcp/meta_ads` is brand new — no migration concerns.

## Rollout safety

The plan introduces multiple changes that *could* destructively affect existing users if implemented naively. This section catalogues the risks and the mitigations each stage must honor. Tool names themselves are unchanged from the pre-multi-platform shape, so there is no rename blast radius and no `tool_permissions` migration needed.

### Backward-compatibility invariants (must hold at every stage)

1. Existing `oat_*` tokens authenticate at `/api/mcp` without modification.
2. `oauth-protected-resource` at the root path returns the same body it does today (`resource: /api/mcp`, same auth-server pointer).
3. `oauth-authorization-server` document path and body unchanged.
4. `/api/oauth/{authorize,token,register}` accept legacy requests with no `resource` parameter, defaulting to `/api/mcp`.
5. 401s from `/api/mcp` (legacy resource) emit the same `WWW-Authenticate` header they emit today.
6. `mcp_sessions` table schema unchanged. Active Google customer state continues to live there.
7. `/api/auth/select-account` and related browser-facing routes accept legacy payloads (no `platform` arg → defaults to `google`).

### Destructive risks and required mitigations

1. **Audience enforcement against legacy `oat_*` tokens.** Plan introduces `aud`-bound tokens; legacy rows have no `aud`. Strict checking would kill every existing connector on the next request.
   *Mitigation:* at migration time, backfill `resource_url = '/api/mcp'` on every existing `oat_*` row. Resolver treats missing/null as `/api/mcp` for the legacy prefix only. Audience checking is additive, not a new gate.

2. **Required `resource` parameter on `/api/oauth/authorize` and `/api/oauth/token`.** Already-registered Claude clients won't send `resource` on re-auth/refresh.
   *Mitigation:* when `resource` is absent, default to `/api/mcp`. (Stage 1 already specifies this — locking it.)

3. **`WWW-Authenticate` `resource_metadata` URL on 401.** Today the route hardcodes the *root* `/.well-known/oauth-protected-resource` URL. If `/api/mcp/meta_ads` emits the same root URL, Claude discovers `resource: /api/mcp` and authenticates against the wrong resource.
   *Mitigation:* the factory must emit a path-suffixed metadata URL per route (`/.well-known/oauth-protected-resource/api/mcp/meta_ads` for the Meta route). Legacy `/api/mcp` keeps emitting the root URL.

4. **Path-aware protected-resource doc, strict mode.** Today's catch-all returns a default body for *any* path. Tightening to a hard-allowlist 404 could break existing clients that probed an odd sub-path.
   *Mitigation:* soft allowlist — return tailored bodies for known paths (`api/mcp`, `api/mcp/google`, `api/mcp/meta`); fall back to the root body (`resource: /api/mcp`) for everything else. Don't 404.

5. **Active-customer state shape changes.** "Sticky-with-override per platform" implies a per-platform map. If session shape changes and old sessions don't migrate, every existing user gets dumped back to the picker.
   *Mitigation:* keep `mcp_sessions.customerId` as the Google source of truth (already specified). Add Meta active-account state to `ad_platform_connections`, not to the existing session blob. Old sessions remain valid as-is.

6. **`/api/auth/select-account` etc. acquiring a `platform` arg.** Browser tabs already open at deploy time will POST without `platform`.
   *Mitigation:* `platform` is optional, defaults to `'google'`. Required only for explicit Meta calls.

7. **Mid-flight OAuth dances at deploy time.** A user mid-consent at the moment new authorize logic ships returns to a callback that may interpret state differently.
   *Mitigation:* callback logic must remain compatible with both code paths during the transition (read state, dispatch on what's there; never *require* new fields on legacy state blobs). Deploy in a low-traffic window.

8. **Handler-factory parity bugs.** Not a design risk, a refactor risk: the factory will own auth resolution, AsyncLocalStorage threading, telemetry wrapping, error envelopes, and MCP metadata for *all* existing users on day one. Subtle behavior shifts hit 100% of traffic.
   *Mitigation:* characterize the existing `/api/[transport]/route.ts` with tests *before* extraction (record current `tools/list` output, current 401 envelope, current telemetry events). Diff after extraction. Consider a brief shadow/canary at the edge.

### Adjacent items (not destructive but worth tracking)

- **`/connect` page redesign** to platform tiles is a visible cosmetic shift; not functional breakage. One-time notice covers it.
- **DCR re-registration** when a user adds a second connector creates a second `client_id` row — fine, just inflates the table.
- **Subscription/billing** computed off `mcp_sessions` today; plan leaves that table alone → billing unchanged.
- **`captureClientInfo` parity for Meta** — gap to fill, not a regression.

## Build sequence

### Stage 1: scaffold the multi-MCP shape
- Refactor MCP setup into `lib/mcp/handler-factory.ts` — accepts a platform name, token prefix, and tool registrar
- Add `app/api/mcp/google_ads/route.ts` — calls the factory
- `/api/[transport]/route.ts` continues to serve the same handler at `/api/mcp` (existing dynamic route, transport=mcp)
- Make `app/.well-known/oauth-protected-resource/[[...path]]/route.ts` **path-aware**: derive `resource` from `params.path`, allowlist known MCP paths
- Teach `/api/oauth/authorize` to read the RFC 8707 `resource` parameter (default to `/api/mcp` when absent, for back-compat with already-registered Claude clients)
- Teach `/api/oauth/token` to stamp token prefix from the `resource` claim
- Each MCP server returns a per-platform `serverInfo.name` (`notfair-google-ads-mcp`); tool names themselves are not renamed
- Update internal docs and instructions to reflect the new URL shape

### Stage 2: Meta MCP skeleton
- Create `app/api/mcp/meta_ads/route.ts` using the new factory
- Empty tool list initially — confirms the route serves valid MCP protocol
- Extend the path-aware protected-resource doc to allowlist `/api/mcp/meta_ads`
- Add `ad_platform_connections` migration

### Stage 3: Meta OAuth + connection
- Add `/api/oauth/meta/callback` — internal upstream callback (the URL Meta posts back to). **Not** advertised in well-known.
- Extend `/api/oauth/authorize` dispatch: if `resource` ends in `/api/mcp/meta_ads`, route the user to Meta's upstream OAuth instead of Google's
- Extend `/api/oauth/token` issuance: stamp `oat_meta_ads_*` for Meta-resource codes
- Reuse the existing `/api/oauth/authorize`, `/api/oauth/token`, `/api/oauth/register` — no new authorize/token endpoints
- `/connect` page Meta tile + connection flow
- Token storage in `ad_platform_connections`

### Stage 4: First Meta tools
- `lib/meta-ads/client.ts` — Graph API wrapper
- Tools: `listAdAccounts`, `getInsights`, `pauseCampaign`, `pauseAdSet`, `pauseAd`, `runScript`
- Hook them up to `app/api/mcp/meta_ads/route.ts`

### Stage 5: Real-world iteration
- Dogfood with our own Meta accounts via System User token (see [meta-marketing-api-setup.md](./meta-marketing-api-setup.md))
- Add tools as we hit walls — don't pre-build all 30
- Watch which read/write patterns users actually want

### Stage 6 (parallel with 5): Meta App Review
- Submit for advanced access on `ads_management`, `ads_read`, `business_management`
- Once approved, ship Meta MCP to all users

## Locked decisions

1. **Endpoint coexistence**: `/api/mcp` and `/api/mcp/google_ads` both serve the same handler permanently — not a redirect/rewrite, two real routes pointing at one implementation.
2. **OAuth surface**: **one shared authorization server, N protected resources.** Single `oauth-authorization-server` document, per-resource `oauth-protected-resource` documents (path-aware catch-all), shared `/api/oauth/{authorize,token,register}` endpoints. Per-platform upstream OAuth dispatch is driven by the RFC 8707 `resource` parameter, not by separate authorize/token routes. See "OAuth surface" section.
3. **Token prefixes**: verbose and explicit. `oat_meta_ads_*`, `oat_google_ads_*` for new tokens. Existing `oat_*` Google tokens stay valid forever. Each token is bound to a specific resource URL (`aud`).
4. **Connectors**: two separate connectors in MCP clients — "NotFair Google Ads" and "NotFair Meta Ads". Users install whichever platforms they use. Both connectors authenticate against the same NotFair AS, so a single NotFair sign-in covers both.
5. **Account selection state**: **sticky-with-override per platform**. The user picks an active Google customer and an active Meta ad account in the `/connect` UI; the session stores both. Tools default to the active account but accept an optional override argument for cross-account questions. Best UX because:
   - Common case (operating on one account) needs no `accountId` argument
   - Rare case (compare accounts) is still possible via override
   - Switching active account is a UI action, not a per-call concern
6. **Handler factory shape**: see "Handler factory" section below.

## Handler factory

The current Google MCP route (`app/api/[transport]/route.ts`) is ~441 lines and combines: auth resolution, AsyncLocalStorage setup, tool registration, telemetry wrapping, error handling, MCP protocol metadata, system instructions. To avoid copy-pasting all of that into every new platform route, we extract a factory.

**Pattern:** the factory owns shared concerns; each route is a thin file that declares its platform identity and tools.

```ts
// lib/mcp/handler-factory.ts
export function createPlatformMcpHandler(config: {
  platform: 'google_ads' | 'meta_ads' | ...
  tokenPrefix: string                   // e.g. 'oat_meta_ads_'
  legacyTokenPrefixes?: string[]        // e.g. ['oat_']  (Google only)
  resolveConnection: (token, ctx) => Promise<Connection>
  registerTools: (server: McpServer, ctx: AuthContext) => void
  systemInstructions: string
}) { ... }
```

```ts
// app/api/mcp/meta_ads/route.ts (becomes ~30 lines)
export const POST = createPlatformMcpHandler({
  platform: 'meta_ads',
  tokenPrefix: 'oat_meta_ads_',
  resolveConnection: resolveMetaConnection,
  registerTools: registerMetaTools,
  systemInstructions: META_SYSTEM_INSTRUCTIONS,
})
```

The factory owns: protocol handshake, token resolution dispatch, AsyncLocalStorage threading, telemetry wrapping, error formatting, OPTIONS/CORS, MCP metadata responses. Each route owns: platform identity, its own tool registrar, its own connection resolver, platform-specific system instructions.

Routes can still bypass the factory if a platform genuinely needs custom behavior — but for the foreseeable two platforms, the factory shape covers everything.

## Non-goals

Things explicitly NOT in scope for this design:

- A NotFair "orchestration MCP" that wraps both platforms — defer to user's MCP client (Claude.ai etc.) handling multi-MCP
- Unified cross-platform reporting tools — `runScript` per platform + agent reasoning is sufficient
- Sub-agent / agent-as-tool patterns — premature

## References

- [meta-marketing-api-setup.md](./meta-marketing-api-setup.md) — Meta developer portal application steps
- Existing Google Ads MCP entry: `app/api/[transport]/route.ts`
- Tool registration: `lib/mcp/read-tools.ts`, `lib/mcp/write-tools.ts`, `lib/mcp/code-mode/index.ts`
- Schema: `lib/db/schema.ts`
