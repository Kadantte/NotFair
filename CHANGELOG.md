# Changelog

All notable changes to AdsAgent will be documented in this file.

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
