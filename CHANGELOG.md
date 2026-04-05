# Changelog

All notable changes to AdsAgent will be documented in this file.

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
