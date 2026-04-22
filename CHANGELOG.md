# Changelog

All notable changes to AdsAgent will be documented in this file.

## [0.2.23.1] - 2026-04-22

### Added
- Developer accounts (listed in `DEV_EMAILS`) now resolve to an unlimited Growth-equivalent plan without a paid Stripe subscription, so rate limits and feature gates behave as if those accounts were on Growth. A real Stripe subscription still takes precedence when present.

## [0.2.23.0] - 2026-04-21

### Changed
- Home page hero repositioned around dual-audience value prop: "Every Google Ads campaign deserves your best work. AdsAgent gives Claude the tools to analyze and execute across Google Ads, CRM, GA4, and Search Console." Drops the defensive "no commissions, best interest at heart" framing that only spoke to self-managing operators and missed the agency execution story entirely.
- "What you get" section rewritten around cross-system analysis, execution (not just reporting), playbook-at-scale, and full transparency — the value props that resonate with both small-business operators and agency owners managing client rosters.

### Added
- New "For agencies" section (Briefcase/DollarSign/Shield cards): scale your playbook, smaller accounts become profitable, raise the quality floor. Speaks to agency owners who want consistent execution across a roster without adding headcount.
- New "For small business owners" section (Scale/Layers/UserCheck cards): work that never fit your budget, one brain across your whole stack, you stay in the driver's seat. Speaks to operators who already run their own ads but want depth no freelancer would do at their spend.
- `AudienceSection` component extracted locally in `home-page.tsx` to eliminate duplicated section scaffolding (motion wrapper, header block, 3-card grid).

## [0.2.22.3] - 2026-04-21

### Fixed
- Reddit Pixel now strips unresolved `{{RDT_CID}}` template placeholders from the URL before initializing. When a Reddit campaign's URL tracking template contains a non-macro like `?rdt_cid={{RDT_CID}}`, Reddit leaves it as literal text — the pixel would then send the string `{{RDT_CID}}` as the `click_id`, triggering Reddit's "Invalid match key 'click ID'" event-quality warning on ~18% of PageVisits. We now detect `rdt_cid` values matching `{{...}}` and remove them via `history.replaceState` so Reddit's auto-appended real click ID wins.

## [0.2.22.2] - 2026-04-20

### Fixed
- Reddit Conversions API `action_source` must be uppercase (`WEBSITE`, `APP`, etc.), not lowercase. Prior releases sent `"website"` and Reddit returned `400 invalid action_source` on every server-side fire. Caught via `test_id` probe against Reddit's Test Events endpoint.

## [0.2.22.1] - 2026-04-20

### Fixed
- Reddit Conversions API now targets the v3 endpoint (`POST /api/v3/pixels/{pixel_id}/conversion_events`) with the v3 payload shape: `data.events[]`, `event_at` as unix-ms, nested `type: { tracking_type }`, `metadata` (not `event_metadata`), and a required `action_source` defaulting to `"website"`. The v2.0 endpoint the prior release targeted no longer exists in Reddit's docs, so every CAPI call was silently 404-ing.

## [0.2.22.0] - 2026-04-20

### Added
- Reddit Ads conversion tracking: client Pixel (PageVisit on every page, SignUp echo with advanced matching for authenticated users) plus server-side Conversions API for dedup-safe event delivery. Requires `NEXT_PUBLIC_REDDIT_PIXEL_ID` and `REDDIT_CONVERSION_ACCESS_TOKEN` env vars.
- First successful write now fires a Reddit `Lead` conversion so the pixel optimizer trains on AdsAgent's activation north star (D0-Write) instead of OAuth connects. Uses a stable `first-write-${userId}` conversion_id so concurrent bulk-write races dedupe.
- `getClientIp()` helper in `lib/request-ip.ts` — shared IP extraction for PostHog and Reddit CAPI callers.

### Changed
- In-process cache on the first-write check: once a user has any prior successful write, subsequent `logChange` calls short-circuit without hitting the DB. Bulk-write ops (`bulkUpdateBids`, `bulkPauseKeywords`) no longer pay N extra SELECTs.
- Exported `REDDIT_SIGNUP_ID_COOKIE` + `RedditConversionInput` so auth routes and the client tracker share one cookie name and one input type.

## [0.2.21.0] - 2026-04-19

### Fixed
- `bulkUpdateBids` was rejecting 100% of calls with "Bid changes not supported for 3 strategy" because the bidding strategy enum was compared as a raw number (`3`) against the string list `["MANUAL_CPC", "ENHANCED_CPC"]`. Added `normalizeBiddingStrategyName` so numeric, string, and numeric-string forms all resolve correctly. Manual-CPC campaigns now work again; auto-bidding campaigns return a clear "switch to MANUAL_CPC or let the strategy handle bids" message.
- `moveKeywords` now auto-retries up to 3 attempts with jittered backoff when Google Ads returns transient `database_error=2` ("Multiple requests were attempting to modify the same resource. Retry the request."). Eliminates ~20 failures/week that required no human action.
- `pauseKeyword` and `bulkPauseKeywords` now detect "Negative ad group criteria are not updateable" and rewrite the error with a pointer to `removeNegativeKeyword`. Tool descriptions updated so agents call the right tool first try.
- Policy violations on `createCampaign`, `bulkAddKeywords`, and `updateAdAssets` now parse `PolicyViolationDetails` from the Google Ads failure and return a readable message like `"TRADEMARK on text \"Nike\""` instead of the opaque `policy_violation_error=2`.
- Budget and bid guardrail rejections (`updateCampaignBudget`, `updateBid`) now include concrete `setGuardrails` args in the error message, so agents can parse the exact threshold to request instead of guessing.
- Mutate catch blocks now recognize `context_error=3` / "operation is not allowed for removed resources" and emit an entity-specific message pointing at `listCampaigns` / `listAdGroups` / `listAds` so agents stop retrying against tombstoned entities.
- Telemetry `operations` rows with `error_class='THROWN'` or `'RATE_LIMIT'` now populate `error_message` (previously `NULL`). The bug lived in the shared `execRead` / `execWrite` wrappers, so every MCP read and write tool benefits. Closes 14 diagnostic-blind failures/week.
- `bulkUpdateBids` GAQL pre-check now filters non-integer criterion IDs before interpolation, preventing `IN (123,NaN,456)` from failing the entire batch.

### Changed
- `pauseKeyword` / `bulkPauseKeywords` tool descriptions clarify "POSITIVE keywords only" and point to `removeNegativeKeyword` for negatives.
- `removeNegativeKeyword` description now includes the word "pause" so LLM semantic search routes there.
- `addNegativeKeyword` description notes it is the re-enable path for negatives (Google Ads has no "enable" state for negatives).

## [0.2.20.1] - 2026-04-19

### Fixed
- `change_event` query in `audit` now includes an upper bound on `change_date_time` (Google Ads rejects one-sided date filters on this resource). Fixes `recentChange` and `recentChanges` coming back empty immediately after the v0.2.20.0 deploy.
- Audit error reporting now uses `extractErrorMessage` so `GoogleAdsFailure` objects produce readable messages instead of `[object Object]`. Also fixes the pre-existing `campaign_assets` and `landing_pages` log lines.

## [0.2.20.0] - 2026-04-19

### Added
- `audit` MCP tool is now change-aware. Every audit pulls Google Ads `change_event` for the last 30 days and attaches a `recentChange` pointer to every campaign and every flagged item (wasted keywords, wasted search terms, mining opportunities, brand-leakage terms, negative conflicts, budget-constrained winners). When the pointer is populated, the finding's metrics pre-date the fix — agents re-evaluate instead of recommending work that's already done. Each `recentChange` carries `{ daysAgo, changedFields, operation, clientType, resourceType, otherChangesInWindow }` so callers can see "budget raised 2 days ago, 3 other edits this week."
- Per-campaign `metricsSplit` splits spend/clicks/conversions/CPA into `before` vs `after` buckets around the campaign's most recent edit, with `cpaDelta` and `dailySpendDelta` for quick post-change judgment.
- Top-level `recentChanges` list surfaces every account edit in the window, including edits from the Google Ads UI (not just MCP writes) — `client_type` tells the agent where the change came from.
- Tool description now instructs the agent to prefer `metricsSplit.dailySpendDelta` over the aggregate `budgetLostIS` when `changedFields` includes `amount_micros` or bidding fields, since impression-share metrics reflect the full 30-day window and lag post-change reality.

## [0.2.19.3] - 2026-04-19

### Fixed
- `/dev/telemetry` dashboard now reports honest invocation counts for bulk MCP tools. Before: `bulkPauseKeywords`, `bulkAddKeywords`, `bulkUpdateBids`, `moveKeywords`, `updateCampaignSettings`, `createCampaign`, `setTrackingTemplate`, `uploadClickConversions`, and `updateCampaignLanguages` inflated call counts 5-7× because each fan-out item wrote its own row. The dashboard now dedupes by `request_id` across `topTools`, `topArgShapes`, and `dailyCounts`. Latency percentiles are computed per-invocation so one slow bulk call isn't weighted 25× in p50/p95.
- MCP bulk-tool telemetry now records real latency instead of 0 ms. The per-item `execWrite` stub path (`async () => result`) resolved in microseconds, so every fan-out row logged `latency_ms = 0` — 281/281 rows in the wild. Bulk handlers now measure the real Google API call themselves and thread the latency through a new `overrideLatencyMs` option on `execWrite`. Dashboards will start showing real write latencies for bulk tools immediately after deploy.

## [0.2.19.2] - 2026-04-16

### Changed
- MCP write operation counting now matches Google Ads API mutate-quota accounting more closely. Every returned `WriteResult` is logged and counted — including failed attempts that were previously silently dropped. Bulk tools (`bulkUpdateBids`, `bulkPauseKeywords`, `bulkAddKeywords`, `moveKeywords`) count each keyword in the batch, whether Google accepted or rejected it. Single-op writes (`pauseKeyword`, `updateBid`, etc.) now count their failures too, where they used to only count successes. The daily limit on `/usage` can no longer under-report relative to Google's mutate quota; it may over-count slightly when our pre-validation rejects an input Google never sees, which is the intended direction.
- Change history (`getChanges`), impact analysis (`getImpact`), and undo (`getUndoableChange`) filter to real changes only, so the user-facing history shows successes only as before.
- New `ai_change_failed` PostHog event fires on every failed write through `execWrite`. Pairs with `ai_change_executed` to compute per-tool failure rates.

### Fixed
- `/usage` chart hourly count now reflects true daily API pressure, not just successful changes. A misbehaving bulk call that Google rejects is now visible as usage instead of invisible.

## [0.2.19.1] - 2026-04-15

### Fixed
- MCP `client_name` telemetry now correctly attributes Claude Code plugin traffic instead of the `mcp-remote-fallback-test` sentinel. The `mcp-remote` wrapper the Claude Code install instructions use does not forward the downstream client's `clientInfo.name`, so 100% of Claude Code sessions were mis-tagged. `app/api/[transport]/route.ts` now normalizes the fallback to `claude-code` based on auth method and user-agent, both on first-initialize capture and on every subsequent request. Existing sessions in Supabase were backfilled.

## [0.2.19.0] - 2026-04-13

### Added
- Inline "Reach out" panel on every customer detail page (`/dev/[accountId]`) — for connected customers who went dormant, compose a personalized email, save it as a Gmail draft, and send via Gmail so the full thread stays in your inbox. Shows last 15 Gmail threads with that customer and the date you last contacted them
- Panel is collapsible, remembers open/closed state per customer in `localStorage`, and loads Gmail threads lazily only on expand — browsing customer detail pages triggers zero Gmail API calls until you actually reach out
- New migration `0018_add_contact_kind.sql` adds a `kind` column (`lead` | `customer`) to the `contacts` table so the `/dev` Leads tab stays cleanly scoped to cold prospects while customer re-engagement drafts live in the same schema

### Changed
- `DraftEditor` now takes `onSave` / `onSend` callbacks instead of reaching for server actions directly, so the lead profile and customer detail pages can share the same editor without coupling to a single identifier type
- `getContactsAction` filters the Leads tab to `kind='lead'`, so customer outreach drafts never pollute the cold-prospect pipeline
- `ThreadCard` extracted to `components/outreach/thread-card.tsx` and shared between the lead profile page and the new customer outreach panel

### Fixed
- Customer outreach state is now read-only on load — visiting a customer detail page never creates a contacts row. Rows are created lazily on first draft save via `upsertCustomerContactByEmail`, preserving existing `kind` if the email was already tracked as a lead

## [0.2.18.0] - 2026-04-13

### Added
- Internal mini-CRM on each contact's profile page at `/dev/contacts/[id]` — see the full Gmail thread history with a contact, edit drafts inline, and send directly via Gmail so sent mail and replies land in your own inbox
- Contact rows on `/dev` now link straight to the profile with prefetch, so opening a contact feels instant
- New migration `0017_add_gmail_draft_id.sql` adds `contacts.gmail_draft_id` so saved drafts stay in sync with Gmail Drafts across sessions

### Changed
- All outreach server actions (`getContactsAction`, `importContactsAction`, `deleteContactAction`, `scheduleContactAction`, `sendOutreachAction`, and the new Gmail actions) now require a dev session — previously unauthenticated callers could hit the RPC endpoints directly and dump/mutate contacts
- `sendDraftViaGmailAction` skips a redundant Gmail API call when a draft is already synced, shaving one round trip off every send
- Gmail thread lookup caches results for 45 seconds per contact email and invalidates on save/send, cutting ~16 Gmail API calls per profile page navigation
- `saveDraftAndSyncGmailAction` surfaces Gmail sync failures to the editor instead of silently swallowing them

### Removed
- Dead code: `saveDraftAction` (zero callers anywhere in the repo)
- Inline draft expand panel on `/dev` — replaced by the dedicated profile page

## [0.2.17.0] - 2026-04-13

### Changed
- Dev page "API Usage by Day" chart now renders in chronological order (oldest → newest) and fills missing days with zeros, so gaps in activity are visible instead of being silently collapsed
- Added summary stat cards above the chart: 30-day total (with active-day count), reads share, writes share, average per active day, and peak day

## [0.2.16.1] - 2026-04-09

### Fixed
- Campaign detail page top-line metrics (impressions, clicks, cost, conversions) now sum from the same date-filtered history data as the performance chart — previously used lifetime/all-time values from `listCampaigns` which never matched the chart

### Added
- Smart campaign support on the campaign detail page: keyword themes table, business info (name, URL, phone), and Smart badge on the Ad Copy section
- `getCampaignKeywordThemesAction` and `getSmartCampaignSettingAction` server actions for fetching Smart campaign-specific data
- `getSmartCampaignKeywordThemes` and `getSmartCampaignSetting` reads in `lib/google-ads/reads.ts`
- `smart_campaign_ad` fields in `listAds` query with RSA fallback logic (prefers RSA if populated, otherwise uses Smart ad fields)
- `metrics.conversions` in campaign history query

### Changed
- Campaign detail page uses 2-phase fetch: core data always, Smart-specific data only when campaign type is SMART (avoids 2 unnecessary API calls for non-Smart campaigns)
- `totals` now computed via single-pass `useMemo` reduce over history rows instead of 4 separate reduce passes

## [0.2.16.0] - 2026-04-08

### Added
- `searchGeoTargets` MCP tool: search for geo target locations by name (cities, counties, states, countries) and get their IDs for use with `updateCampaignSettings` location targeting and exclusions. Enables fully self-contained location targeting workflows without leaving the AI conversation.

## [0.2.15.1] - 2026-04-08

### Changed
- Split `lib/google-ads.ts` (3,703 lines) into 9 focused modules under `lib/google-ads/` for better maintainability: types, client, helpers, reads, writes, campaign-ops, bulk, settings, and barrel index

## [0.2.15.0] - 2026-04-08

### Fixed
- Impersonation now hard-fails when target session expires (prevents accidental writes to wrong account)
- `resolveAccountId` throws on invalid account IDs instead of silently falling back to default
- OAuth token endpoint enforces `redirect_uri` match per RFC 6749 S4.1.3
- Rate limit bypass in `createCampaign` and `setTrackingTemplate` (API was called before rate check)
- `findKeywordContext` uses `safeEntityId` for consistent validation instead of raw `Number()`
- Guardrail error messages now reference `setGuardrails` (previously referenced unreachable `setGoals`)

### Added
- `setGuardrails` / `getGuardrails` MCP tools for customizing bid, budget, and pause limits per account or campaign
- `DESTRUCTIVE_WRITE_ANNOTATIONS` for bulk/replacement operations (bulkPauseKeywords, bulkUpdateBids, updateAdAssets, moveKeywords)
- `resolveToolAuth` helper to reduce auth boilerplate across 33 MCP tool handlers
- Query cache max-size eviction at 500 entries (prevents unbounded memory growth)
- Parallel pre-check queries in `bulkPauseKeywords` (Promise.all instead of sequential)
- 42 new tests: undo system (23), rate limiting (12), execution layer (7)

## [0.2.14.0] - 2026-04-08

### Added
- `updateCampaignBidding` MCP tool: change a campaign's bidding strategy (TARGET_CPA, MAXIMIZE_CONVERSIONS, TARGET_ROAS, MAXIMIZE_CLICKS, MANUAL_CPC) with target CPA and ROAS support
- Full undo support for bidding strategy changes via `undoChange`
- Validation guardrails: minimum $0.10 target CPA, positive ROAS required, required params enforced per strategy
- 18 new tests covering all bidding strategies, validation paths, error handling, and protobuf wire format

## [0.2.13.0] - 2026-04-08

### Fixed
- MCP tool errors now return actual Google Ads API error messages instead of `[object Object]`
- `getResourceMetadata` and `listQueryableResources` now return results (fixed gRPC response destructuring)
- `getKeywords` Quality Score subcomponent fields (creative quality, predicted CTR, landing page quality) now work correctly

### Changed
- All 44 MCP tool handlers wrapped with error boundaries via `safeHandler` for consistent error reporting
- MCP server URL updated to canonical `www.adsagent.org` domain

## [0.2.12.0] - 2026-04-07

### Added
- Dev impersonation: select any account from the /dev page and see the app exactly as that user sees it, with full read/write access for debugging and support
- Amber "Viewing as" banner with stop button shows during impersonation
- Account switcher disabled during impersonation to prevent modifying the real user's session
- 17 tests covering impersonation session logic, API routes, and sign-out cookie clearing

## [0.2.11.0] - 2026-04-06

### Changed
- Landing page rewritten for SMB audience: pain-driven hero with mock audit preview, comparison table (Self-Manage vs Agency vs AdsAgent), vertical targeting (Legal, Home Services, Healthcare, Insurance), pricing tiers ($149/$349/$699), FAQ, and conversion-focused CTAs
- Font stack updated to match DESIGN.md: General Sans for headings, DM Sans for body, JetBrains Mono for code/data
- AI conversation demo now uses DESIGN.md's plumbing treatment (green left border + "Agent" label)
- "What you get" section restructured from 3-column icon grid to editorial divided list
- Section rhythm varied to break cookie-cutter feel (different padding per section, selective eyebrow labels)
- Final CTA left-aligned to match asymmetric layout from DESIGN.md
- Footer copy updated from developer jargon (MCP) to SMB-friendly language
- Vertical card colors corrected to on-brand palette (removed blue/violet)

### Fixed
- Touch targets on footer and pricing links now meet 44px minimum
- FAQ accordion now has proper ARIA disclosure attributes (aria-expanded, aria-controls)
- Added color-scheme: dark to html element for native dark UI controls
- CTA button now full-width on mobile to prevent overflow in pricing cards

### Added
- Scroll-triggered fade-in animations on stats bar and comparison table

## [0.2.10.0] - 2026-04-06

### Added
- Outreach metrics dashboard on the /dev page: bounce rate, reply rate, status pipeline, and per-domain bounce breakdown
- Unit tests for outreach metrics derivation covering all edge cases

### Changed
- Status colors unified into shared STATUS_CONFIG used by both pipeline bars and lead badges
- Metrics derived client-side from already-fetched contacts — no extra DB queries
- Refresh button now clears both stats and contacts cache

## [0.2.9.0] - 2026-04-06

### Added
- **Account Audit page** (`/audit`) — 7-dimension scoring engine evaluates conversion tracking, campaign structure, keyword health, search term quality, ad copy, impression share, and spend efficiency on a 0-5 scale, weighted to a 0-100 overall score
- Wasted spend analysis with dollar breakdown by category (non-converting keywords + irrelevant search terms) and annualized projection
- Impression share diagnosis using a 2x2 matrix (budget-lost vs rank-lost) with actionable recommendations
- Top 3 actions derived from the heuristics engine, sorted by estimated monthly savings
- Expandable detailed findings per dimension for any scoring 0-3
- Two-phase data loading: fast overview (4 parallel API calls) then detailed analysis (25 parallel per-campaign calls)
- Module-level client cache for instant return visits (stale-while-revalidate pattern)
- 29 unit tests for the scoring engine covering empty, well-optimized, and new account scenarios
- Audit nav item in sidebar and mobile bottom nav

## [0.2.8.0] - 2026-04-07

### Added
- Account budget overview on the dev page: total daily budget and active campaign count per connected Google Ads account
- Budget deduplication for shared campaign budgets so totals are accurate
- Proper currency formatting via `Intl.NumberFormat` with support for non-USD currencies
- Unit tests for budget summary function covering deduplication, edge cases, and empty states

### Changed
- Dev API route uses single `getAuthContext()` call instead of separate `getSession()` + `getSessionAuth()` queries
- Error handling in dev route now returns 500 for unexpected errors instead of blanket 403
- Campaign budget query filters to `ENABLED` campaigns only (was `!= REMOVED`, which included paused)

## [0.2.7.0] - 2026-04-05

### Added
- "Built for Claude" homepage positioning with Claude Code and Claude Cowork as primary AI clients
- Claude workflows section showing terminal, workspace, spend recovery, and A/B test use cases
- Conversation demo showing Claude managing Google Ads in natural language
- "Also works with" section for Cursor, Windsurf, and Claude Agent SDK
- Blog infrastructure: data store, rendering component, dynamic routes, and blog index page
- "What is MCP" blog post with FAQPage structured data
- Claude icon SVG asset for hero badge

### Changed
- Homepage hero cycles "Claude Code", "Claude", "AI agent" (previously included ChatGPT, OpenClaw)
- Homepage subtitle and 3-step onboarding rewritten for Claude-first messaging
- SEO metadata across site updated: title, description, keywords lead with Claude
- OG image updated: "Google Ads MCP built for Claude"
- Homepage FAQ rewritten with Claude-specific language and MCP explanation
- Sitemap now includes blog routes with per-post lastmod dates

## [0.2.6.1] - 2026-04-05

### Changed
- `addNegativeKeyword` now accepts a `matchType` parameter (BROAD, PHRASE, EXACT) instead of hardcoding PHRASE match
- `removeNegativeKeyword` accepts optional `matchType` to disambiguate when the same keyword text exists under multiple match types
- Undo operations for negative keywords now preserve the original match type instead of defaulting to PHRASE
- `listCampaigns` default limit increased from 20 to 100 so LLM clients see the full account
- Improved tool descriptions for `enableKeyword`, `moveKeywords`, `getImpressionShare`, `undoChange`, and `removeCampaign` to surface constraints and caveats that LLMs need

### Fixed
- `addNegativeKeyword` was sending match_type=2 (EXACT) while claiming PHRASE — now uses the correct enum mapping

## [0.2.6.0] - 2026-04-04

### Changed
- Keyword operations (pause, enable, update bid, remove) now log the keyword text alongside the criterion ID
- Operations page shows human-readable keyword names in the Entity column instead of raw IDs

### Added
- `label` column on `operations` table to store human-readable entity names
- `fetchKeywordText` helper to look up keyword text by criterion ID from Google Ads API

## [0.2.5.1] - 2026-04-04

### Changed
- Dev dashboard "Operations by Account" now shows the Google Ads account name alongside email and account ID
- Timestamps in the dev dashboard now display in the viewer's local timezone with timezone indicator

### Fixed
- Dev dashboard SQL query now handles null or empty `customerIds` without crashing

## [0.2.5] - 2026-04-04

### Added
- `removeCampaign` MCP tool for permanently removing Google Ads campaigns (sets status to REMOVED)
- `removeCampaign` tool in AI SDK agent for chat-based campaign removal
- Explicit undo handler for campaign removal with clear "permanent and cannot be undone" message

## [0.2.4] - 2026-04-03

### Added
- YouTube demo video embedded on landing page showing how to use AdsAgent MCP in Claude
- Privacy-enhanced embed (`youtube-nocookie.com`) to avoid tracking cookies before consent
- Tightened iframe permissions to minimum required for video playback

## [0.2.3] - 2026-04-03

### Added
- Dev dashboard (`/dev`) with API usage by day and operations by account, visible only to admin emails

## [0.2.2] - 2026-04-03

### Fixed
- `getCampaignSettings` now returns radius/proximity targeting (previously only fetched named locations, silently dropping PROXIMITY criteria)
- `listAds` metrics are now scoped to a configurable date range (default 30 days) instead of returning misleading lifetime totals

## [0.2.1] - 2026-04-02

### Changed
- Dashboard now loads in two phases: health score and metrics appear instantly, issues and opportunities load progressively in the background
- Non-converting search terms now show per-term intelligence explaining WHY each term isn't converting (CTR analysis, intent classification, landing page diagnosis)
- Issue descriptions are now campaign-level insights based on aggregate term patterns instead of generic text
- "Total Spend" metric renamed to "Spend (30d)" with explicit 30-day date filter on listCampaigns API
- Client-side cache keyed by account ID to prevent cross-account data leaks on account switch

### Removed
- AI Briefing component (Gemini LLM call that added latency without useful insight)

### Fixed
- Google Ads API v22 compatibility: removed deprecated `recommendation.impact.base_metrics/potential_metrics` fields
- Numeric enum returned by Google Ads API for `recommendation.type` now properly converted to string

## [0.2.0] - 2026-04-01

### Added
- Intelligence Dashboard (`/dashboard`) as the new post-login landing page
- Account Health Score (0-100) with weighted composite algorithm covering CPA efficiency, quality scores, impression share, waste ratio, and change momentum
- Money-on-Fire Detector showing daily waste from zero-conversion search terms
- Issue detection engine identifying wasted search terms, low-quality keywords, and declining campaigns
- One-click Fix actions on issue cards (add negative keywords, pause keywords) with inline confirmation
- Opportunity detection for impression share headroom and Google Ads recommendations
- One-click Apply actions on opportunity cards (increase budget) with inline confirmation
- AI Briefing card powered by Gemini 2.5 Flash generating daily account summaries
- Trend sparklines on metric cards using 7-day performance snapshot data
- Impression share visualization by campaign with progress bars
- Recent changes section with time-ago formatting and before/after values
- Week-over-week CPA comparison for declining campaign detection
- 38 unit tests covering health score algorithm, issue detection, and opportunity detection

### Changed
- Dashboard is now the first item in the sidebar navigation
- Connect page "Open AdsAgent" button now navigates to `/dashboard` instead of `/chat`
- Added `ad_group.id` to keyword GAQL query for pause-keyword support
- Added `/dashboard` to protected routes in middleware

## [0.1.0] - 2026-03-25

### Added
- Initial release with campaigns page, chat interface, operations log, and MCP server
