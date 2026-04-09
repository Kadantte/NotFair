---
question: "Where are new visitors located and where are they coming from?"
date: 2026-04-08 17:57 PST
data_sources: PostHog project 368485 — $pageview with $geoip_country_name, $geoip_city_name, $referring_domain, utm_source — Mar 25 – Apr 8, 2026
html: docs/analysis/2026-04-08_17-57_visitor-geography-sources.html
---

## Visitors are 55% US (WA-state cluster), 9% India — Reddit drove launch, no organic channel yet

**Verdict:** ~100 unique visitors from 20+ countries in 14 days. US dominates with 55% of visitors and 89% of pageviews. WA-state alone (Seattle/Bellevue/Renton/Marysville) = 13 visitors with extreme engagement (50-120 pv/visitor). Non-US visitors bounce after 1-2 pages. Reddit (23 visitors) was the launch channel; Google organic is only 5 visitors.

**Findings:**
1. **US dominates** — 54 visitors, 960 pageviews. WA-state cluster shows product-market fit is local. **(High)**
2. **India 2nd by visitors (9%) but low engagement** — 9 visitors, 2 pv/visitor avg. Bounces. **(High)**
3. **Türkiye power users** — 2 visitors, 33 pageviews (16.5 pv/visitor). Real usage. **(Medium)**
4. **Reddit drove launch** — 23 visitors (20%), all around Apr 4 spike. **(High)**
5. **Google organic anemic** — 5 visitors in 14 days. Highest intent (3 went to /connect or /audit). **(High)**
6. **47% "direct" traffic** — UTM params not tagged on outbound links. Flying blind on attribution. **(High)**

**Actions:**
1. Build SEO content for 'Google Ads MCP', 'Google Ads AI agent' — organic is highest-intent but only 5 visitors
2. Post weekly to r/PPC, r/googleads, r/ClaudeAI — Reddit is the only proven acquisition channel
3. Skip international targeting — US/WA-state shows product-market fit, non-US bounces
4. Add UTM params to all outbound links — 47% "direct" = blind attribution
