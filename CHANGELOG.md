# Changelog

All notable changes to AdsAgent will be documented in this file.

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
