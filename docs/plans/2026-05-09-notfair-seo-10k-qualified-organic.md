# NotFair SEO Plan: 10K Qualified Organic Clicks

Created: 2026-05-09

## Goal

Reach 10,000 qualified non-brand organic clicks per month for NotFair.

Qualified means the landing page plausibly drives one of the product events that matter:

- Google Ads account connection
- Claude, Codex, Cursor, or MCP setup
- free audit start
- first successful read
- first successful write

This plan optimizes for NotFair's north stars: D0 Write Users and Weekly Active Writers.

## Current Baseline

Latest Toprank/GSC read:

- Organic clicks, trailing 28d: 16
- Organic impressions, trailing 28d: 151
- CTR: 10.6%
- Average position: 7.2
- Non-brand clicks: 0
- Non-brand impressions: 12

Visible non-brand queries:

- `codex google ads`: 3 impressions, position 10
- `google ads connector`: 2 impressions, position 65
- `hipaa-compliant google ads`: 3 impressions, position 80

This is seed-stage SEO. The job is to build demand-capture pages and authority, not tune mature CTR.

## Keyword Demand

Keyword Planner data from NotFair MCP, US English:

### Bottom-Funnel MCP And Connector

- `google ads mcp`: 390/mo, LOW competition, top-of-page bid $6.99-$56.64
- `google ads mcp server`: 110/mo, LOW, $3.28-$29.82
- `google ads connector`: 50/mo, LOW, $3.71-$17.36
- `claude connector`: 110/mo, LOW, $4.21-$40.48
- `google ads claude connector`: 10/mo, LOW, $4.86-$15.60
- `connect google ads to claude`: 10/mo, MED, $3.90-$15.56

### AI Google Ads Tooling

- `google ads ai`: 390/mo, MED, $15-$100
- `google ai ads`: 480/mo, LOW, $13.49-$185.85
- `google ads ai tool`: 110/mo, MED, $12.21-$69.70
- `ai for google ads`: 110/mo, MED, $12.05-$100
- `google ads ai agent`: 50/mo, MED, $10.63-$37.19

### Optimization And Automation

- `google ads optimizer`: 210/mo, LOW, $12.08-$51.82
- `google ads optimization tool`: 110/mo, LOW, $11.16-$43.19
- `google ads automation`: 70/mo, LOW, $8.27-$27.57
- `google ads automation tools`: 70/mo, LOW, $12.55-$52.07

### Negative Keywords

- `negative keywords google ads`: 170/mo, LOW
- `google ads negative keywords`: 170/mo, LOW
- `negative keywords list`: 170/mo, LOW, $2.94-$23.66
- `find negative keywords`: 110/mo, LOW, $2.41-$10
- `performance max negative keywords`: 20/mo, LOW

The AI-modified negative-keyword phrases returned no Planner volume. Treat them as early category bets layered on top of the proven base terms.

## Architecture

### Canonical Owner

`/google-ads-mcp` is the canonical owner for:

- `google ads mcp`
- `google ads mcp server`
- `google ads connector`
- `google ads claude connector`
- `mcp google ads`

`/google-ads-mcp-server` should 301 redirect to `/google-ads-mcp` to avoid cannibalization.

### First Tranche Pages

Implemented targets:

- `/google-ads-mcp` refreshed as the canonical MCP/connector owner.
- `/google-ads-connector` for connector-specific intent.
- `/google-ads-ai-tool` for high-bid AI-tool intent.
- `/google-ads-optimization-tool` for optimizer/automation intent.
- `/blog/negative-keywords-google-ads-ai` for product-fit search-term cleanup content.

### Next Content Tranches

Tranche 2:

- `/blog/google-ads-api-vs-mcp`
- `/blog/google-ads-api-claude`
- `/blog/google-ads-automation-tools`
- `/blog/google-ads-optimizer`
- `/blog/performance-max-negative-keywords`

Tranche 3:

- `Optmyzr alternative`
- `WordStream alternative`
- `TrueClicks alternative`
- `Google Ads MCP alternatives`
- `best Google Ads MCP server`

Tranche 4:

- vertical pages for agencies, SaaS, ecommerce, local services, and healthcare only where the copy can tie to concrete workflows.

## 10K Click Model

The exact MCP terms are valuable but too small to hit 10K alone.

Target portfolio:

- MCP and connector pages: 1K-2K clicks/month
- AI Google Ads tool/agent/automation pages: 2K-3K clicks/month
- negative-keyword and search-term cleanup content: 1.5K-2K clicks/month
- Google Ads API/developer guides: 2K clicks/month
- comparison and alternative pages: 1K-2K clicks/month

This likely requires 40-80 useful pages, not hundreds of thin pages.

## Operating Loop

Weekly Toprank review should track:

- non-brand impressions and clicks
- query/page ownership
- pages with impressions but zero clicks
- organic visits to `/connect`
- organic connect events
- first successful read after organic entry
- first successful write after organic entry
- WAW from organic cohorts

Execution rule:

1. Create/refresh a small tranche.
2. Submit sitemap.
3. Wait for impressions.
4. Use GSC query/page data to decide whether to sharpen metadata, add support content, or build links.
5. Measure downstream product actions, not just clicks.

## Backlink And Citation Targets

Priority:

- MCP directories
- AI tool directories
- Product Hunt
- SaaSHub
- AlternativeTo
- relevant Google Ads/PPC newsletters and YouTube sponsorships
- comparison pages where NotFair is currently absent

Anchor text should favor:

- Google Ads MCP
- Google Ads MCP server
- Google Ads connector
- AI Google Ads tool
- Google Ads optimization tool

